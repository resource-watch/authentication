import nock from 'nock';
import chai from 'chai';
import config from 'config';
import {isEqual} from 'lodash';
import type request from 'superagent';

import UserModel, {UserDocument} from 'models/user.model';
import {OktaImportUserPayload, OktaUser} from 'services/okta.interfaces';
import {createUser, createUserAndToken} from '../utils/helpers';
import { closeTestAgent, getTestAgent } from '../utils/test-server';
import {getMockOktaUser, mockGetUserById, mockGetUserByIdNotFound} from './okta.mocks';

chai.should();

let requester: ChaiHttp.Agent;

nock.disableNetConnect();
nock.enableNetConnect(process.env.HOST_IP);

const mockImportProcess: (user: UserDocument) => void = (user) => {
    // Mock failed request to find user in Okta
    mockGetUserByIdNotFound(user.id);

    // Mock request to create user with password
    const mockBody: OktaImportUserPayload = {
        profile: {
            // Fields expected to always be present
            firstName: user.name.split(' ')[0],
            lastName: user.name.split(' ').slice(1).join(' '),
            email: user.email,
            login: user.email,
            displayName: user.name,
            legacyId: user.id,
            role: user.role,
            apps: user.extraUserData.apps,
            provider: user.provider,

            // Optional fields
            ...(user.photo && { photo: user.photo }),
            ...(user.providerId && { providerId: user.providerId }),
        },
        credentials: {
            password : {
                hash: {
                    algorithm: 'BCRYPT',
                    workFactor: 10,
                    salt: user.salt.replace('$2b$10$', ''),
                    value: user.password.replace(user.salt, ''),
                }
            }
        },
    };

    nock(config.get('okta.url'))
        .post('/api/v1/users?activate=true', (body) => isEqual(body, mockBody))
        .reply(200, user);
};

describe('[OKTA] User import test suite', () => {

    before(async () => {
        if (process.env.NODE_ENV !== 'test') {
            throw Error(`Running the test suite with NODE_ENV ${process.env.NODE_ENV} may result in permanent data loss. Please use NODE_ENV=test.`);
        }

        requester = await getTestAgent(true);

        await UserModel.deleteMany({}).exec();
    });

    it('Importing users is restricted to ADMIN users, returning 401 Unauthorized if no valid token is provided', async () => {
        const response: request.Response = await requester.get(`/auth/import-users-to-okta`);
        response.status.should.equal(401);
    });

    it('Importing users is restricted to ADMIN users, returning 401 Unauthorized if a USER token is provided', async () => {
        const { token } = await createUserAndToken();

        const response: request.Response = await requester
            .get(`/auth/import-users-to-okta`)
            .set('Content-Type', 'application/json')
            .set('Authorization', `Bearer ${token}`);

        response.status.should.equal(403);
    });

    it('Importing users when the user already exists in Okta skips the import for that user, returning 200 OK and 0 users imported (happy case)', async () => {
        // Create user in MongoDB
        const { token, user } = await createUserAndToken({ role: 'ADMIN' });

        // Create mock OktaUser data
        const mockOktaUser: OktaUser = getMockOktaUser({
            legacyId: user.id,
            login: user.email,
            email: user.email,
            role: user.role,
            provider: user.provider,
            apps: user.extraUserData.apps,
        });

        // Mock successful request to find user in Okta
        mockGetUserById(mockOktaUser);

        const response: request.Response = await requester
            .get(`/auth/import-users-to-okta`)
            .set('Content-Type', 'application/json')
            .set('Authorization', `Bearer ${token}`);

        response.status.should.equal(200);
        response.body.should.have.property('imported').and.eql(0);
    });

    it('Importing users when one user does not exist in Okta imports that user, returning 200 OK and 1 user imported (happy case)', async () => {
        // Create ADMIN user in MongoDB
        const { token, user } = await createUserAndToken({ role: 'ADMIN' });

        mockImportProcess(await UserModel.findById(user.id));

        const response: request.Response = await requester
            .get(`/auth/import-users-to-okta`)
            .set('Content-Type', 'application/json')
            .set('Authorization', `Bearer ${token}`);

        response.status.should.equal(200);
        response.body.should.have.property('imported').and.eql(1);
    });

    it('Importing users when many users don\'t exist in Okta imports many users, returning 200 OK and the number of users imported (happy case)', async () => {
        // Create ADMIN user in MongoDB
        const { token, user } = await createUserAndToken({ role: 'ADMIN' });

        // Create many users to import
        const userTwo: UserDocument = await new UserModel(createUser()).save();
        const userThree: UserDocument = await new UserModel(createUser()).save();
        const userFour: UserDocument = await new UserModel(createUser()).save();
        const userFive: UserDocument = await new UserModel(createUser()).save();

        mockImportProcess(await UserModel.findById(user.id));
        mockImportProcess(await UserModel.findById(userTwo.id));
        mockImportProcess(await UserModel.findById(userThree.id));
        mockImportProcess(await UserModel.findById(userFour.id));
        mockImportProcess(await UserModel.findById(userFive.id));

        const response: request.Response = await requester
            .get(`/auth/import-users-to-okta`)
            .set('Content-Type', 'application/json')
            .set('Authorization', `Bearer ${token}`);

        response.status.should.equal(200);
        response.body.should.have.property('imported').and.eql(5);
    });

    it('Importing users when one user does not exist in Okta and import fails returns 200 OK and no users imported (error case)', async () => {
        // Create ADMIN user in MongoDB
        const { token, user } = await createUserAndToken({ role: 'ADMIN' });

        // Mock failed request to find user in Okta
        mockGetUserByIdNotFound(user.id);

        // Mock failed request to create user in Okta
        nock(config.get('okta.url'))
            .post('/api/v1/users?activate=true')
            .reply(400, {});

        const response: request.Response = await requester
            .get(`/auth/import-users-to-okta`)
            .set('Content-Type', 'application/json')
            .set('Authorization', `Bearer ${token}`);

        response.status.should.equal(200);
        response.body.should.have.property('imported').and.eql(0);
    });

    after(async () => {
        await closeTestAgent();
    });

    afterEach(async () => {
        await UserModel.deleteMany({}).exec();

        if (!nock.isDone()) {
            throw new Error(`Not all nock interceptors were used: ${nock.pendingMocks()}`);
        }
    });
});
