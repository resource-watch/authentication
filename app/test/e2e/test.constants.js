/* eslint-disable max-len */
const TOKENS = {
    MICROSERVICE: 'eyJhbGciOiJIUzI1NiJ9.eyJpZCI6Im1pY3Jvc2VydmljZSIsImNyZWF0ZWRBdCI6IjIwMTYtMDktMTQifQ.W2NBSi1UzRifheOsnvRk05_lvdcPbdXZ-Giw3Nnisoo'
};

const USERS = {
    USER: {
        id: '1a10d7c6e0a37126611fd7a7',
        role: 'USER',
        provider: 'local',
        email: 'user@authorization.org',
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
        id: '1a10d7c6e0a37126611fd7a7',
        role: 'MANAGER',
        provider: 'local',
        email: 'manager@authorization.org',
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
        role: 'ADMIN',
        provider: 'local',
        email: 'admin@authorization.org',
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
        id: 'microservice',
        role: 'ADMIN',
        provider: 'local',
        email: 'microservice@authorization.org',
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
    }
};

const testAppKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIn0.sQOVoEtkQlgy8UwlPOi5YWSdGAkRn80JqT53RdktIms';

const testFilter = (compareData, additionalData) => ({
    name: 'dataset',
    path: '/api/v1/test1/test',
    pathRegex: new RegExp('/api/v1/test1/test'),
    method: 'POST',
    compare: { data: compareData },
    ...additionalData,
});

module.exports = {
    TOKENS,
    USERS,
    testAppKey,
    testFilter
};
