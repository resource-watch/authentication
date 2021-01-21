import { Context } from "koa";
import JWT, { SignOptions } from 'jsonwebtoken';
import bcrypt from 'bcrypt';
import crypto from 'crypto';
import mongoose from 'mongoose';
import { isEqual } from 'lodash';

import logger from 'logger';
import MailService from 'services/mail.service';
import UnprocessableEntityError from 'errors/unprocessableEntity.error';
import UserModel, { IUser, UserDocument } from 'models/user.model';
import RenewModel, { IRenew } from 'models/renew.model';
import UserTempModel, {IUserTemp, UserTempDocument} from 'models/user-temp.model';
import Settings from "services/settings.service";
import OktaService from "services/okta.service";
import { OktaUser } from "services/okta.interfaces";

export interface PaginatedIUserResult {
    docs: IUser[];
    limit: number;
}

export default class OktaUserService {

    static createToken(user: IUser): string {
        try {
            const options: SignOptions = {};
            if (Settings.getSettings().jwt.expiresInMinutes && Settings.getSettings().jwt.expiresInMinutes > 0) {
                options.expiresIn = Settings.getSettings().jwt.expiresInMinutes * 60;
            }

            return JWT.sign({
                id: user.id,
                role: user.role,
                provider: user.provider,
                email: user.email,
                extraUserData: user.extraUserData,
                createdAt: Date.now(),
                photo: user.photo,
                name: user.name
            }, Settings.getSettings().jwt.secret, options);
        } catch (e) {
            logger.info('[UserService] Error to generate token', e);
            return null;
        }
    }

    static async getUsers(apps: string[], query: Record<string, string>): Promise<PaginatedIUserResult> {
        logger.info('[UserService] Get users with apps', apps);
        const limit: number = query['page[size]'] ? parseInt(query['page[size]'], 10) : 10;
        const before: string = query['page[before]'];
        const after: string = query['page[after]'];
        const search: string = OktaService.getOktaSearchCriteria({ ...query, apps });
        const users: OktaUser[] = await OktaService.getUsers(search, { limit, before, after });
        return { docs: users.map(OktaService.convertOktaUserToIUser), limit };
    }

    static async getUser(conditions: Record<string, any>): Promise<UserDocument> {
        return UserModel.findOne(conditions).exec();
    }

    static async getUserById(id: string): Promise<IUser> {
        try {
            const search: string = OktaService.getOktaSearchCriteria({ id });
            const users: OktaUser[] = await OktaService.getUsers(search, { limit: 1 });
            return OktaService.convertOktaUserToIUser(users[0]);
        } catch (err) {
            logger.error('Error getting user by ID from Okta Users API: ');
            logger.error(err);
            return null;
        }
    }

    static async getUsersByIds(ids: string[] = []): Promise<IUser[]> {
        const search: string = OktaService.getOktaSearchCriteria({ id: ids });
        const users: OktaUser[] = await OktaService.getUsers(search, { limit: 100 });
        return users.map(OktaService.convertOktaUserToIUser);
    }

    static async getIdsByRole(role: string): Promise<string[]> {
        if (!['SUPERADMIN', 'ADMIN', 'MANAGER', 'USER'].includes(role)) {
            throw new UnprocessableEntityError(`Invalid role ${role} provided`);
        }

        const search: string = OktaService.getOktaSearchCriteria({ role });
        const users: OktaUser[] = await OktaService.getUsers(search, { limit: 100 });
        return users.map(OktaService.convertOktaUserToIUser).map((el) => el.id);
    }

    static async updateUser(id: string, data: UserDocument, requestUser: UserDocument): Promise<UserDocument> {
        const isValidId: boolean = mongoose.Types.ObjectId.isValid(id);

        if (!isValidId) {
            logger.info(`[Auth Service - updateUserMe] Invalid id ${id} provided`);
            throw new UnprocessableEntityError(`Invalid id ${id} provided`);
        }

        const user: UserDocument = await UserModel.findById(id).exec();
        if (!user) {
            return null;
        }

        if (data.name) {
            user.name = data.name;
        }
        if (data.photo !== undefined) {
            user.photo = data.photo;
        }

        if (requestUser.role === 'ADMIN') {
            if (data.role) {
                user.role = data.role;
            }
            if (data.extraUserData?.apps) {
                user.extraUserData = { ...user.extraUserData, apps: data.extraUserData.apps };
            }
        }

        user.updatedAt = new Date();

        return user.save();
    }

    static async deleteUser(id: string): Promise<UserDocument> {
        const isValidId: boolean = mongoose.Types.ObjectId.isValid(id);

        if (!isValidId) {
            logger.info(`[Auth Service - deleteUser] Invalid id ${id} provided`);
            throw new UnprocessableEntityError(`Invalid id ${id} provided`);
        }

        let user: UserDocument;
        try {
            user = await UserModel.findById(id).exec();
        } catch (e) {
            logger.info(`[Auth Service - deleteUser] Failed to load user by id '${id}'`);
            return null;
        }

        if (!user) {
            logger.info(`[Auth Service - deleteUser] No user found with id '${id}'`);
            return null;
        }

        return user.deleteOne();
    }

    static async emailExists(email: string): Promise<boolean> {
        const exist: UserDocument = await UserModel.findOne({ email });
        const existTemp: IUserTemp = await UserTempModel.findOne({ email });
        return !!(exist || existTemp);
    }

