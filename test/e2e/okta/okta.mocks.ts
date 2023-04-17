import nock from 'nock';
import config from 'config';
import { faker } from '@faker-js/faker';
import { isEqual } from 'lodash';
import mongoose from 'mongoose';
import {
    IUserId,
    IUserLegacyId,
    JWTPayload,
    OktaCreateUserPayload,
    OktaFailedAPIResponse,
    OktaSuccessfulLoginResponse,
    OktaSuccessfulOAuthTokenResponse,
    OktaUpdateUserPayload,
    OktaUpdateUserProtectedFieldsPayload,
    OktaUser,
    OktaUserProfile
} from 'services/okta.interfaces';
import { createInvalidTokenForUser, createTokenForUser } from '../utils/helpers';

export const getMockOktaUser: (override?: Partial<OktaUserProfile>) => OktaUser = (override = {}) => {
    const email: string = faker.internet.email();
    const name: string = `${faker.name.firstName()} ${faker.name.lastName()}`;
    return {
        'id': faker.datatype.uuid(),
        'status': 'PROVISIONED',
        'created': '2020-11-05T22:24:09.000Z',
        'activated': '2020-11-05T22:24:09.000Z',
        'statusChanged': '2020-11-05T22:24:09.000Z',
        'lastLogin': null,
        'lastUpdated': '2020-11-05T22:24:09.000Z',
        'passwordChanged': null,
        'type': { 'id': faker.datatype.uuid() },
        'profile': {
            legacyId: new mongoose.Types.ObjectId().toString(),
            login: email,
            email,
            role: 'USER',
            provider: 'local',
            apps: ['rw'],
            displayName: name,
            photo: faker.image.imageUrl(),
            origin: '',
            ...override,
        },
        'credentials': {
            'provider': {
                'type': 'OKTA',
                'name': 'OKTA'
            }
        },
        '_links': {
            'self': {
                'href': 'https://wri.okta.com/api/v1/users/00uk4x3281Yka1zn85d5'
            }
        }
    };
};

export const mockOktaListUsers: (query?: {}, users?: OktaUser[], statusCode?: number, headers?: {}) => void = (
    query = {},
    users: OktaUser[] = [],
    statusCode = 200,
    headers: {}
) => {
    nock(config.get('okta.url'))
        .get('/api/v1/users')
        .query(query)
        .reply(statusCode, users, headers);
};

export const mockOktaSuccessfulLogin: () => OktaSuccessfulLoginResponse = () => {
    const successfulLoginResponse: OktaSuccessfulLoginResponse = {
        'expiresAt': '2021-01-19T11:29:41.000Z',
        'status': 'SUCCESS',
        'sessionToken': '20111upCJzH_F3NPjEgqPFNjJGprtSWwjbl8Ehvv_EyYk10wbaUY83L',
        '_embedded': {
            'user': {
                'id': '00ukgm6zKTLFgB4Qf5d5',
                'passwordChanged': '2020-11-06T16:15:53.000Z',
                'profile': {
                    'login': faker.internet.email(),
                    'locale': 'en',
                    'timeZone': 'America/Los_Angeles'
                }
            }
        }
    };

    nock(config.get('okta.url'))
        .post('/api/v1/authn')
        .reply(200, successfulLoginResponse);

    return successfulLoginResponse;
};

export const mockOktaFailedLogin: () => OktaFailedAPIResponse = () => {
    const failedLoginResponse: OktaFailedAPIResponse = {
        'errorCode': 'E0000004',
        'errorSummary': 'Authentication failed',
        'errorLink': 'E0000004',
        'errorId': 'oaeXDfN2vJFQlyrTZJGc3FrAA',
        'errorCauses': []
    };

    nock(config.get('okta.url'))
        .post('/api/v1/authn')
        .reply(401, failedLoginResponse);

    return failedLoginResponse;
};

export const mockGetUserById: (user: OktaUser, times?: number) => void = (user, times = 1) => {
    nock(config.get('okta.url'))
        .get(`/api/v1/users`)
        .query({ limit: 1, search: `(profile.legacyId eq "${user.profile.legacyId}")` })
        .times(times)
        .reply(200, [user]);
};

export const mockGetUserByOktaId: (id: IUserId, user: OktaUser, times?: number) => void = (id, user, times = 1) => {
    nock(config.get('okta.url'))
        .get(`/api/v1/users/${id}`)
        .times(times)
        .reply(200, user);
};

export const mockGetUserByIdNotFound: (id: IUserLegacyId, times?: number) => void = (id, times = 1) => {
    nock(config.get('okta.url'))
        .get(`/api/v1/users`)
        .query({ limit: 1, search: `(profile.legacyId eq "${id}")` })
        .times(times)
        .reply(200, []);
};

export const mockOktaGetUserByEmail: (override: Partial<OktaUserProfile>, times?: number) => OktaUser = (override = {}, times = 1) => {
    const user: OktaUser = getMockOktaUser(override);

    nock(config.get('okta.url'))
        .get(`/api/v1/users/${user.profile.email}`)
        .times(times)
        .reply(200, { ...user });

    return user;
};

