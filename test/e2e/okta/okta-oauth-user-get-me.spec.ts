import nock from 'nock';
import chai from 'chai';
import type request from 'superagent';
import sinon, { SinonSandbox } from "sinon";

import {
    assertTokenInfo,
    createTokenForUser,
    createUserAndToken,
    stubConfigValue,
} from '../utils/helpers';
import { closeTestAgent, getTestAgent } from '../utils/test-server';
import { getMockOktaUser, mockOktaListUsers } from "./okta.mocks";

chai.should();

let requester: ChaiHttp.Agent;
let sandbox: SinonSandbox;

nock.disableNetConnect();
nock.enableNetConnect(process.env.HOST_IP);

describe('[OKTA] GET current user details', () => {

    before(async () => {
        if (process.env.NODE_ENV !== 'test') {
            throw Error(`Running the test suite with NODE_ENV ${process.env.NODE_ENV} may result in permanent data loss. Please use NODE_ENV=test.`);
        }

        sandbox = sinon.createSandbox();
        stubConfigValue(sandbox, { 'authProvider': 'OKTA' });

        requester = await getTestAgent();
    });

    it('Getting my user without being logged in returns a 401', async () => {
        const response: request.Response = await requester.get(`/auth/user/me`);
        response.status.should.equal(401);
    });

    it('Getting my user while being logged in with USER role returns the user', async () => {
        const { token, user } = await createUserAndToken({ role: 'USER' });
        const oktaUser = getMockOktaUser({ ...user, legacyId: user.id });
        mockOktaListUsers({ limit: 1, search: `(profile.legacyId eq "${user.id}")` }, [oktaUser]);
        const response: request.Response = await requester.get(`/auth/user/me`).set('Authorization', `Bearer ${token}`);
        assertTokenInfo(response, user);
    });

    it('Getting my user while being logged in with ADMIN role returns the user', async () => {
        const { token, user } = await createUserAndToken({ role: 'ADMIN' });
        const oktaUser = getMockOktaUser({ ...user, legacyId: user.id });
        mockOktaListUsers({ limit: 1, search: `(profile.legacyId eq "${user.id}")` }, [oktaUser]);
        const response: request.Response = await requester.get(`/auth/user/me`).set('Authorization', `Bearer ${token}`);
        assertTokenInfo(response, user);
    });

    it('Getting my user while being logged in with MICROSERVICE id returns the user', async () => {
        const token:string = await createTokenForUser({ id: 'microservice' });

        const response: request.Response = await requester
            .get(`/auth/user/me`)
            .set('Authorization', `Bearer ${token}`);

        response.status.should.equal(200);

        response.body.should.have.property('id').and.equal('microservice');
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
