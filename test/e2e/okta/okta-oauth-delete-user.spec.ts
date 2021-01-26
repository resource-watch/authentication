import nock from 'nock';
import chai from 'chai';
import type request from 'superagent';
import sinon, { SinonSandbox } from 'sinon';

import { OktaUser } from 'services/okta.interfaces';
import { closeTestAgent, getTestAgent } from '../utils/test-server';
import { stubConfigValue } from '../utils/helpers';
import {
    getMockOktaUser,
    mockGetUserByIdNotFound,
    mockOktaDeleteUser,
    mockValidJWT
} from './okta.mocks';

chai.should();

let requester: ChaiHttp.Agent;
let sandbox: SinonSandbox;

nock.disableNetConnect();
nock.enableNetConnect(process.env.HOST_IP);

describe('[OKTA] User management endpoints tests - Delete user', () => {

    before(async () => {
        if (process.env.NODE_ENV !== 'test') {
            throw Error(`Running the test suite with NODE_ENV ${process.env.NODE_ENV} may result in permanent data loss. Please use NODE_ENV=test.`);
        }

        sandbox = sinon.createSandbox();
        stubConfigValue(sandbox, { 'authProvider': 'OKTA' });

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
        mockOktaDeleteUser(user);

        const response: request.Response = await requester
            .delete(`/auth/user/${user.profile.legacyId}`)
            .set('Content-Type', 'application/json')
            .set('Authorization', `Bearer ${token}`);

        response.status.should.equal(200);
        response.body.should.be.an('object');
        response.body.data.should.have.property('id').and.eql(user.profile.legacyId);
    });

    after(async () => {
        sandbox.restore();
        await closeTestAgent();
    });

    afterEach(async () => {
        if (!nock.isDone()) {
            throw new Error(`Not all nock interceptors were used: ${nock.pendingMocks()}`);
        }
    });
});
