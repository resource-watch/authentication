import axios from 'axios';
import config from 'config';
import logger from 'logger';
import { v4 as uuidv4 } from 'uuid';
import crypto from 'crypto';

import { IUser } from 'models/user.model';
import { IUserTemp } from 'models/user-temp.model';
import RenewModel from 'models/renew.model';
import { OktaPaginationOptions, OktaRequestHeaders, OktaUser } from 'services/okta.interfaces';

export default class OktaService {

    static async getOktaUserById(id: string): Promise<OktaUser> {
        const search: string = OktaService.getOktaSearchCriteria({ id });
        const [user] = await OktaService.getUsers(search, { limit: 1 });

        if (!user) {
            throw new UserNotFoundError();
        }

        return user;
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

    static async signUpWithoutPassword(email: string, name: string): Promise<IUserTemp> {
        const { data }: { data: OktaUser } = await axios.post(
            `${config.get('okta.url')}/api/v1/users?activate=false`,
            {
                profile: {
                    firstName: 'RW API',
                    lastName: 'User',
                    displayName: name,
                    email,
                    login: email,
                    legacyId: uuidv4(),
                    'role': 'USER',
                    'apps': ['rw']
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

    static async login(username: string, password: string): Promise<IUser> {
        const { data } = await axios.post(
            `${config.get('okta.url')}/api/v1/authn`,
            { username, password },
            { headers: OktaService.getOktaRequestHeaders() }
        );

        return OktaService.getOktaUserByEmail(data._embedded.user.profile.login);
    }

    static async createUserWithoutPassword(
        email: string,
        name: string,
        role: string,
        apps: string[],
        photo?: string,
    ): Promise<IUserTemp> {
        const { data }: { data: OktaUser } = await axios.post(
            `${config.get('okta.url')}/api/v1/users?activate=false`,
            {
                profile: {
                    firstName: 'RW API',
                    lastName: 'User',
                    displayName: name,
                    email,
                    login: email,
                    legacyId: uuidv4(),
                    provider: 'local',
                    role,
                    apps,
                    photo,
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

    static async getUsers(search: string, pageOptions: OktaPaginationOptions): Promise<OktaUser[]> {
        const { data }: { data: OktaUser[] } = await axios.get(`${config.get('okta.url')}/api/v1/users`, {
            headers: OktaService.getOktaRequestHeaders(),
            params: {
                limit: pageOptions.limit,
                ...(search && { search }),
                ...(pageOptions.after && { after: pageOptions.after }),
                ...(pageOptions.before && { before: pageOptions.before }),
            }
        });

        return data;
    }

    static getOktaSearchCriteria(query: Record<string, any>): string {
        logger.debug('[UserService] getOktaSearchCriteria Object.keys(query)', Object.keys(query));

        const searchCriteria: string[] = [];
        Object.keys(query)
            .filter((param) => ['id', 'name', 'provider', 'email', 'role', 'apps'].includes(param))
            .forEach((field: string) => {
                if (query[field]) {
                    if (Array.isArray(query[field])) {
                        searchCriteria.push(OktaService.getSearchCriteriaFromArray(field, query[field]));
                    } else {
                        searchCriteria.push(`(${OktaService.getOktaProfileFieldName(field)} ${OktaService.getOktaFieldOperator(field)} "${query[field]}")`);
                    }
                }
            });

        return searchCriteria
            .filter(el => el !== '')
            .join(' and ');
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