export const generateRandomTokenPayload: (override?: Partial<JWTPayload>) => JWTPayload = (override = {}) => {
    const id: string = faker.datatype.uuid();
    const email: string = faker.internet.email();
    const role: string = 'USER';
    const extraUserData: { apps: string[]; } = { apps: ['rw'] };
    const iat: number = new Date().getTime();
    return { id, email, role, extraUserData, iat, ...override };
};

export const mockValidJWT: (override?: Partial<JWTPayload>, mockGetUser?: boolean) => string = (override = {}, mockGetUser = true) => {
    const tokenPayload: JWTPayload = generateRandomTokenPayload(override);

    if (mockGetUser) {
        mockOktaGetUserByEmail({
            login: tokenPayload.email,
            email: tokenPayload.email,
            legacyId: tokenPayload.id,
            role: tokenPayload.role,
            apps: tokenPayload.extraUserData.apps,
        });
    }

    return createTokenForUser(tokenPayload);
};

export const mockInvalidJWT: (override?: Partial<JWTPayload>, mockGetUser?: boolean) => string = (override = {}) => {
    const tokenPayload: JWTPayload = generateRandomTokenPayload(override);

    return createInvalidTokenForUser(tokenPayload);
};

export const mockMicroserviceJWT: () => string = () => {
    return createTokenForUser({ id: 'microservice', createdAt: new Date() });
};

export const mockOktaCreateUser: (user: OktaUser, payload: OktaCreateUserPayload) => void = (user, payload) => {
    nock(config.get('okta.url'))
        .post('/api/v1/users?activate=false', (body) => [
            body.profile.email === payload.email,
            body.profile.login === payload.email,
            body.profile.displayName === payload.name,
            body.profile.provider === payload.provider,
            !!payload.origin ? body.profile.origin === payload.origin : body.profile.origin === '',
            body.profile.role === payload.role || body.profile.role === 'USER',
            isEqual(body.profile.apps, payload.apps),
            !payload.photo || body.profile.photo === payload.photo,
            !payload.providerId || body.profile.providerId === payload.providerId,
        ].every(el => !!el))
        .reply(200, user);
};

export const mockOktaLogoutUser: (oktaId: IUserId) => void = (oktaId: string) => {
    nock(config.get('okta.url'))
        .delete(`/api/v1/users/${oktaId}/sessions`)
        .reply(200);
};

export const mockOktaSendActivationEmail: (user: OktaUser, sendEmail?: boolean) => void = (user, sendEmail = true) => {
    nock(config.get('okta.url'))
        .post(`/api/v1/users/${user.id}/lifecycle/activate?sendEmail=${sendEmail}`)
        .reply(200, user);
};

export const mockOktaFailedSignUp: (errorSummary: string) => OktaFailedAPIResponse = (errorSummary: string) => {
    const failedLoginResponse: OktaFailedAPIResponse = {
        'errorCode': 'E0000004',
        errorSummary,
        'errorLink': 'E0000004',
        'errorId': 'oaeXDfN2vJFQlyrTZJGc3FrAA',
        'errorCauses': [{ errorSummary }],
    };

    nock(config.get('okta.url'))
        .post('/api/v1/users?activate=false')
        .reply(401, failedLoginResponse);

    return failedLoginResponse;
};

export const mockOktaUpdateUser: (mockUser: OktaUser, updateData: OktaUpdateUserPayload | OktaUpdateUserProtectedFieldsPayload, times?: number) => void =
    (mockUser, updateData, times = 1) => {
    nock(config.get('okta.url'))
        .post(`/api/v1/users/${mockUser.id}`, (body) => isEqual(body, { profile: updateData }))
        .times(times)
        .reply(200, { ...mockUser, profile: { ...mockUser.profile, ...updateData } });
};

export const mockOktaDeleteUser: (user: OktaUser, times?: number) => void = (user, times = 1) => {
    nock(config.get('okta.url'))
        .delete(`/api/v1/users/${user.id}`)
        .times(times)
        .reply(204);
};

export const mockOktaSendResetPasswordEmail: (override?: Partial<OktaUserProfile>, times?: number, origin?: string) => OktaUser =
    (override = {}, times = 1, origin = '') => {
        const user: OktaUser = getMockOktaUser(override);

        // Mock get user by email
        nock(config.get('okta.url'))
            .get(`/api/v1/users/${user.profile.email}`)
            .times(times)
            .reply(200, { ...user });

        // Mock update origin field in Okta
        nock(config.get('okta.url'))
            .post(`/api/v1/users/${user.id}`, (body) => isEqual(body, { profile: { origin } }))
            .times(times)
            .reply(200, { ...user, profile: { ...user.profile, origin: '' } });

        nock(config.get('okta.url'))
            .post(`/api/v1/authn/recovery/password`, { username: user.profile.email, factorType: 'EMAIL' })
            .times(times)
            .reply(200, { ...user });

        return user;
    };

