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
    displayName?: string;
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

export interface OktaPaginationOptions {
    limit: number;
    before?: string;
    after?: string;
}

export interface OktaFailedLoginResponse {
    errorCode: string;
    errorSummary: string;
    errorLink: string;
    errorId: string;
    errorCauses: string[];
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
