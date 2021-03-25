import nock from 'nock';
import chai from 'chai';
import type request from 'superagent';
import sinon, { SinonSandbox } from 'sinon';

import { OktaUser } from 'services/okta.interfaces';
import { assertOktaTokenInfo, stubConfigValue } from '../utils/helpers';
import { closeTestAgent, getTestAgent } from '../utils/test-server';
import { getMockOktaUser, mockOktaListUsers, mockValidJWT, mockOktaLogoutUser } from './okta.mocks';

chai.should();

let requester: ChaiHttp.Agent;
let sandbox: SinonSandbox;

nock.disableNetConnect();
nock.enableNetConnect(process.env.HOST_IP);

describe('[OKTA] GET logout current user session', () => {

    before(async () => {
        if (process.env.NODE_ENV !== 'test') {
            throw Error(`Running the test suite with NODE_ENV ${process.env.NODE_ENV} may result in permanent data loss. Please use NODE_ENV=test.`);
        }

        sandbox = sinon.createSandbox();
        stubConfigValue(sandbox, { 'authProvider': 'OKTA' });

        requester = await getTestAgent();
    });

    it('Logging out without being logged in returns a 401', async () => {
        const response: request.Response = await requester.get(`/auth/logout`);
        response.status.should.equal(401);
    });

    it('Logging out while being logged in with USER role should be successful', async () => {
        const user: OktaUser = getMockOktaUser();
        const token: string = mockValidJWT({
            id: user.profile.legacyId,
            email: user.profile.email,
            role: user.profile.role,
            extraUserData: { apps: user.profile.apps },
        });
        mockOktaListUsers({ limit: 1, search: `(profile.legacyId eq "${user.profile.legacyId}")` }, [user]);

        mockOktaLogoutUser(user.id);

        const response: request.Response = await requester.get(`/auth/logout`).set('Authorization', `Bearer ${token}`);
        response.status.should.equal(200);
    });

    it('Logging out while being logged in with MANAGER role should be successful', async () => {
        const user: OktaUser = getMockOktaUser({ role: 'MANAGER' });
        const token: string = mockValidJWT({
            id: user.profile.legacyId,
            email: user.profile.email,
            role: user.profile.role,
            extraUserData: { apps: user.profile.apps },
        });
        mockOktaListUsers({ limit: 1, search: `(profile.legacyId eq "${user.profile.legacyId}")` }, [user]);

        mockOktaLogoutUser(user.id);

        const response: request.Response = await requester.get(`/auth/logout`).set('Authorization', `Bearer ${token}`);
        response.status.should.equal(200);
    });

    it('Logging out while being logged in with ADMIN role should be successful', async () => {
        const user: OktaUser = getMockOktaUser({ role: 'ADMIN' });
        const token: string = mockValidJWT({
            id: user.profile.legacyId,
            email: user.profile.email,
            role: user.profile.role,
            extraUserData: { apps: user.profile.apps },
        });
        mockOktaListUsers({ limit: 1, search: `(profile.legacyId eq "${user.profile.legacyId}")` }, [user]);

        mockOktaLogoutUser(user.id);

        const response: request.Response = await requester.get(`/auth/logout`).set('Authorization', `Bearer ${token}`);
        response.status.should.equal(200);
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