export const mockOktaOAuthToken: (override?: Partial<OktaSuccessfulOAuthTokenResponse>) => OktaSuccessfulOAuthTokenResponse = (override = {}) => {
    const successfulOAuthTokenResponse: OktaSuccessfulOAuthTokenResponse = {
        'token_type': 'Bearer',
        'expires_in': 3600,
        'access_token': 'eyJraWQiOiJydk9jdFBwTGNjLW54MWQzSGFrcXFsaUhlcUF1UnBhMVRkSVNCVlNOU0ZzIiwiYWxnIjoiUlMyNTYifQ.eyJ2ZXIiOjEsImp0aSI6IkFULjF3VGhUdDRXMlJmQzVxUnZYZDNyMUFVUzRHTExhU2ZXaHM2eGZHRE0xZXMiLCJpc3MiOiJodHRwczovL3dyaS5va3RhLmNvbS9vYXV0aDIvZGVmYXVsdCIsImF1ZCI6ImFwaTovL2RlZmF1bHQiLCJpYXQiOjE2MTE5MzUwNTMsImV4cCI6MTYxMTkzODY1MywiY2lkIjoiMG9hM3lubGY1T0RZR3lZZW81ZDYiLCJ1aWQiOiIwMHVrZ202ektUTEZnQjRRZjVkNSIsInNjcCI6WyJlbWFpbCIsIm9wZW5pZCIsInByb2ZpbGUiXSwic3ViIjoiaGVucmlxdWUucGFjaGVjb0B2aXp6dWFsaXR5LmNvbSJ9.j7YwJiQIX8p8b_CJ8kTZx2HeH5bNoWZhecepDlMXCw8ZrUcuX2PgjoiQVtx0XnSoyEQTI743WRfFFUV0d1fBfW1GM_35eDGwuLrguHcfdSu2iUwjBMxYB0aRWlKg1CfF744Lizbwn-o8hYdv8AmaQQ521EOmqB3j_YL2PDLWScGFooOAxLuY1cLrpDtqUEFNDKWsbeV1xQbPJbiijAwl0d-XvLY0n2MQ6kTH4VoXiaaSWrl9j08uaJjGpeWiMyqEhZdx-TSvBToglppijOScNt0empmdxJD4cislEDTxUxoRdJMO3JYjvYayy5ib-nJSxS8eO6CPivHQVzoPjboe0w',
        'scope': 'email openid profile',
        'id_token': 'eyJraWQiOiJydk9jdFBwTGNjLW54MWQzSGFrcXFsaUhlcUF1UnBhMVRkSVNCVlNOU0ZzIiwiYWxnIjoiUlMyNTYifQ.eyJzdWIiOiIwMHVrZ202ektUTEZnQjRRZjVkNSIsIm5hbWUiOiJIZW5yaXF1ZSBQYWNoZWNvIiwiZW1haWwiOiJoZW5yaXF1ZS5wYWNoZWNvQHZpenp1YWxpdHkuY29tIiwidmVyIjoxLCJpc3MiOiJodHRwczovL3dyaS5va3RhLmNvbS9vYXV0aDIvZGVmYXVsdCIsImF1ZCI6IjBvYTN5bmxmNU9EWUd5WWVvNWQ2IiwiaWF0IjoxNjExOTM1MDUzLCJleHAiOjE2MTE5Mzg2NTMsImp0aSI6IklELmZoZEpGTTJ2b214cE1zYUV1c2NuNGVsa3pnamJITXdvRUg4aUxPUVpMbE0iLCJhbXIiOlsicHdkIiwibWZhIiwib3RwIl0sImlkcCI6IjAwb2pvcGhoVkhQRUxOYTEyNWQ1IiwicHJlZmVycmVkX3VzZXJuYW1lIjoiaGVucmlxdWUucGFjaGVjb0B2aXp6dWFsaXR5LmNvbSIsImF1dGhfdGltZSI6MTYxMTkxODAxMSwiYXRfaGFzaCI6ImVTX3ZUVU9aVnNVRHBUUUloNnhYSUEifQ.fsbdWHZy4IGZ9qD35wcxHyfzSTzPwN5opZYYlAaRA1D-YP2WFbTQECcyGTbBqhyGs4tmih71CJcqel948VBeTzOC2dGQJtpGMBlnbNp_aRDtQEVIwcpj-WzQnz0NMw65ty1tT4ZH6K1mKZq0r0jX88uPeLdBB-b7c4PIN_F_ZNV_NrH6h4gc5_KzXxHDcMiTvYYzQaTLHOJwyavYX28hALM7bCGudeDmZI3dz2ZuD5oCvF9uO272gi0KAv7YsFqAVn7EBxeW3KuObJ0wd1FaGBvh2suyNBcLjBxvDP2GGieA7ezujuucnouKgPwHSnL_LEvHXzGta2UCe3mLt7V50Q',
        ...override
    };

    nock(config.get('okta.url'))
        .post('/oauth2/default/v1/token')
        .query(() => true)
        .reply(200, successfulOAuthTokenResponse);

    return successfulOAuthTokenResponse;
};
