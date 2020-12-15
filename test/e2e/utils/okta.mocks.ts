import nock from "nock";
import config from "config";
import faker from 'faker';

import { OktaUser, OktaUserProfile } from "services/okta.service";

export const getMockOktaUser: (override?: Partial<OktaUserProfile>) => OktaUser = (override = {}) => {
    const email:string = faker.internet.email();
    return {
        "id": faker.random.uuid(),
        "status": "PROVISIONED",
        "created": "2020-11-05T22:24:09.000Z",
        "activated": "2020-11-05T22:24:09.000Z",
        "statusChanged": "2020-11-05T22:24:09.000Z",
        "lastLogin": null,
        "lastUpdated": "2020-11-05T22:24:09.000Z",
        "passwordChanged": null,
        "type": { "id": faker.random.uuid() },
        "profile": {
            legacyId: faker.random.uuid(),
            login: email,
            email,
            role: 'ADMIN',
            provider: 'okta',
            apps: ['rw'],
            firstName: faker.name.firstName(),
            lastName: faker.name.lastName(),
            ...override,
        },
        "credentials": {
            "provider": {
                "type": "OKTA",
                "name": "OKTA"
            }
        },
        "_links": {
            "self": {
                "href": "https://wri.okta.com/api/v1/users/00uk4x3281Yka1zn85d5"
            }
        }
    }
};

export const mockOktaListUsers = (
    query = {},
    users: OktaUser[] = [],
    statusCode = 200,
) => {
    nock(config.get('okta.url'))
        .get('/api/v1/users')
        .query(query)
        .reply(statusCode, users);
}
