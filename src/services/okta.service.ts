import axios from 'axios';
import config from 'config';
import logger from 'logger';
import { v4 as uuidv4 } from 'uuid';

import { IUser } from "models/user.model";
import { IUserTemp } from "models/user-temp.model";
import { OktaPaginationOptions, OktaRequestHeaders, OktaUser } from "services/okta.interfaces";

export default class OktaService {

    static async getOktaUserByEmail(email: string): Promise<IUser> {
        const { data } = await axios.get(
            `${config.get('okta.url')}/api/v1/users/${email}`,
            { headers: OktaService.getOktaRequestHeaders() }
        );

        return OktaService.convertOktaUserToIUser(data);
    }

    static async signUpWithoutPassword(email: string, name: string): Promise<IUserTemp> {
        const { data } = await axios.post(
            `${config.get('okta.url')}/api/v1/users?activate=false`,
            {
                profile: {
                    firstName: 'RW API',
                    lastName: 'User',
                    displayName: name,
                    email,
                    login: email,
                    legacyId: uuidv4(),
                    "role": "USER",
                    "apps": ["rw"]
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

    static async getUsers(search: string, pageOptions: OktaPaginationOptions): Promise<OktaUser[]> {
        const { data } = await axios.get(`${config.get('okta.url')}/api/v1/users`, {
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
