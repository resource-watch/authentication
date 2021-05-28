import nock from 'nock';
import chai from 'chai';
import type request from 'superagent';

import { OktaUser } from 'services/okta.interfaces';
import { closeTestAgent, getTestAgent } from '../utils/test-server';
import {
    getMockOktaUser, mockGetUserById,
    mockGetUserByIdNotFound, mockGetUserByOktaId,
    mockOktaDeleteUser,
    mockValidJWT
} from './okta.mocks';
import CacheService from 'services/cache.service';
import Should = Chai.Should;
import config from 'config';

const should: Should = chai.should();

let requester: ChaiHttp.Agent;

nock.disableNetConnect();
nock.enableNetConnect(process.env.HOST_IP);

describe('[OKTA] User management endpoints tests - Delete user', () => {

    before(async () => {
        if (process.env.NODE_ENV !== 'test') {
            throw Error(`Running the test suite with NODE_ENV ${process.env.NODE_ENV} may result in permanent data loss. Please use NODE_ENV=test.`);
        }

        requester = await getTestAgent();
    });

    it('Deleting a user while not logged in should return 401 Unauthorized', async () => {
        const response: request.Response = await requester
            .delete(`/auth/user/123`)
            .set('Content-Type', 'application/json');

        response.status.should.equal(401);
        response.body.should.have.property('errors').and.be.an('array');
        response.body.errors[0].status.should.equal(401);
        response.body.errors[0].detail.should.equal('Not authenticated');
    });

    it('Deleting a user while logged in as a USER should return 403 Forbidden', async () => {
        const token: string = mockValidJWT({ role: 'USER' });
        const response: request.Response = await requester
            .delete(`/auth/user/123`)
            .set('Content-Type', 'application/json')
            .set('Authorization', `Bearer ${token}`);

        response.status.should.equal(403);
        response.body.should.have.property('errors').and.be.an('array');
        response.body.errors[0].status.should.equal(403);
        response.body.errors[0].detail.should.equal('Not authorized');
    });

    it('Deleting a user while logged in as a MANAGER should return 403 Forbidden', async () => {
        const token: string = mockValidJWT({ role: 'MANAGER' });
        const response: request.Response = await requester
            .delete(`/auth/user/123`)
            .set('Content-Type', 'application/json')
            .set('Authorization', `Bearer ${token}`);

        response.status.should.equal(403);
        response.body.should.have.property('errors').and.be.an('array');
        response.body.errors[0].status.should.equal(403);
        response.body.errors[0].detail.should.equal('Not authorized');
    });

    it('Deleting a non-existing user while logged in as an ADMIN should return 404 Not Found', async () => {
        const token: string = mockValidJWT({ role: 'ADMIN' });
        mockGetUserByIdNotFound('123');

        const response: request.Response = await requester
            .delete(`/auth/user/123`)
            .set('Content-Type', 'application/json')
            .set('Authorization', `Bearer ${token}`);

        response.status.should.equal(404);
        response.body.should.have.property('errors').and.be.an('array');
        response.body.errors[0].status.should.equal(404);
        response.body.errors[0].detail.should.equal('User not found');
    });

    it('Deleting a existing user while logged in as an ADMIN should return 200 OK with the deleted user data', async () => {
        const token: string = mockValidJWT({ role: 'ADMIN' });
        const user: OktaUser = getMockOktaUser();

        mockGetUserById(user);
        mockOktaDeleteUser(user);
        mockGetUserByOktaId(user.id, user, 1);
        mockOktaDeleteUser(user);

        const response: request.Response = await requester
            .delete(`/auth/user/${user.profile.legacyId}`)
            .set('Content-Type', 'application/json')
            .set('Authorization', `Bearer ${token}`);

        response.status.should.equal(200);
        response.body.should.be.an('object');
        response.body.data.should.have.property('id').and.eql(user.profile.legacyId);
    });

    it('Deleting a deactivated user while logged in as an ADMIN should return 200 OK with the deleted user data', async () => {
        const token: string = mockValidJWT({ role: 'ADMIN' });
        const user: OktaUser = getMockOktaUser();

        mockGetUserById(user);
        mockOktaDeleteUser(user);
        nock(config.get('okta.url'))
            .get(`/api/v1/users/${user.id}`)
            .reply(404, {
                errorCode: 'E0000007',
                errorSummary: `Not found: Resource not found: ${user.id} (User)`,
                errorLink: 'E0000007',
                errorId: 'oaesbELdOmpRsax4UknivKcfg',
                errorCauses: []
            });

        const response: request.Response = await requester
            .delete(`/auth/user/${user.profile.legacyId}`)
            .set('Content-Type', 'application/json')
            .set('Authorization', `Bearer ${token}`);

        response.status.should.equal(200);
        response.body.should.be.an('object');
        response.body.data.should.have.property('id').and.eql(user.profile.legacyId);
    });

    it('Redis cache is cleared after a user is deleted', async () => {
        const token: string = mockValidJWT({ role: 'ADMIN' });
        const user: OktaUser = getMockOktaUser();
        mockGetUserById(user);
        mockOktaDeleteUser(user);
        mockGetUserByOktaId(user.id, user, 1);
        mockOktaDeleteUser(user);

        // Assert value does not exist in cache before
        const value: OktaUser = await CacheService.get(`okta-user-${user.profile.legacyId}`);
        should.not.exist(value);

        // Store it in cache
        await CacheService.set(`okta-user-${user.profile.legacyId}`, user);
        const value2: OktaUser = await CacheService.get(`okta-user-${user.profile.legacyId}`);
        should.exist(value2);

        const response: request.Response = await requester
            .delete(`/auth/user/${user.profile.legacyId}`)
            .set('Content-Type', 'application/json')
            .set('Authorization', `Bearer ${token}`);

        response.status.should.equal(200);
        response.body.should.be.an('object');
        response.body.data.should.have.property('id').and.eql(user.profile.legacyId);

        // Assert value does not exist in cache after
        const value3: OktaUser = await CacheService.get(`okta-user-${user.profile.legacyId}`);
        should.not.exist(value3);
    });

    after(async () => {
        await closeTestAgent();
    });

    afterEach(async () => {
        if (!nock.isDone()) {
            throw new Error(`Not all nock interceptors were used: ${nock.pendingMocks()}`);
        }
    });
});