    static async createUserWithoutPassword(data: IUser & { apps: string[]; callbackUrl: string }, generalConfig: Record<string, any>): Promise<void> {
        const salt: string = bcrypt.genSaltSync();
        const pass: string = crypto.randomBytes(8).toString('hex');
        const user: IUserTemp = await new UserTempModel({
            provider: 'local',
            email: data.email,
            role: data.role,
            password: bcrypt.hashSync(pass, salt),
            confirmationToken: crypto.randomBytes(20).toString('hex'),
            salt,
            extraUserData: data.extraUserData,
        }).save();

        logger.info('Sending mail');
        try {
            const mailService: MailService = new MailService();
            await mailService.setup();
            await mailService.sendConfirmationMailWithPassword(
                {
                    email: user.email,
                    confirmationToken: user.confirmationToken,
                    password: pass,
                    callbackUrl: data.callbackUrl || ''
                },
                [{ address: user.email }],
                generalConfig
            );
        } catch (err) {
            logger.info('Error', err);
            throw err;
        }

    }

    static async confirmUser(confirmationToken: string): Promise<UserDocument> {
        const exist: UserTempDocument = await UserTempModel.findOne({ confirmationToken });
        if (!exist) {
            return null;
        }
        const user: UserDocument = await new UserModel({
            email: exist.email,
            password: exist.password,
            salt: exist.salt,
            role: exist.role,
            extraUserData: exist.extraUserData,
            provider: 'local',
        }).save();
        await exist.remove();
        delete user.password;
        delete user.salt;

        return user;
    }

    static async getRenewModel(token: string): Promise<IRenew> {
        logger.info('[UserService]obtaining renew model of token', token);
        return RenewModel.findOne({ token });
    }

    static async sendResetMail(email: string, generalConfig: Record<string, any>, originApp: string): Promise<IRenew> {
        logger.info('[UserService] Generating token to email', email);

        const user: UserDocument = await UserModel.findOne({ email });
        if (!user) {
            logger.info('[UserService] User not found');
            return null;
        }

        const renew: IRenew = await new RenewModel({
            userId: user._id,
            token: crypto.randomBytes(20).toString('hex'),
        }).save();

        const mailService: MailService = new MailService();
        await mailService.setup();
        await mailService.sendRecoverPasswordMail(
            {
                token: renew.token,
            },
            [{ address: user.email }],
            generalConfig,
            originApp
        );

        return renew;
    }

    static async updatePassword(token: string, newPassword: string): Promise<UserDocument> {
        logger.info('[UserService] Updating password');
        const renew: IRenew = await RenewModel.findOne({ token });
        if (!renew) {
            logger.info('[UserService] Token not found');
            return null;
        }
        const user: UserDocument = await UserModel.findById(renew.userId);
        if (!user) {
            logger.info('[UserService] User not found');
            return null;
        }
        const salt: string = bcrypt.genSaltSync();
        user.password = bcrypt.hashSync(newPassword, salt);
        user.salt = salt;
        await user.save();
        return user;
    }

    static async checkRevokedToken(ctx: Context, payload: Record<string, any>): Promise<boolean> {
        logger.info('Checking if token is revoked');

        let isRevoked: boolean = false;
        if (payload.id !== 'microservice') {
            try {
                const user: IUser = await OktaService.getOktaUserByEmail(payload.email);

                if (!isEqual(user.id, payload.id)) {
                    logger.info(`[AuthService] "id" in token does not match expected value`);
                    isRevoked = true;
                }

                if (!isEqual(user.role, payload.role)) {
                    logger.info(`[AuthService] "role" in token does not match expected value`);
                    isRevoked = true;
                }

                if (!isEqual(user.extraUserData, payload.extraUserData)) {
                    logger.info(`[AuthService] "extraUserData" in token does not match expected value`);
                    isRevoked = true;
                }

                if (!isEqual(user.email, payload.email)) {
                    logger.info(`[AuthService] "email" in token does not match expected value`);
                    isRevoked = true;
                }

                return isRevoked;
            } catch (err) {
                logger.error(err);
                logger.info('[UserService] User ID in token does not match an existing user');
                return true;
            }
        }

        return isRevoked;
    }

    static async updateApplicationsForUser(id: string, applications: string[]): Promise<UserDocument> {
        logger.info('[UserService] Searching user with id ', id, applications);
        const user: UserDocument = await UserModel.findById(id);
        if (!user) {
            logger.info('[UserService] User not found');
            return null;
        }
        if (!user.extraUserData) {
            user.extraUserData = {
                apps: []
            };
        } else {
            user.extraUserData = { ...user.extraUserData };
        }
        for (let i: number = 0, { length } = applications; i < length; i += 1) {
            if (user.extraUserData.apps.indexOf(applications[i]) === -1) {
                user.extraUserData.apps.push(applications[i].toLowerCase());
            }
        }
        user.markModified('extraUserData');
        await user.save();
        return user;
    }

    static async migrateToUsernameAndPassword(user: IUser, email: string, password: string): Promise<UserDocument> {
        if (!user) {
            return null;
        }
        const dbUser: UserDocument = await OktaUserService.getUser({ _id: user.id });

        const salt: string = bcrypt.genSaltSync();

        dbUser.provider = 'local';
        delete dbUser.providerId;
        dbUser.email = email;
        dbUser.password = bcrypt.hashSync(password, salt);

        dbUser.updatedAt = new Date();

        return dbUser.save();
    }

}
