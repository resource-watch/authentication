import axios from 'axios';
import config from 'config';
import logger from 'logger';
import { v4 as uuidv4 } from 'uuid';
import crypto from 'crypto';
import { isEqual } from 'lodash';

import UserModel, {IUser, UserDocument} from 'models/user.model';
import UserTempModel, { UserTempDocument} from 'models/user-temp.model';
import RenewModel, {IRenew} from 'models/renew.model';
import {
    OktaCreateUserPayload, OktaOAuthProvider,
    OktaOAuthTokenPayload,
    OktaRequestHeaders,
    OktaUpdateUserPayload,
    OktaUpdateUserProtectedFieldsPayload,
    OktaUser
} from 'services/okta.interfaces';
import JWT, {SignOptions} from 'jsonwebtoken';
import Settings from 'services/settings.service';
import UnprocessableEntityError from 'errors/unprocessableEntity.error';
import UserNotFoundError from 'errors/userNotFound.error';
import {Context} from 'koa';
import {URL} from 'url';

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
            logger.info('[UserService] Error to generate token', e);
            return null;
        }
    }

    static async searchOktaUsers(query: Record<string, any>): Promise<OktaUser[]> {
        const search: string = OktaService.getOktaSearchCriteria(query);
        const { data }: { data: OktaUser[] } = await axios.get(`${config.get('okta.url')}/api/v1/users`, {
            headers: OktaService.getOktaRequestHeaders(),
            params: {
                ...(search && { search }),
                ...(query.limit && { limit: query.limit }),
                ...(query.after && { after: query.after }),
                ...(query.before && { before: query.before }),
            }
        });

        return data;
    }

    static async getUsers(apps: string[], query: Record<string, string>): Promise<IUser[]> {
        logger.info('[UserService] Get users with apps', apps);
        const limit: number = query['page[size]'] ? parseInt(query['page[size]'], 10) : 10;
        const before: string = query['page[before]'];
        const after: string = query['page[after]'];
        const search: string = OktaService.getOktaSearchCriteria({ ...query, apps });

        const { data }: { data: OktaUser[] } = await axios.get(`${config.get('okta.url')}/api/v1/users`, {
            headers: OktaService.getOktaRequestHeaders(),
            params: {
                limit,
                ...(search && { search }),
                ...(after && { after }),
                ...(before && { before }),
            }
        });

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

    static async updatePassword(token: string, newPassword: string): Promise<IUser> {
        logger.info('[OktaServices] Updating password');

        const renew: IRenew = await RenewModel.findOne({ token });
        if (!renew) {
            logger.info('[UserService] Token not found');
            return null;
        }

        return OktaService.updatePasswordForUser(renew.userId, newPassword);
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
        const { data }: { data: OktaUser } = await axios.get(
            `${config.get('okta.url')}/api/v1/users/${email}`,
            { headers: OktaService.getOktaRequestHeaders() }
        );

        return OktaService.convertOktaUserToIUser(data);
    }

    static async sendPasswordRecoveryEmail(email: string): Promise<void> {
        await axios.post(
            `${config.get('okta.url')}/api/v1/authn/recovery/password`,
            { username: email, 'factorType': 'EMAIL' },
            { headers: OktaService.getOktaRequestHeaders() }
        );

        const user: IUser = await OktaService.getOktaUserByEmail(email);

        // Store renew token in the DB - TODO is this still needed?
        await new RenewModel({
            userId: user.id,
            token: crypto.randomBytes(20).toString('hex'),
        }).save();
    }

    static async updatePasswordForUser(userId: string, password: string): Promise<IUser> {
        const oktaUser: OktaUser = await OktaService.getOktaUserById(userId);

        const { data }: { data: OktaUser } = await axios.put(
            `${config.get('okta.url')}/api/v1/users/${oktaUser.id}`,
            { credentials: { password: { value: password } } },
            { headers: OktaService.getOktaRequestHeaders() }
        );

        return OktaService.convertOktaUserToIUser(data);
    }

    static async login(username: string, password: string): Promise<IUser> {
        const { data } = await axios.post(
            `${config.get('okta.url')}/api/v1/authn`,
            { username, password },
            { headers: OktaService.getOktaRequestHeaders() }
        );

        return OktaService.getOktaUserByEmail(data._embedded.user.profile.login);
    }

    static async createUserWithoutPassword(payload: OktaCreateUserPayload): Promise<IUser> {
        const { data }: { data: OktaUser } = await axios.post(
            `${config.get('okta.url')}/api/v1/users?activate=false`,
            {
                profile: {
                    firstName: 'RW API',
                    lastName: 'User',
                    displayName: payload.name || '',
                    email: payload.email,
                    login: payload.email,
                    legacyId: uuidv4(),
                    provider: 'local',
                    role: payload.role || 'USER',
                    apps: payload.apps || [],
                    photo: payload.photo || null,
                }
            },
            { headers: OktaService.getOktaRequestHeaders() }
        );

        await axios.post(
            `${config.get('okta.url')}/api/v1/users/${data.id}/lifecycle/activate?sendEmail=true`,
            {},
            { headers: OktaService.getOktaRequestHeaders() }
        );

        return OktaService.convertOktaUserToIUser(data);
    }

    static async updateUser(id: string, payload: OktaUpdateUserPayload): Promise<IUser> {
        const user: OktaUser = await OktaService.getOktaUserById(id);

        const { data }: { data: OktaUser } = await axios.post(
            `${config.get('okta.url')}/api/v1/users/${user.id}`,
            { profile: payload },
            { headers: OktaService.getOktaRequestHeaders() }
        );

        return OktaService.convertOktaUserToIUser(data);
    }

    static async updateUserProtectedFields(
        oktaId: string,
        payload: OktaUpdateUserProtectedFieldsPayload
    ): Promise<OktaUser> {
        const { data }: { data: OktaUser } = await axios.post(
            `${config.get('okta.url')}/api/v1/users/${oktaId}`,
            { profile: payload },
            { headers: OktaService.getOktaRequestHeaders() }
        );

        return data;
    }

    static async deleteUser(id: string): Promise<IUser> {
        const user: OktaUser = await OktaService.getOktaUserById(id);

        await axios.delete(
            `${config.get('okta.url')}/api/v1/users/${user.id}`,
            { headers: OktaService.getOktaRequestHeaders() }
        );

        return OktaService.convertOktaUserToIUser(user);
    }

    static getOAuthRedirect(state: string, provider: OktaOAuthProvider): string {
        const oktaOAuthURL: URL = new URL(`${config.get('okta.url')}/oauth2/default/v1/authorize`);
        oktaOAuthURL.searchParams.append('client_id', config.get('okta.clientId'));
        oktaOAuthURL.searchParams.append('response_type', 'code');
        oktaOAuthURL.searchParams.append('response_mode', 'query');
        oktaOAuthURL.searchParams.append('scope', 'openid profile email');
        oktaOAuthURL.searchParams.append('redirect_uri', 'http://localhost:9050/auth/authorization-code/callback');
        oktaOAuthURL.searchParams.append('idp', config.get(`okta.gfw.${provider}.idp`));
        oktaOAuthURL.searchParams.append('state', state);
        return oktaOAuthURL.href;
    }

    static async getOktaUserByOktaId(id: string): Promise<OktaUser> {
        const { data }: { data: OktaUser } = await axios.get(
            `${config.get('okta.url')}/api/v1/users/${id}`,
            { headers: OktaService.getOktaRequestHeaders() }
        );

        return data;
    }

    static async getUserForAuthorizationCode(code: string): Promise<OktaUser> {
        const basicAuth: string = Buffer.from('0oa3ynlf5ODYGyYeo5d6:MJG3p-Rb9Kt_A5lFB34M879Etap3GpbJ02txMBCG').toString('base64');
        const { data } = await axios.post(
            `${config.get('okta.url')}/oauth2/default/v1/token?grant_type=authorization_code&code=${code}&redirect_uri=http://localhost:9050/auth/authorization-code/callback`,
            {
                grant_type: 'authorization_code',
                redirect_uri: `http://localhost:9050/auth/authorization-code/callback`,
                code,
            },
            {
                headers: {
                    Accept: 'application/json',
                    'Content-Type': 'application/x-www-form-urlencoded',
                    Authorization: `Basic ${basicAuth}`
                }
            },
        );

        const { uid } = JWT.decode(data.access_token) as OktaOAuthTokenPayload;
        return OktaService.getOktaUserByOktaId(uid);
    }

    private static getOktaSearchCriteria(query: Record<string, any>): string {
        logger.debug('[UserService] getOktaSearchCriteria Object.keys(query)', Object.keys(query));

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

    private static getOktaRequestHeaders(): OktaRequestHeaders {
        return {
            'Accept': 'application/json',
            'Content-Type': 'application/json',
            'Authorization': `SSWS ${config.get('okta.apiKey')}`,
        };
    }

}
