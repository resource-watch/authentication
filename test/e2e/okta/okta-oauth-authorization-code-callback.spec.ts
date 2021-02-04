import chai from 'chai';
import nock from 'nock';
import JWT from 'jsonwebtoken';

import { closeTestAgent, getTestAgent } from '../utils/test-server';
import type request from 'superagent';
import sinon, {SinonSandbox} from 'sinon';
import {getUUID, stubConfigValue} from '../utils/helpers';
import {
    getMockOktaUser,
    mockGetUserById,
    mockGetUserByOktaId,
    mockOktaOAuthToken,
    mockOktaUpdateUser
} from './okta.mocks';
import {JWTPayload, OktaOAuthTokenPayload, OktaSuccessfulOAuthTokenResponse, OktaUser} from 'services/okta.interfaces';
import config from 'config';

chai.should();

let requester: ChaiHttp.Agent;
let sandbox: SinonSandbox;

nock.disableNetConnect();
nock.enableNetConnect(process.env.HOST_IP);

const validateTokenRequestAndaPayload: (user: OktaUser) => Promise<void> = async (user) => {
    const tokenResponse: request.Response = await requester.get(`/auth/generate-token`);
    tokenResponse.body.should.have.property('token').and.be.a.string;
    const tokenPayload: JWTPayload = JWT.decode(tokenResponse.body.token) as JWTPayload;
    tokenPayload.should.have.property('id').and.eql(user.profile.legacyId);
    tokenPayload.should.have.property('role').and.eql('USER');
    tokenPayload.should.have.property('email').and.eql(user.profile.email);
    tokenPayload.should.have.property('extraUserData').and.eql({ apps: user.profile.apps });
    tokenPayload.should.have.property('photo').and.eql(user.profile.photo);
    tokenPayload.should.have.property('name').and.eql(user.profile.displayName);
};

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
        const user: OktaUser = getMockOktaUser();
        mockGetUserByOktaId(tokenData.uid, user);

        const response: request.Response = await requester
            .get(`/auth/authorization-code/callback?code=TEST_FACEBOOK_OAUTH2_CALLBACK_CODE`)
            .redirects(0);

        response.should.redirect;
        response.should.redirectTo(new RegExp(`/auth/success$`));

        await validateTokenRequestAndaPayload(user);
    });

    it('Visiting /auth/authorization-code/callback with a valid OAuth code with a callbackUrl param should redirect to the callback URL page', async () => {
        const tokenResponse: OktaSuccessfulOAuthTokenResponse = mockOktaOAuthToken();
        const tokenData: OktaOAuthTokenPayload = JWT.decode(tokenResponse.access_token) as OktaOAuthTokenPayload;
        const user: OktaUser = getMockOktaUser();
        mockGetUserByOktaId(tokenData.uid, user);

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

        await validateTokenRequestAndaPayload(user);
    });

    it('Visiting /auth/authorization-code/callback with a valid OAuth code with an updated callbackUrl param should redirect to the new callback URL page', async () => {
        const tokenResponse: OktaSuccessfulOAuthTokenResponse = mockOktaOAuthToken();
        const tokenData: OktaOAuthTokenPayload = JWT.decode(tokenResponse.access_token) as OktaOAuthTokenPayload;
        const user: OktaUser = getMockOktaUser();
        mockGetUserByOktaId(tokenData.uid, user);

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

        await validateTokenRequestAndaPayload(user);
    });

    it('Visiting /auth/authorization-code/callback with a valid OAuth code should redirect to the login successful page', async () => {
        const tokenResponse: OktaSuccessfulOAuthTokenResponse = mockOktaOAuthToken();
        const tokenData: OktaOAuthTokenPayload = JWT.decode(tokenResponse.access_token) as OktaOAuthTokenPayload;
        const user: OktaUser = getMockOktaUser();
        mockGetUserByOktaId(tokenData.uid, user);

        const response: request.Response = await requester
            .get(`/auth/authorization-code/callback?code=TEST_FACEBOOK_OAUTH2_CALLBACK_CODE`)
            .redirects(0);

        response.should.redirect;
        response.should.redirectTo(new RegExp(`/auth/success$`));

        await validateTokenRequestAndaPayload(user);
    });

    it('If the user returned does not have legacyId, role or apps set, the user is updated and the request is still redirected to the login successful page', async () => {
        const token: OktaSuccessfulOAuthTokenResponse = mockOktaOAuthToken();
        const tokenData: OktaOAuthTokenPayload = JWT.decode(token.access_token) as OktaOAuthTokenPayload;
        const user: OktaUser = getMockOktaUser({ legacyId: null, role: null, apps: null });
        mockGetUserByOktaId(tokenData.uid, user);

        const legacyId: string = getUUID();

        // Mock update of protected user fields
        nock(config.get('okta.url'))
            .post(`/api/v1/users/${user.id}`, (body) => !!body.profile.legacyId
                && body.profile.role === 'USER'
                && !!body.profile.apps
            )
            .reply(200, {
                ...user,
                profile: {
                    ...user.profile,
                    legacyId,
                    role: 'USER',
                    apps: [],
                }
            });

        const response: request.Response = await requester
            .get(`/auth/authorization-code/callback?code=TEST_FACEBOOK_OAUTH2_CALLBACK_CODE`)
            .redirects(0);

        response.should.redirect;
        response.should.redirectTo(new RegExp(`/auth/success$`));

        await validateTokenRequestAndaPayload({
            ... user,
            profile: {
                ...user.profile,
                legacyId,
                role: 'USER',
                apps: [],
            }
        });
    });

    it('User applications are correctly updated if provided by query parameter when visiting /auth/authorization-code/callback with a valid OAuth codes', async () => {
        const tokenResponse: OktaSuccessfulOAuthTokenResponse = mockOktaOAuthToken();
        const tokenData: OktaOAuthTokenPayload = JWT.decode(tokenResponse.access_token) as OktaOAuthTokenPayload;
        const user: OktaUser = getMockOktaUser();
        mockGetUserByOktaId(tokenData.uid, user);

        // Requests for updating user applications
        mockGetUserById(user);
        mockOktaUpdateUser(user, { apps: ['rw', 'gfw'] });

        await requester.get(`/auth?applications=rw,gfw`);

        const responseOne: request.Response = await requester
            .get(`/auth/authorization-code/callback?code=TEST_FACEBOOK_OAUTH2_CALLBACK_CODE`)
            .redirects(0);

        responseOne.should.redirect;
        responseOne.should.redirectTo(new RegExp(`/auth/success$`));

        await validateTokenRequestAndaPayload({ ...user, profile: { ...user.profile, apps: ['rw', 'gfw' ]} });
    });

    afterEach(async () => {
        if (!nock.isDone()) {
            throw new Error(`Not all nock interceptors were used: ${nock.pendingMocks()}`);
        }

        sandbox.restore();
        await closeTestAgent();
    });
});
