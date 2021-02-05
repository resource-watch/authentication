import config from 'config';
import logger from 'logger';
import { difference, isEqual } from 'lodash';

import { IUser } from 'models/user.model';
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
        logger.info('Checking if token is revoked');

        let isRevoked: boolean = false;

        if (payload.id === 'microservice') {
            return isRevoked;
        }


        // TODO: maybe add a validation on the token age, and only go out to OKTA if the token is older than X

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
            logger.info('[OktaService] User ID in token does not match an existing user');
            return true;
        }
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

    static async getOktaUserByEmail(email: string): Promise<IUser> {
        const user: OktaUser = await OktaApiService.getOktaUserByEmail(email);
        return OktaService.convertOktaUserToIUser(user);
    }

    static async sendPasswordRecoveryEmail(email: string): Promise<void> {
        await OktaApiService.postPasswordRecoveryEmail(email);
    }

    static async login(username: string, password: string): Promise<IUser> {
        const response: OktaSuccessfulLoginResponse = await OktaApiService.postLogin(username, password);
        return OktaService.getOktaUserByEmail(response._embedded.user.profile.login);
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

        // TODO: Remove hardcoded localhost

        const oktaOAuthURL: URL = new URL(`${config.get('okta.url')}/oauth2/default/v1/authorize`);
        oktaOAuthURL.searchParams.append('client_id', config.get('okta.clientId'));
        oktaOAuthURL.searchParams.append('response_type', 'code');
        oktaOAuthURL.searchParams.append('response_mode', 'query');
        oktaOAuthURL.searchParams.append('scope', 'openid profile email');
        oktaOAuthURL.searchParams.append('redirect_uri', 'http://localhost:9050/auth/authorization-code/callback');
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
