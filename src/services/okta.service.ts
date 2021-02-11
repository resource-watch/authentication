import config from 'config';
import logger from 'logger';
import { difference, isEqual } from 'lodash';

import {IUser, UserDocument} from 'models/user.model';
import {
    JWTPayload,
    OktaCreateUserPayload,
    OktaOAuthProvider,
    OktaSuccessfulLoginResponse,
    OktaUpdateUserPayload,
    OktaUpdateUserProtectedFieldsPayload,
    OktaUser,
} from 'services/okta.interfaces';
import JWT, { SignOptions } from 'jsonwebtoken';
import Settings from 'services/settings.service';
import UnprocessableEntityError from 'errors/unprocessableEntity.error';
import UserNotFoundError from 'errors/userNotFound.error';
import { Context } from 'koa';
import { URL } from 'url';
import OktaApiService from 'services/okta.api.service';
import {v4 as uuidv4} from 'uuid';

export default class OktaService {

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
            logger.info('[OktaService] Error to generate token', e);
            return null;
        }
    }

    static async searchOktaUsers(query: Record<string, any>): Promise<OktaUser[]> {
        return OktaApiService.getOktaUserList(
            OktaService.getOktaSearchCriteria(query),
            query.limit,
            query.after,
            query.before
        );
    }

    static async getUsers(apps: string[], query: Record<string, string>): Promise<IUser[]> {
        logger.info('[OktaService] Get users with apps', apps);

        const data: OktaUser[] = await OktaApiService.getOktaUserList(
            OktaService.getOktaSearchCriteria({ ...query, apps }),
            query['page[size]'] ? query['page[size]'] : '10',
            query['page[after]'],
            query['page[before]'],
        );

        return data.map(OktaService.convertOktaUserToIUser);
    }

    static async getUserById(id: string): Promise<IUser> {
        return OktaService.convertOktaUserToIUser(await OktaService.getOktaUserById(id));
    }

    static async getUsersByIds(ids: string[] = []): Promise<IUser[]> {
        const users: OktaUser[] = await OktaService.searchOktaUsers({ limit: 100, id: ids });
        return users.map(OktaService.convertOktaUserToIUser);
    }

    static async getIdsByRole(role: string): Promise<string[]> {
        if (!['SUPERADMIN', 'ADMIN', 'MANAGER', 'USER'].includes(role)) {
            throw new UnprocessableEntityError(`Invalid role ${role} provided`);
        }

        const users: OktaUser[] = await OktaService.searchOktaUsers({ limit: 100, role });
        return users.map(OktaService.convertOktaUserToIUser).map((el) => el.id);
    }

    static async checkRevokedToken(ctx: Context, payload: JWTPayload): Promise<boolean> {
        logger.info('[OktaService] Checking if token is revoked');

        let isRevoked: boolean = false;

        if (payload.id === 'microservice') {
            return isRevoked;
        }

        try {
            // TODO: maybe add a validation on the token age, and only go out to OKTA if the token is older than X
            const user: OktaUser = await OktaService.getOktaUserByEmail(payload.email);
            const updatedUser: OktaUser = await OktaService.setAndUpdateRequiredFields(user);
            const userToCheck: IUser = OktaService.convertOktaUserToIUser(updatedUser);

            if (!isEqual(userToCheck.id, payload.id)) {
                logger.info(`[OktaService] "id" in token does not match expected value`);
                isRevoked = true;
            }

            if (!isEqual(userToCheck.role, payload.role)) {
                logger.info(`[OktaService] "role" in token does not match expected value`);
                isRevoked = true;
            }

            if (!isEqual(userToCheck.extraUserData, payload.extraUserData)) {
                logger.info(`[OktaService] "extraUserData" in token does not match expected value`);
                isRevoked = true;
            }

            if (!isEqual(userToCheck.email, payload.email)) {
                logger.info(`[OktaService] "email" in token does not match expected value`);
                isRevoked = true;
            }

            return isRevoked;
        } catch (err) {
            logger.error(err);
            return true;
        }
    }

    static async setAndUpdateRequiredFields(user: OktaUser): Promise<OktaUser> {
        logger.info('[OktaService] Setting required fields for user with Okta ID: ', user.id);

        // Check if user has required fields set - if not set, set them
        const updateData: OktaUpdateUserProtectedFieldsPayload = {};

        if (!user.profile.legacyId) {
            updateData.legacyId = uuidv4();
        }

        if (!user.profile.role) {
            updateData.role = 'USER';
        }

        if (!user.profile.apps) {
            updateData.apps = [];
        }

        // If updateData is not empty, trigger user update
        if (Object.keys(updateData).length > 0) {
            return OktaService.updateUserProtectedFields(user.id, updateData);
        }

        return user;
    }

    static async updateApplicationsForUser(id: string, newApps: string[]): Promise<IUser> {
        logger.info('[OktaService] Searching user with id ', id, newApps);
        let oktaUser: OktaUser = await OktaService.getOktaUserById(id);

        if (difference(newApps, oktaUser.profile.apps).length !== 0) {
            oktaUser = await OktaService.updateUserProtectedFields(oktaUser.id, { apps: newApps });
        }

        return OktaService.convertOktaUserToIUser(oktaUser);
    }

    static async getOktaUserById(id: string): Promise<OktaUser> {
        const [user] = await OktaService.searchOktaUsers({ limit: 1, id });
        if (!user) {
            throw new UserNotFoundError();
        }

        return user;
    }

    static async findOktaUserByProviderId(provider: OktaOAuthProvider, providerId: string): Promise<OktaUser> {
        const [user] = await OktaService.searchOktaUsers({ limit: 1, provider, providerId });
        return user || null;
    }

    static async getOktaUserByEmail(email: string): Promise<OktaUser> {
        return OktaApiService.getOktaUserByEmail(email);
    }

    static async sendPasswordRecoveryEmail(email: string): Promise<void> {
        await OktaApiService.postPasswordRecoveryEmail(email);
    }

    static async login(username: string, password: string): Promise<IUser> {
        const response: OktaSuccessfulLoginResponse = await OktaApiService.postLogin(username, password);
        const user: OktaUser = await OktaService.getOktaUserByEmail(response._embedded.user.profile.login);
        return OktaService.convertOktaUserToIUser(user);
    }

    static async createUserWithoutPassword(payload: OktaCreateUserPayload): Promise<IUser> {
        const newUser: OktaUser = await OktaApiService.postUser(payload);
        await OktaApiService.postUserActivationEmail(newUser.id);
        return OktaService.convertOktaUserToIUser(newUser);
    }

    static async updateUser(id: string, payload: OktaUpdateUserPayload): Promise<IUser> {
        const user: OktaUser = await OktaService.getOktaUserById(id);
        const updatedUser: OktaUser = await OktaApiService.postUserByOktaId(user.id, payload);
        return OktaService.convertOktaUserToIUser(updatedUser);
    }

    static async updateUserProtectedFields(
        oktaId: string,
        payload: OktaUpdateUserProtectedFieldsPayload
    ): Promise<OktaUser> {
        return OktaApiService.postUserByOktaId(oktaId, payload);
    }

    static async deleteUser(id: string): Promise<IUser> {
        const user: OktaUser = await OktaService.getOktaUserById(id);
        await OktaApiService.deleteUserByOktaId(user.id);
        return OktaService.convertOktaUserToIUser(user);
    }

    static getOAuthRedirect(provider: OktaOAuthProvider, application: string, state: string): string {
        const oktaOAuthURL: URL = new URL(`${config.get('okta.url')}/oauth2/default/v1/authorize`);
        oktaOAuthURL.searchParams.append('client_id', config.get('okta.clientId'));
        oktaOAuthURL.searchParams.append('response_type', 'code');
        oktaOAuthURL.searchParams.append('response_mode', 'query');
        oktaOAuthURL.searchParams.append('scope', 'openid profile email');
        oktaOAuthURL.searchParams.append('redirect_uri', `${config.get('server.publicUrl')}/auth/authorization-code/callback`);
        oktaOAuthURL.searchParams.append('idp', config.get(`okta.${application}.${provider}.idp`));
        oktaOAuthURL.searchParams.append('state', state);
        return oktaOAuthURL.href;
    }

    static async getOktaUserByOktaId(id: string): Promise<OktaUser> {
        return OktaApiService.getOktaUserById(id);
    }

    static async getUserForAuthorizationCode(code: string): Promise<OktaUser> {
        const oktaId: string = await OktaApiService.postOAuthToken(code);
        return OktaService.getOktaUserByOktaId(oktaId);
    }

    static async migrateToUsernameAndPassword(user: OktaUser, email: string, password: string): Promise<IUser> {
        if (!user) {
            return null;
        }

        const updatedUser: OktaUser = await OktaApiService.postUserProtectedFieldsByOktaId(user.id, {
            provider: OktaOAuthProvider.LOCAL,
            providerId: null,
            email,
            password,
        });

        return OktaService.convertOktaUserToIUser(updatedUser);
    }

    /**
     * Weird logic to find user name...
     * TODO: in the future, deprecate "name" in favour of "firstName" + "lastName" and remove this
     */
    static findUserName(body: Record<string, any>): { firstName: string, lastName: string, name: string } {
        if (body?.firstName && body?.lastName) {
            return { firstName: body.firstName, lastName: body.lastName, name: `${body.firstName} ${body.lastName}` };
        }

        if (body?.name && body?.name.split(' ').length > 1) {
            return { firstName: body.name.split(' ')[0], lastName: body.name.split(' ').slice(1).join(' '), name: body.name };
        }

        return { firstName: 'RW API', lastName: 'USER', name: 'RW API USER' };
    }

    private static getOktaSearchCriteria(query: Record<string, any>): string {
        logger.debug('[OktaService] getOktaSearchCriteria Object.keys(query)', Object.keys(query));

        const searchCriteria: string[] = [];
        Object.keys(query)
            .filter((param) => ['id', 'name', 'provider', 'providerId', 'email', 'role', 'apps'].includes(param))
            .forEach((field: string) => {
                if (query[field]) {
                    if (Array.isArray(query[field])) {
                        searchCriteria.push(OktaService.getSearchCriteriaFromArray(field, query[field]));
                    } else {
                        searchCriteria.push(`(${OktaService.getOktaProfileFieldName(field)} ${OktaService.getOktaFieldOperator(field)} "${query[field]}")`);
                    }
                }
            });

        return searchCriteria.filter(el => el !== '').join(' and ');
    }

    static async createUserWithExistingPassword(user: UserDocument): Promise<boolean> {
        try {
            const userNameInfo: { lastName: string; firstName: string; name: string; } = OktaService.findUserName({ name: user.name });

            // User does not exist, create it in Okta
            await OktaApiService.postUserWithEncryptedPassword({
                profile: {
                    firstName: userNameInfo.firstName,
                    lastName: userNameInfo.lastName,
                    displayName: userNameInfo.name,
                    email: user.email,
                    login: user.email,
                    legacyId: user.id,
                    role: user.role,
                    apps: user.extraUserData.apps,
                    photo: user.photo,
                    provider: user.provider,
                    providerId: user.providerId,
                },
                credentials: {
                    password : {
                        hash: {
                            algorithm: 'BCRYPT',
                            workFactor: 10,
                            // Need to tweak the salt and password sent so that Okta knows how to deal with it :shrug:
                            salt: user.salt.replace('$2b$10$', ''),
                            value: user.password.replace(user.salt, ''),
                        }
                    }
                },
            });

            // User imported to Okta, log it and move on
            logger.info(`User with id ${user.id} imported successfully to Okta`);
            return true;
        } catch (err) {
            logger.error(`Error creating user with id ${user.id} in Okta`, err.response?.data);
            return false;
        }
    }

    static convertOktaUserToIUser(user: OktaUser): IUser {
        return {
            id: user.profile.legacyId,
            // @ts-ignore
            _id: user.profile.legacyId,
            email: user.profile.email,
            name: user.profile.displayName,
            photo: user.profile.photo,
            provider: user.profile.provider,
            providerId: user.profile.providerId,
            role: user.profile.role,
            extraUserData: { apps: user.profile.apps },
            createdAt: new Date(user.created),
            updatedAt: new Date(user.lastUpdated)
        };
    }

    private static getOktaProfileFieldName(userField: string): string {
        switch (userField) {
            case 'id':
                return 'profile.legacyId';

            case 'name':
                return 'profile.displayName';

            default:
                return `profile.${userField}`;
        }
    }

    private static getOktaFieldOperator(userField: string): string {
        switch (userField) {
            case 'id':
            case 'apps':
            case 'role':
            case 'provider':
            case 'providerId':
                return 'eq';

            default:
                return 'sw';
        }
    }

    private static getSearchCriteriaFromArray(field: string, array: string[]): string {
        if (!array || array.length <= 0) {
            return '';
        }

        return `(${array.map(item => `(${OktaService.getOktaProfileFieldName(field)} ${OktaService.getOktaFieldOperator(field)} "${item}")`).join(' or ')})`;
    }
}
