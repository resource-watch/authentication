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

describe('[OKTA] GET current user details from token (to be called by other MSs)', () => {

    before(async () => {
        if (process.env.NODE_ENV !== 'test') {
            throw Error(`Running the test suite with NODE_ENV ${process.env.NODE_ENV} may result in permanent data loss. Please use NODE_ENV=test.`);
        }

        sandbox = sinon.createSandbox();
        stubConfigValue(sandbox, { 'authProvider': 'OKTA' });

        requester = await getTestAgent();
    });

    it('Getting user details from token without being logged in returns a 401', async () => {
        const response: request.Response = await requester.get(`/auth/user/me`);
        response.status.should.equal(401);
    });

    it('Getting user details from token while being logged in with USER role returns 200 OK with the token data', async () => {
        const user: OktaUser = getMockOktaUser();
        const token: string = mockValidJWT({
            id: user.profile.legacyId,
            email: user.profile.email,
            role: user.profile.role,
            extraUserData: { apps: user.profile.apps },
        });
        mockOktaListUsers({ limit: 1, search: `(profile.legacyId eq "${user.profile.legacyId}")` }, [user]);

        const response: request.Response = await requester.get(`/auth/user/from-token`).set('Authorization', `Bearer ${token}`);
        assertOktaTokenInfo(response, user);
    });

    it('Getting user details from token while being logged in with MANAGER role returns 200 OK with the token data', async () => {
        const user: OktaUser = getMockOktaUser({ role: 'MANAGER' });
        const token: string = mockValidJWT({
            id: user.profile.legacyId,
            email: user.profile.email,
            role: user.profile.role,
            extraUserData: { apps: user.profile.apps },
        });
        mockOktaListUsers({ limit: 1, search: `(profile.legacyId eq "${user.profile.legacyId}")` }, [user]);

        const response: request.Response = await requester.get(`/auth/user/from-token`).set('Authorization', `Bearer ${token}`);
        assertOktaTokenInfo(response, user);
    });

    it('Getting user details from token while being logged in with ADMIN role returns 200 OK with the token data', async () => {
        const user: OktaUser = getMockOktaUser({ role: 'ADMIN' });
        const token: string = mockValidJWT({
            id: user.profile.legacyId,
            email: user.profile.email,
            role: user.profile.role,
            extraUserData: { apps: user.profile.apps },
        });
        mockOktaListUsers({ limit: 1, search: `(profile.legacyId eq "${user.profile.legacyId}")` }, [user]);

        const response: request.Response = await requester.get(`/auth/user/from-token`).set('Authorization', `Bearer ${token}`);
        assertOktaTokenInfo(response, user);
    });

    it('Getting user details from token while being logged in with MICROSERVICE role returns 200 OK with the token data', async () => {
        const user: OktaUser = getMockOktaUser({ role: 'MICROSERVICE' });
        const token: string = mockValidJWT({
            id: user.profile.legacyId,
            email: user.profile.email,
            role: user.profile.role,
            extraUserData: { apps: user.profile.apps },
        });
        mockOktaListUsers({ limit: 1, search: `(profile.legacyId eq "${user.profile.legacyId}")` }, [user]);

        const response: request.Response = await requester.get(`/auth/user/from-token`).set('Authorization', `Bearer ${token}`);
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
