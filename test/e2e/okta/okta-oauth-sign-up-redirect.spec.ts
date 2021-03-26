import nock from 'nock';
import chai from 'chai';
import type request from 'superagent';
import sinon, {SinonSandbox} from 'sinon';

import {OktaOAuthProvider, OktaUser} from 'services/okta.interfaces';
import {closeTestAgent, getTestAgent} from '../utils/test-server';
import {stubConfigValue} from '../utils/helpers';
import {getMockOktaUser, mockOktaCreateUser, mockOktaSendActivationEmail} from './okta.mocks';

chai.should();

let requester: ChaiHttp.Agent;
let sandbox: SinonSandbox;

nock.disableNetConnect();
nock.enableNetConnect(process.env.HOST_IP);

describe('[OKTA] OAuth endpoints tests - Sign up with JSON content type', () => {

    before(async () => {
        if (process.env.NODE_ENV !== 'test') {
            throw Error(`Running the test suite with NODE_ENV ${process.env.NODE_ENV} may result in permanent data loss. Please use NODE_ENV=test.`);
        }

        sandbox = sinon.createSandbox();
        stubConfigValue(sandbox, { 'authProvider': 'OKTA' });

        requester = await getTestAgent();
    });

    it('Signing up successfully and hitting the redirect endpoint should redirect the user to the origin request of the sign up - happy case', async () => {
        const user: OktaUser = getMockOktaUser({ apps: [] });
        mockOktaCreateUser(user, {
            email: user.profile.email,
            firstName: 'RW API',
            lastName: 'USER',
            name: 'RW API USER',
            provider: OktaOAuthProvider.LOCAL,
            role: 'USER',
        });
        mockOktaSendActivationEmail(user);

        const response: request.Response = await requester
            .post(`/auth/sign-up`)
            .set('Content-Type', 'application/json')
            .set('Referer', 'https://www.google.com')
            .send({ email: user.profile.email });

        response.status.should.equal(200);
        response.should.be.json;

        const redirectResponse: request.Response = await requester.get(`/auth/sign-up-redirect`).redirects(0);
        redirectResponse.status.should.equal(302);
        redirectResponse.should.redirectTo('https://www.google.com');
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
