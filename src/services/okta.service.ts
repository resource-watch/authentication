import axios from 'axios';
import config from 'config';
import logger from 'logger';
import { IUser } from "../models/user.model";

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
    page: number;
}

export default class OktaService {

    static async getUsers(
        filteredQuery: Record<string, any>,
        pageOptions: OktaPaginationOptions,
    ): Promise<OktaUser[]> {
        try {
            const { data } = await axios.get(`${config.get('okta.url')}/api/v1/users`, {
                headers: {
                    'Accept': 'application/json',
                    'Content-Type': 'application/json',
                    'Authorization': `SSWS ${config.get('okta.apiKey')}`,
                },
                params: {
                    limit: pageOptions.limit,
                    // TODO: missing support for cursors
                    // after: pageOptions.page,
                }
            });
            return data;
        } catch (err) {
            logger.error(err);
            return [];
        }
    }

    static convertOktaUserToIUser(user: OktaUser): IUser {
        return {
            ...user.profile,
            extraUserData: { apps: user.profile.apps },
            createdAt: new Date(user.created),
            updatedAt: new Date(user.lastUpdated),
        };
    }

}