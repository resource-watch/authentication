import chai from 'chai';
import nock from 'nock';
import JWT from 'jsonwebtoken';

import { closeTestAgent, getTestAgent } from '../utils/test-server';
import type request from 'superagent';
import sinon, {SinonSandbox} from 'sinon';
import {stubConfigValue} from '../utils/helpers';
import {getMockOktaUser, mockGetUserByOktaId, mockOktaOAuthToken} from './okta.mocks';
import {OktaOAuthTokenPayload, OktaSuccessfulOAuthTokenResponse, OktaUser} from 'services/okta.interfaces';

chai.should();

let requester: ChaiHttp.Agent;
let sandbox: SinonSandbox;

nock.disableNetConnect();
nock.enableNetConnect(process.env.HOST_IP);

describe('[OKTA] Authorization code callback endpoint tests', () => {

    before(async () => {
        if (process.env.NODE_ENV !== 'test') {
            throw Error(`Running the test suite with NODE_ENV ${process.env.NODE_ENV} may result in permanent data loss. Please use NODE_ENV=test.`);
        }
    });

    beforeEach(async () => {
        sandbox = sinon.createSandbox();
        stubConfigValue(sandbox, { 'authProvider': 'OKTA' });

        requester = await getTestAgent(true);
    });

    it('Visiting /auth/authorization-code/callback with no code provided should return redirect to auth failure page', async () => {
        const response: request.Response = await requester.get(`/auth/authorization-code/callback`);
        response.should.redirectTo(new RegExp(`/auth/fail`));
    });

    it('Visiting /auth/authorization-code/callback with error query parameter should return redirect to auth failure page', async () => {
        const response: request.Response = await requester.get(`/auth/authorization-code/callback?error=some_error`);
        response.should.redirectTo(new RegExp(`/auth/fail`));
    });

    it('Visiting /auth/authorization-code/callback with a valid OAuth code should redirect to the login successful page', async () => {
        const tokenResponse: OktaSuccessfulOAuthTokenResponse = mockOktaOAuthToken();
        const tokenData: OktaOAuthTokenPayload = JWT.decode(tokenResponse.access_token) as OktaOAuthTokenPayload;
        const userData: OktaUser = getMockOktaUser();
        mockGetUserByOktaId(tokenData.uid, userData);

        const response: request.Response = await requester
            .get(`/auth/authorization-code/callback?code=TEST_FACEBOOK_OAUTH2_CALLBACK_CODE`)
            .redirects(0);

        response.should.redirect;
        response.should.redirectTo(new RegExp(`/auth/success$`));
    });

    it('Visiting /auth/facebook/callback with a valid OAuth code with a callbackUrl param should redirect to the callback URL page', async () => {
        const tokenResponse: OktaSuccessfulOAuthTokenResponse = mockOktaOAuthToken();
        const tokenData: OktaOAuthTokenPayload = JWT.decode(tokenResponse.access_token) as OktaOAuthTokenPayload;
        const userData: OktaUser = getMockOktaUser();
        mockGetUserByOktaId(tokenData.uid, userData);

        nock('https://www.wikipedia.org')
            .get('/')
            .reply(200, 'ok');

        await requester.get(`/auth?callbackUrl=https://www.wikipedia.org`);

        const responseOne: request.Response = await requester
            .get(`/auth/authorization-code/callback?code=TEST_FACEBOOK_OAUTH2_CALLBACK_CODE`)
            .redirects(0);

        responseOne.should.redirect;
        responseOne.should.redirectTo(new RegExp(`/auth/success$`));

        const responseTwo: request.Response = await requester.get('/auth/success');
        responseTwo.should.redirect;
        responseTwo.should.redirectTo('https://www.wikipedia.org/');
    });

    it('Visiting /auth/facebook/callback with a valid OAuth code with an updated callbackUrl param should redirect to the new callback URL page', async () => {
        const tokenResponse: OktaSuccessfulOAuthTokenResponse = mockOktaOAuthToken();
        const tokenData: OktaOAuthTokenPayload = JWT.decode(tokenResponse.access_token) as OktaOAuthTokenPayload;
        const userData: OktaUser = getMockOktaUser();
        mockGetUserByOktaId(tokenData.uid, userData);

        nock('https://www.wri.org')
            .get('/')
            .reply(200, 'ok');

        await requester.get(`/auth?callbackUrl=https://www.google.com`);

        await requester.get(`/auth?callbackUrl=https://www.wri.org`);

        const responseOne: request.Response = await requester
            .get(`/auth/authorization-code/callback?code=TEST_FACEBOOK_OAUTH2_CALLBACK_CODE`)
            .redirects(0);

        responseOne.should.redirect;
        responseOne.should.redirectTo(new RegExp(`/auth/success$`));

        const responseTwo: request.Response = await requester.get('/auth/success');
        responseTwo.should.redirect;
        responseTwo.should.redirectTo('https://www.wri.org/');
    });

    it('Visiting /auth/authorization-code/callback with a valid OAuth code should redirect to the login successful page', async () => {
        const tokenResponse: OktaSuccessfulOAuthTokenResponse = mockOktaOAuthToken();
        const tokenData: OktaOAuthTokenPayload = JWT.decode(tokenResponse.access_token) as OktaOAuthTokenPayload;
        const userData: OktaUser = getMockOktaUser();
        mockGetUserByOktaId(tokenData.uid, userData);

        const response: request.Response = await requester
            .get(`/auth/authorization-code/callback?code=TEST_FACEBOOK_OAUTH2_CALLBACK_CODE`)
            .redirects(0);

        response.should.redirect;
        response.should.redirectTo(new RegExp(`/auth/success$`));
    });

    afterEach(async () => {
        if (!nock.isDone()) {
            throw new Error(`Not all nock interceptors were used: ${nock.pendingMocks()}`);
        }

        sandbox.restore();
        await closeTestAgent();
    });
});
