import config from 'config';
import logger from 'logger';
import { difference, isEqual } from 'lodash';

import {
    IUser,
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
import { v4 as uuidv4 } from 'uuid';
import mongoose from 'mongoose';
import CacheService from 'services/cache.service';

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

    static async getUserListForOffsetPagination(apps: string[], query: Record<string, any>): Promise<{
        data: IUser[],
        cursor: string,
    }> {
        logger.info('[OktaService] Getting user list using "offset" pagination strategy');
        let iterator: number = 1;
        let users: OktaUser[] = [];
        let pageAfterCursor: string = null;

        let pageNumber: number = 1;
        let limit: number = 10;

        if (query.page) {
            // tslint:disable-next-line:variable-name
            const { number, size } = (query.page as Record<string, any>);
            pageNumber = query.page && number ? parseInt(number, 10) : 1;
            limit = query.page && size ? parseInt(size, 10) : 10;
        }

        while (iterator <= pageNumber) {

            const { data, cursor } = await OktaApiService.getOktaUserListPaginatedResult(
                OktaService.getOktaSearchCriteria({ ...query, apps }),
                limit,
                pageAfterCursor,
                undefined,
            );

            users = data;
            pageAfterCursor = cursor;
            iterator++;
        }

        return {
            data: users.map(OktaService.convertOktaUserToIUser),
            cursor: pageAfterCursor,
        };
    }

    static async getUserListForCursorPagination(apps: string[], query: Record<string, any>): Promise<{
        data: IUser[],
        cursor: string,
    }> {
        logger.info('[OktaService] Getting user list using "cursor" pagination strategy');

        let size: number = 10;
        let after: string = null;
        let before: string = null;

        if (query.page) {
            size = query.page && query.page.size ? parseInt(query.page.size, 10) : 10;
            after = query.page && query.page.after ? query.page.after : null;
            before = query.page && query.page.before ? query.page.before : null;
        }

        const { data, cursor } = await OktaApiService.getOktaUserListPaginatedResult(
            OktaService.getOktaSearchCriteria({ ...query, apps }),
            size,
            after,
            before,
        );

        return {
            data: data.map(OktaService.convertOktaUserToIUser),
            cursor,
        };
    }

    static async getUserById(id: string): Promise<IUser> {
        return OktaService.convertOktaUserToIUser(await OktaService.getOktaUserById(id));
    }

    /**
     * @deprecated This is a performance nightmare as it needs to load all of Okta's DB
     */
    static async getUsersByIds(ids: string[] = []): Promise<IUser[]> {
        const users: IUser[] = [];
        let shouldFetchMore: boolean = true;
        let pageAfterCursor: string;

        while (shouldFetchMore) {
            const { data, cursor } = await OktaApiService.getOktaUserListPaginatedResult(
                OktaService.getOktaSearchCriteria({ id: ids }),
                200,
                pageAfterCursor || undefined,
                undefined,
            );

            pageAfterCursor = cursor;

            data.forEach(user => users.push(OktaService.convertOktaUserToIUser(user)));
            pageAfterCursor = cursor;
            shouldFetchMore = !!cursor && data.length === 200;
        }

        return users;
    }

    /**
     * @deprecated This is a performance nightmare as it needs to load all of Okta's DB
     */
    static async getIdsByRole(role: string): Promise<string[]> {
        if (!['SUPERADMIN', 'ADMIN', 'MANAGER', 'USER'].includes(role)) {
            throw new UnprocessableEntityError(`Invalid role ${role} provided`);
        }

        const userIds: string[] = [];
        let shouldFetchMore: boolean = true;
        let pageAfterCursor: string;

        while (shouldFetchMore) {
            const { data, cursor } = await OktaApiService.getOktaUserListPaginatedResult(
                OktaService.getOktaSearchCriteria({ role }),
                200,
                pageAfterCursor || undefined,
                undefined,
            );

            pageAfterCursor = cursor;

            data.forEach(user => userIds.push(user.profile.legacyId));
            pageAfterCursor = cursor;
            shouldFetchMore = !!cursor && data.length === 200;
        }

        return userIds;
    }

    static async checkRevokedToken(ctx: Context, payload: JWTPayload): Promise<boolean> {
        logger.info('[OktaService] Checking if token is revoked');

        let isRevoked: boolean = false;

        if (payload.id === 'microservice') {
            return isRevoked;
        }

        try {
            // Try to find user information in cache (based on legacyId)
            let user: OktaUser = await CacheService.get(`okta-user-${payload.id}`);
            if (!user) {
                logger.info('[OktaService] User info not found in cache, storing...');

                // If not found in cache, fetch it from Okta and store it in cache
                user = await OktaService.getOktaUserByEmail(payload.email);
                user = await OktaService.setAndUpdateRequiredFields(user);
                await CacheService.set(`okta-user-${payload.id}`, user);
            }

            if (!isEqual(user.profile.legacyId, payload.id)) {
                logger.info(`[OktaService] "id" in token ("${payload.id}") does not match value obtained from Okta ("${user.profile.legacyId}")`);
                isRevoked = true;
            }

            if (!isEqual(user.profile.role, payload.role)) {
                logger.info(`[OktaService] "role" in token ("${payload.role}") does not match value obtained from Okta ("${user.profile.role}")`);
                isRevoked = true;
            }

            const tokenApps: string[] = payload.extraUserData?.apps?.sort();
            const userApps: string[] = user.profile.apps?.sort();
            if (!isEqual(tokenApps, userApps)) {
                logger.info(`[OktaService] "apps" in token ("${tokenApps}") does not match value obtained from Okta ("${userApps}")`);
                isRevoked = true;
            }

            if (!isEqual(user.profile.email, payload.email)) {
                logger.info(`[OktaService] "email" in token ("${payload.email}") does not match value obtained from Okta ("${user.profile.email}")`);
                isRevoked = true;
            }

            return isRevoked;
        } catch (err) {
            logger.error(err);
            return true;
        }
    }

    static async setAndUpdateRequiredFields(user: OktaUser): Promise<OktaUser> {
        // Check if user has required fields set - if not set, set them
        const updateData: OktaUpdateUserProtectedFieldsPayload = {};

        if (!user.profile.legacyId) {
            logger.info(`[OktaService - setAndUpdateRequiredFields] - Setting legacyId`);
            updateData.legacyId = new mongoose.Types.ObjectId().toString();
        }

        if (!user.profile.role) {
            logger.info(`[OktaService - setAndUpdateRequiredFields] - Setting role`);
            updateData.role = 'USER';
        }

        if (!user.profile.apps) {
            logger.info(`[OktaService - setAndUpdateRequiredFields] - Setting apps`);
            updateData.apps = [];
        }

        // If updateData is not empty, trigger user update
        if (Object.keys(updateData).length > 0) {
            logger.info('[OktaService] Setting required fields for user with Okta ID: ', user.id);
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
        logger.debug(`[OktaService - getOktaUserByEmail] Getting Okta user by email ${email}`);
        return OktaApiService.getOktaUserByEmail(email);
    }

    static async sendPasswordRecoveryEmail(email: string): Promise<void> {
        logger.debug(`[OktaService - sendPasswordRecoveryEmail] Sending password recovery email for email ${email}`);
        await OktaApiService.postPasswordRecoveryEmail(email);
    }

    static async login(username: string, password: string): Promise<IUser> {
        const response: OktaSuccessfulLoginResponse = await OktaApiService.postLogin(username, password);
        const user: OktaUser = await OktaService.getOktaUserByEmail(response._embedded.user.profile.login);
        return OktaService.convertOktaUserToIUser(user);
    }

    static async logoutUser(user: IUser): Promise<void> {
        const oktaUser: OktaUser = await OktaService.getOktaUserById(user.id);
        return OktaApiService.deleteUserSession(oktaUser.id);
    }

    static async createUserWithoutPassword(payload: OktaCreateUserPayload, sendEmail: boolean = true): Promise<IUser> {
        const newUser: OktaUser = await OktaApiService.postUser(payload);
        await OktaApiService.postUserActivate(newUser.id, sendEmail);
        return OktaService.convertOktaUserToIUser(newUser);
    }

    static async updateUser(id: string, payload: OktaUpdateUserPayload): Promise<IUser> {
        const user: OktaUser = await OktaService.getOktaUserById(id);
        const updatedUser: OktaUser = await OktaApiService.postUserByOktaId(user.id, payload);
        await CacheService.invalidate(user);
        return OktaService.convertOktaUserToIUser(updatedUser);
    }

    static async updateUserProtectedFields(oktaId: string, payload: OktaUpdateUserProtectedFieldsPayload): Promise<OktaUser> {
        logger.debug(`[OktaService - updateUserProtectedFields] Updating user protected fields for oktaId ${oktaId}`);
        const user: OktaUser = await OktaApiService.postUserByOktaId(oktaId, payload);
        await CacheService.invalidate(user);
        return user;
    }

    static async deleteUser(id: string): Promise<IUser> {
        const user: OktaUser = await OktaService.getOktaUserById(id);
        await OktaService.deleteUserByOktaId(user.id);
        await CacheService.invalidate(user);
        return OktaService.convertOktaUserToIUser(user);
    }

    static async deleteUserByOktaId(id: string): Promise<void> {
        await OktaApiService.deleteUserByOktaId(id);
        try {
            await OktaApiService.getOktaUserById(id);
            return await OktaApiService.deleteUserByOktaId(id);
        } catch (err) {
            if (err.message === 'Request failed with status code 404') {
                logger.info(`User with id ${id} deactivated prior to being deleted, moving on...`);
                return;
            }

            logger.error('User deletion - Error occurred while loading the deactivated user: ', err);
            throw err;
        }
    }

    static async updateUserWithFakeEmailDataIfExisting(user: OktaUser): Promise<OktaUser> {
        logger.info(`[OktaService - updateUserWithFakeEmailDataIfExisting] - Running for user with email ${user.profile.email}`);

        // Logic does not apply in this case
        if (user.profile.legacyId || !user.profile.provider || !user.profile.providerId) {
            logger.info(`[OktaService - updateUserWithFakeEmailDataIfExisting] - Logic does not apply for user, moving on...`);
            return user;
        }

        // Logic for matching users without email
        try {
            // Try to find existing user in Okta with fake email
            const fakeUser: OktaUser = await OktaService.getOktaUserByEmail(`${user.profile.providerId}@${user.profile.provider}.com`);

            logger.info(`[OktaService - updateUserWithFakeEmailDataIfExisting] - Fake user exists, update current user with the profile attrs from the fake user`);
            // Fake user exists, update current user with the profile attrs from the fake user
            const updatedUser: OktaUser = await OktaService.updateUserProtectedFields(user.id, {
                legacyId: fakeUser.profile.legacyId,
                apps: fakeUser.profile.apps,
                role: fakeUser.profile.role,
            });

            // Delete the fake user account (deleting twice since first time it only deactivates the user)
            await OktaService.deleteUserByOktaId(fakeUser.id);

            return updatedUser;
        } catch (err) {
            if (err.message === 'Request failed with status code 404') {
                logger.info(`Fake user ${user.profile.providerId}@${user.profile.provider}.com not found, moving on...`);
                return user;
            }

            logger.error('Error occurred while matching user with fake email account: ', err);
            throw err;
        }
    }

    static getOAuthRedirect(provider: OktaOAuthProvider): string {
        const state: string = uuidv4();
        const oktaOAuthURL: URL = new URL(`${config.get('okta.url')}/oauth2/default/v1/authorize`);
        oktaOAuthURL.searchParams.append('client_id', config.get('okta.clientId'));
        oktaOAuthURL.searchParams.append('response_type', 'code');
        oktaOAuthURL.searchParams.append('response_mode', 'query');
        oktaOAuthURL.searchParams.append('scope', 'openid profile email');
        oktaOAuthURL.searchParams.append('redirect_uri', `${config.get('server.publicUrl')}/auth/authorization-code/callback`);
        oktaOAuthURL.searchParams.append('idp', config.get(`okta.${provider}IdP`));
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

    private static getOktaSearchCriteria(query: Record<string, any>): string {
        logger.debug('[OktaService] getOktaSearchCriteria JSON.stringify(query)', JSON.stringify(query));

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

        const finalSearchCriteria: string = searchCriteria.filter(el => el !== '').join(' and ');
        logger.debug('[OktaService] finalSearchCriteria: ', finalSearchCriteria);
        return finalSearchCriteria;
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
