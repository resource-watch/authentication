import { IApplicationId } from "models/application";

export interface IUser {
    id: string;
    _id?: string;
    name?: string;
    photo?: string;
    provider: string;
    providerId?: string;
    email?: string;
    password?: string;
    salt?: string;
    role: string;
    createdAt: Date;
    updatedAt: Date;
    extraUserData: { apps: string[]; };
    userToken?: string;
    applications?: IApplicationId[];
}

export interface OktaOAuthTokenPayload {
    uid: string;
}

export interface JWTPayload {
    id: string;
    email: string;
    role: string;
    extraUserData: {
        apps: string[]
    };
    iat: number;
}

export interface OktaUserProfile {
    login: string;
    email: string;
    displayName: string;
    mobilePhone?: string;
    secondEmail?: string;
    legacyId: string;
    role: string;
    provider: string;
    apps: string[];
    origin?: string;
    providerId?: string;
    photo?: string;
    applications?: string[]
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
    };
    _links: { self: { href: string; } };
}

export interface OktaCreateUserPayload {
    email: string;
    provider: OktaOAuthProvider;
    name?: string;
    origin?: string;
    role?: string;
    apps?: string[];
    photo?: string;
    providerId?: string;
    legacyId?: string;
}

export interface OktaUpdateUserPayload {
    displayName?: string;
    photo?: string;
    role?: string;
    apps?: string[];
    applications?: IApplicationId[];
}

export interface OktaUpdateUserProtectedFieldsPayload {
    legacyId?: string;
    email?: string;
    displayName?: string;
    provider?: string;
    providerId?: string;
    password?: string;
    role?: string;
    apps?: string[];
    origin?: string;
}

export interface OktaErrorCause {
    errorSummary: string;
}

export interface OktaFailedAPIResponse {
    errorCode: string;
    errorSummary: string;
    errorLink: string;
    errorId: string;
    errorCauses: OktaErrorCause[];
}

export interface OktaSuccessfulLoginResponse {
    expiresAt: string;
    status: string;
    sessionToken: string;
    _embedded: {
        user: {
            id: string;
            passwordChanged: string;
            profile: {
                login: string;
                locale: string;
                timeZone: string;
            }
        }
    };
}

export interface OktaSuccessfulOAuthTokenResponse {
    token_type: string;
    expires_in: number;
    access_token: string;
    scope: string;
    id_token: string;
}

export enum OktaOAuthProvider {
    LOCAL = 'local',
    FACEBOOK = 'facebook',
    GOOGLE = 'google',
    APPLE = 'apple',
    TWITTER = 'twitter',
}

export enum PaginationStrategyOption {
    OFFSET = 'offset',
    CURSOR = 'cursor',
}
