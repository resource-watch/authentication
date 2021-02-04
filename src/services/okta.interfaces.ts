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
}

export interface OktaUserProfile {
    login: string;
    email: string;
    firstName: string;
    lastName: string;
    displayName: string;
    mobilePhone?: string;
    secondEmail?: string;
    legacyId: string;
    role: string;
    provider: string;
    apps: string[];
    providerId?: string;
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
    };
    _links: { self: { href: string; } };
}

export interface OktaCreateUserPayload {
    email: string;
    name?: string;
    role?: string;
    apps?: string[];
    photo?: string;
    provider?: OktaOAuthProvider;
    providerId?: string;
}

export interface OktaUpdateUserPayload {
    displayName?: string;
    photo?: string;
    role?: string;
    apps?: string[];
}

export interface OktaUpdateUserProtectedFieldsPayload {
    legacyId?: string;
    email?: string;
    displayName?: string;
    role?: string;
    apps?: string[];
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
                firstName: string;
                lastName: string;
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
    FACEBOOK = 'facebook',
    GOOGLE = 'google',
    APPLE = 'apple',
}
