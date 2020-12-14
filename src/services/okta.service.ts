import axios from 'axios';
import config from 'config';
import logger from 'logger';

import { IUser } from "models/user.model";

export interface OktaUserProfile {
    login: string;
    email: string;
    displayName?: string;
    mobilePhone?: string;
    secondEmail?: string;
    legacyId: string;
    role: string;
    provider: string;
    apps: string[];
    photo?: string;
}

export interface OktaUser {
    id: string;
    status: string;
    created: string;
    activated: string;
    statusChanged: string;
    lastLogin: string|null;
    lastUpdated: string;
    passwordChanged: string|null;
    type: { id: string; };
    profile: OktaUserProfile;
    credentials: {
        provider: { type: string; name: string; }
    },
    _links: { self: { href: string; } }
}

export interface OktaPaginationOptions {
    limit: number;
    before: string;
    after: string;
}

export default class OktaService {

    static async getUsers(search: string, pageOptions: OktaPaginationOptions): Promise<OktaUser[]> {
        try {
            const { data } = await axios.get(`${config.get('okta.url')}/api/v1/users`, {
                headers: {
                    'Accept': 'application/json',
                    'Content-Type': 'application/json',
                    'Authorization': `SSWS ${config.get('okta.apiKey')}`,
                },
                params: {
                    limit: pageOptions.limit,
                    ...(search && { search }),
                    ...(pageOptions.after && { after: pageOptions.after }),
                    ...(pageOptions.before && { before: pageOptions.before }),
                }
            });
            return data;
        } catch (err) {
            logger.error(err);
            return [];
        }
    }

    static getOktaSearchCriteria(query: Record<string, any>): string {
        logger.debug('[UserService] getOktaSearchCriteria Object.keys(query)', Object.keys(query));

        const searchCriteria: string[] = [];
        Object.keys(query)
            .filter((param) => ['name', 'provider', 'email', 'role', 'apps'].includes(param))
            .forEach((field: string) => {
                if (field === 'apps') {
                    searchCriteria.push(OktaService.getAppsSearchCriteria(query[field]));
                } else {
                    searchCriteria.push(`(${OktaService.getOktaProfileFieldName(field)} ${OktaService.getOktaFieldOperator(field)} "${query[field]}")`);
                }
            });

        return searchCriteria
            .filter(el => el !== '')
            .join(' and ');
    }

    static convertOktaUserToIUser(user: OktaUser): IUser {
        return {
            ...user.profile,
            id: user.profile.legacyId,
            extraUserData: { apps: user.profile.apps },
            createdAt: new Date(user.created),
            updatedAt: new Date(user.lastUpdated),
        };
    }

    private static getOktaProfileFieldName(userField: string) {
        switch (userField) {
            case 'name':
                return 'profile.displayName';

            default:
                return `profile.${userField}`;
        }
    }

    private static getOktaFieldOperator(userField: string) {
        switch (userField) {
            case 'apps':
            case 'role':
            case 'provider':
                return 'eq';

            default:
                return 'sw';
        }
    }

    private static getAppsSearchCriteria(apps: string[]): string {
        if (!apps) {
            return '';
        }

        return `(${apps.map(app => `(profile.apps eq "${app}")`).join(' or ')})`;
    }

}
