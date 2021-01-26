import nock from 'nock';
import chai from 'chai';
import type request from 'superagent';
import sinon, { SinonSandbox } from 'sinon';

import { OktaUser } from 'services/okta.interfaces';
import { assertOktaTokenInfo, stubConfigValue } from '../utils/helpers';
import { closeTestAgent, getTestAgent } from '../utils/test-server';
import { getMockOktaUser, mockOktaListUsers, mockValidJWT } from './okta.mocks';

chai.should();

let requester: ChaiHttp.Agent;
let sandbox: SinonSandbox;

nock.disableNetConnect();
nock.enableNetConnect(process.env.HOST_IP);

describe('[OKTA] GET users by id', () => {

    before(async () => {
        if (process.env.NODE_ENV !== 'test') {
            throw Error(`Running the test suite with NODE_ENV ${process.env.NODE_ENV} may result in permanent data loss. Please use NODE_ENV=test.`);
        }

        sandbox = sinon.createSandbox();
        stubConfigValue(sandbox, { 'authProvider': 'OKTA' });

        requester = await getTestAgent();
    });

    it('Get user without being logged in returns a 401', async () => {
        const response: request.Response = await requester.get(`/auth/user/41224d776a326fb40f000001`);
        response.status.should.equal(401);
    });

    it('Get user while being logged in as a regular user returns a 403 error', async () => {
        const token: string = mockValidJWT();
        const response: request.Response = await requester
            .get(`/auth/user/41224d776a326fb40f000001`)
            .set('Authorization', `Bearer ${token}`);

        response.status.should.equal(403);
        response.body.should.have.property('errors').and.be.an('array');
        response.body.errors[0].should.have.property('detail').and.equal(`Not authorized`);
    });

    it('Get user with id of a user that does not exist returns a 404', async () => {
        const token: string = mockValidJWT({ role: 'ADMIN' });
        mockGetUserByIdNotFound('41224d776a326fb40f000001');

        const response: request.Response = await requester
            .get(`/auth/user/41224d776a326fb40f000001`)
            .set('Authorization', `Bearer ${token}`);

        response.status.should.equal(404);
        response.body.errors[0].should.have.property('detail').and.equal(`User not found`);
    });

    it('Get user with id of a user that exists returns the requested user (happy case)', async () => {
        const token: string = mockValidJWT({ role: 'ADMIN' });
        const user: OktaUser = getMockOktaUser();
        mockOktaListUsers({ limit: 1, search: `(profile.legacyId eq "${user.profile.legacyId}")` }, [user]);

        const response: request.Response = await requester
            .get(`/auth/user/${user.profile.legacyId}`)
            .set('Authorization', `Bearer ${token}`);

        assertOktaTokenInfo(response, user);
    });

    after(async () => {
        sandbox.restore();
        await closeTestAgent();
    });

    afterEach(() => {
        if (!nock.isDone()) {
            throw new Error(`Not all nock interceptors were used: ${nock.pendingMocks()}`);
        }
    });
});
