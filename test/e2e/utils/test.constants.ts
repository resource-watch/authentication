export const TOKENS: { MICROSERVICE: string } = {
    MICROSERVICE: 'eyJhbGciOiJIUzI1NiJ9.eyJpZCI6Im1pY3Jvc2VydmljZSIsImNyZWF0ZWRBdCI6IjIwMTYtMDktMTQifQ.W2NBSi1UzRifheOsnvRk05_lvdcPbdXZ-Giw3Nnisoo'
};

export interface IRequestUser {
    id: string;
    role?: string;
    extraUserData?: Record<string, any>;
    name?: string;
    provider?: string;
    email?: string;
}

export const USERS: Record<string, IRequestUser> = {
    USER: {
        id: '1a10d7c6e0a37126611fd7a5',
        name: 'user',
        role: 'USER',
        provider: 'local',
        email: 'user@control-tower.org',
        extraUserData: {
            apps: [
                'rw',
                'gfw',
                'gfw-climate',
                'prep',
                'aqueduct',
                'forest-atlas',
                'data4sdgs'
            ]
        }
    },
    MANAGER: {
        id: '1a10d7c6e0a37126611fd7a6',
        name: 'test manager',
        role: 'MANAGER',
        provider: 'local',
        email: 'user@control-tower.org',
        extraUserData: {
            apps: [
                'rw',
                'gfw',
                'gfw-climate',
                'prep',
                'aqueduct',
                'forest-atlas',
                'data4sdgs'
            ]
        }
    },
    ADMIN: {
        id: '1a10d7c6e0a37126611fd7a7',
        name: 'test admin',
        role: 'ADMIN',
        provider: 'local',
        email: 'user@control-tower.org',
        extraUserData: {
            apps: [
                'rw',
                'gfw',
                'gfw-climate',
                'prep',
                'aqueduct',
                'forest-atlas',
                'data4sdgs'
            ]
        }
    },
    MICROSERVICE: {
        id: 'microservice'
    }
};
