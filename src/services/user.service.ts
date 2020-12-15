import { Context } from "koa";
import JWT, { SignOptions } from 'jsonwebtoken';
import bcrypt from 'bcrypt';
import crypto from 'crypto';
import mongoose, { PaginateResult, Types } from 'mongoose';
import { isEqual } from 'lodash';

import logger from 'logger';
import MailService from 'services/mail.service';
import UnprocessableEntityError from 'errors/unprocessableEntity.error';
import UserModel, { IUser, UserDocument } from 'models/user.model';
import RenewModel, { IRenew } from 'models/renew.model';
import UserTempModel, { IUserTemp } from 'models/user-temp.model';
import Settings from "services/settings.service";

const { ObjectId } = mongoose.Types;

export default class UserService {

    private static getFilteredQuery(query: Record<string, any>): Record<string, any> {
        const allowedSearchFields: string[] = ['name', 'provider', 'email', 'role'];
        logger.info('[UserService] getFilteredQuery');
        logger.debug('[UserService] getFilteredQuery Object.keys(query)', Object.keys(query));
        const filteredSearchFields: string[] = Object.keys(query).filter((param) => allowedSearchFields.includes(param));
        const filteredQuery: Record<string, any> = {};

        filteredSearchFields.forEach((param: string) => {
            // @ts-ignore
            switch (UserModel.schema.paths[param].instance) {

                case 'String':
                    filteredQuery[param] = {
                        $regex: query[param],
                        $options: 'i'
                    };
                    break;
                case 'Array':
                    if (query[param].indexOf('@') >= 0) {
                        filteredQuery[param] = {
                            $all: query[param].split('@').map((elem: string) => elem.trim())
                        };
                    } else {
                        filteredQuery[param] = {
                            $in: query[param].split(',').map((elem: string) => elem.trim())
                        };
                    }
                    break;
                case 'Mixed':
                    filteredQuery[param] = { $ne: null };
                    break;
                default:
                    filteredQuery[param] = query[param];

            }
        });
        logger.debug(filteredQuery);
        return filteredQuery;
    }

    static async createToken(user: UserDocument, saveInUser: boolean): Promise<string> {
        try {
            const options: SignOptions = {};
            if (Settings.getSettings().jwt.expiresInMinutes && Settings.getSettings().jwt.expiresInMinutes > 0) {
                options.expiresIn = Settings.getSettings().jwt.expiresInMinutes * 60;
            }

            const userData: UserDocument = await UserModel.findById(user.id);
            let token: string;

            if (userData) {
                const dataToken: Record<string, any> = {
                    id: userData._id,
                    role: userData.role,
                    provider: userData.provider,
                    email: userData.email,
                    extraUserData: userData.extraUserData,
                    createdAt: Date.now(),
                    photo: userData.photo,
                    name: userData.name
                };
                token = JWT.sign(dataToken, Settings.getSettings().jwt.secret, options);
                if (saveInUser) {
                    userData.userToken = token;
                    await userData.save();
                }
            } else {
                const dataToken: Record<string, any> = { ...user };
                delete dataToken.exp;
                dataToken.createdAt = new Date();
                token = JWT.sign(dataToken, Settings.getSettings().jwt.secret, options);
            }

            return token;
        } catch (e) {
            logger.info('[UserService] Error to generate token', e);
            return null;
        }
    }

    static async getUsers(app: string[], query: Record<string, string>): Promise<PaginateResult<UserDocument>> {
        logger.info('[UserService] Get users with app', app);

        const filteredQuery: Record<string, any> = UserService.getFilteredQuery({ ...query });

        if (app) {
            filteredQuery['extraUserData.apps'] = { $in: app };
        }

        const page: number = query['page[number]'] ? parseInt(query['page[number]'], 10) : 1;
        const limit: number = query['page[size]'] ? parseInt(query['page[size]'], 10) : 10;

        const paginationOptions: Record<string, any> = {
            page,
            limit,
            select: {
                __v: 0,
                password: 0,
                salt: 0,
                userToken: 0
            }
        };

        return UserModel.paginate(filteredQuery, paginationOptions);
    }

    static async getUser(conditions: Record<string, any>): Promise<UserDocument> {
        return UserModel.findOne(conditions).exec();
    }

    static async getUserById(id: string): Promise<UserDocument> {
        const isValidId: boolean = mongoose.Types.ObjectId.isValid(id);

        if (!isValidId) {
            logger.info(`[Auth Service - getUserById] - Invalid id ${id} provided`);
            throw new UnprocessableEntityError(`Invalid id ${id} provided`);
        }
        return UserModel.findById(id).select('-password -salt -userToken -__v').exec();
    }

    static async getUsersByIds(ids: string[] = []): Promise<UserDocument[]> {
        const newIds: Types.ObjectId[] = ids.filter(ObjectId.isValid).map((id) => new ObjectId(id));
        return UserModel.find({
            _id: {
                $in: newIds
            }
        }).select('-password -salt -userToken -__v').exec();
    }

    static async getIdsByRole(role: string): Promise<Types.ObjectId[]> {
        if (!['SUPERADMIN', 'ADMIN', 'MANAGER', 'USER'].includes(role)) {
            throw new UnprocessableEntityError(`Invalid role ${role} provided`);
        }

        const data: UserDocument[] = await UserModel.find({ role }).exec();
        return data.map((el) => el._id);
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

    static async createUser(data: IUser & { apps: string[]; callbackUrl: string }, generalConfig: Record<string, any>): Promise<IUserTemp> {
        const salt: string = bcrypt.genSaltSync();

        const apps: string[] = data.apps || [];

        const user: IUserTemp = await new UserTempModel({
            provider: 'local',
            email: data.email,
            role: 'USER',
            password: bcrypt.hashSync(data.password, salt),
            confirmationToken: crypto.randomBytes(20).toString('hex'),
            salt,
            extraUserData: { apps }
        }).save();

        logger.info('Sending mail');
        try {
            const mailService: MailService = new MailService();
            await mailService.setup();
            await mailService.sendConfirmationMail(
                {
                    email: user.email,
                    confirmationToken: user.confirmationToken,
                },
                [{ address: user.email }],
                generalConfig
            );
        } catch (err) {
            logger.info('Error', err);
            throw err;
        }

        return user;
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
        const exist: IUserTemp = await UserTempModel.findOne({ confirmationToken });
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
            const checkList: string[] = ['id', 'role', 'extraUserData', 'email'];

            const user: UserDocument = await UserModel.findById(payload.id);

            if (!user) {
                logger.info('[UserService] User ID in token does not match an existing user');

                return true;
            }

            checkList.forEach((property) => {
                if (!isEqual(user.get(property), payload[property])) {
                    logger.info(`[AuthService] ${property} in token does not match the database value - token value: "${payload[property]}" || database value: "${user.get(property)}" `);
                    isRevoked = true;
                }
            });
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

    static async migrateToUsernameAndPassword(user: UserDocument, email: string, password: string): Promise<UserDocument> {
        if (!user) {
            return null;
        }

        const salt: string = bcrypt.genSaltSync();

        user.provider = 'local';
        delete user.providerId;
        user.email = email;
        user.password = bcrypt.hashSync(password, salt);

        user.updatedAt = new Date();

        return user.save();
    }


}
