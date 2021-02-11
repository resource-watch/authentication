import axios from 'axios';
import config from 'config';
import JWT from 'jsonwebtoken';
import {v4 as uuidv4} from 'uuid';

import {
    OktaCreateUserPayload, OktaImportUserPayload,
    OktaOAuthTokenPayload,
    OktaSuccessfulLoginResponse,
    OktaUpdateUserPayload,
    OktaUpdateUserProtectedFieldsPayload,
    OktaUser,
} from './okta.interfaces';

interface OktaRequestHeaders {
    Accept: string;
    'Content-Type': string;
    Authorization: string;
}

export default class OktaApiService {
    private static oktaRequestHeaders(): OktaRequestHeaders {
        return {
            'Accept': 'application/json',
            'Content-Type': 'application/json',
            'Authorization': `SSWS ${config.get('okta.apiKey')}`,
        };
    }

    static async getOktaUserList(search: string, limit: string, after: string, before: string): Promise<OktaUser[]> {
        const { data }: { data: OktaUser[] } = await axios.get(`${config.get('okta.url')}/api/v1/users`, {
            headers: OktaApiService.oktaRequestHeaders(),
            params: {
                ...(search && { search }),
                ...(limit && { limit }),
                ...(after && { after }),
                ...(before && { before }),
            }
        });

        return data;
    }

    static async getOktaUserByEmail(email: string): Promise<OktaUser> {
        const { data }: { data: OktaUser } = await axios.get(
            `${config.get('okta.url')}/api/v1/users/${email}`,
            { headers: OktaApiService.oktaRequestHeaders() }
        );

        return data;
    }

    static async getOktaUserById(oktaId: string): Promise<OktaUser> {
        const { data }: { data: OktaUser } = await axios.get(
            `${config.get('okta.url')}/api/v1/users/${oktaId}`,
            { headers: OktaApiService.oktaRequestHeaders() }
        );

        return data;
    }

    static async postPasswordRecoveryEmail(email: string): Promise<void> {
        return axios.post(
            `${config.get('okta.url')}/api/v1/authn/recovery/password`,
            { username: email, 'factorType': 'EMAIL' },
            { headers: OktaApiService.oktaRequestHeaders() }
        );
    }

    static async postUserActivationEmail(oktaId: string): Promise<void> {
        return axios.post(
            `${config.get('okta.url')}/api/v1/users/${oktaId}/lifecycle/activate?sendEmail=true`,
            {},
            { headers: OktaApiService.oktaRequestHeaders() }
        );
    }

    static async postLogin(username: string, password: string): Promise<OktaSuccessfulLoginResponse> {
        const { data }: { data: OktaSuccessfulLoginResponse } = await axios.post(
            `${config.get('okta.url')}/api/v1/authn`,
            { username, password },
            { headers: OktaApiService.oktaRequestHeaders() }
        );

        return data;
    }

    // Returns Okta user ID
    static async postOAuthToken(code: string): Promise<string> {
        const basicAuth: string = Buffer
            .from(`${config.get('okta.clientId')}:${config.get('okta.clientSecret')}`)
            .toString('base64');

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
        return uid;
    }

    static async postUser(payload: OktaCreateUserPayload): Promise<OktaUser> {
        const { data }: { data: OktaUser } = await axios.post(
            `${config.get('okta.url')}/api/v1/users?activate=false`,
            {
                profile: {
                    email: payload.email,
                    login: payload.email,
                    firstName: payload.firstName,
                    lastName: payload.lastName,
                    displayName: payload.name,
                    provider: payload.provider,
                    legacyId: uuidv4(),
                    role: payload.role || 'USER',
                    apps: payload.apps || [],
                    photo: payload.photo || null,
                    providerId: payload.providerId || null,
                }
            },
            { headers: OktaApiService.oktaRequestHeaders() }
        );

        return data;
    }

    static async postUserWithEncryptedPassword(payload: OktaImportUserPayload): Promise<OktaUser> {
        const { data }: { data: OktaUser } = await axios.post(
            `${config.get('okta.url')}/api/v1/users?activate=true`,
            payload,
            { headers: OktaApiService.oktaRequestHeaders() }
        );

        return data;
    }

    static async postUserByOktaId(
        oktaId: string,
        payload: OktaUpdateUserPayload | OktaUpdateUserProtectedFieldsPayload
    ): Promise<OktaUser> {
        const { data }: { data: OktaUser } = await axios.post(
            `${config.get('okta.url')}/api/v1/users/${oktaId}`,
            { profile: payload },
            { headers: OktaApiService.oktaRequestHeaders() }
        );

        return data;
    }

    static async deleteUserByOktaId(oktaId: string): Promise<void> {
        return axios.delete(
            `${config.get('okta.url')}/api/v1/users/${oktaId}`,
            { headers: OktaApiService.oktaRequestHeaders() }
        );
    }
}
