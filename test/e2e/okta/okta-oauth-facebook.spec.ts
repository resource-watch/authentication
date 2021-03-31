import chai from 'chai';
import config from 'config';
import nock from 'nock';
import crypto from 'crypto';
import JWT from 'jsonwebtoken';

import {closeTestAgent, getTestAgent} from '../utils/test-server';
import type request from 'superagent';
import sinon, {SinonSandbox} from 'sinon';
import {stubConfigValue} from '../utils/helpers';
import {
    getMockOktaUser,
    mockOktaCreateUser,
    mockOktaListUsers,
    mockOktaSendActivationEmail,
    mockOktaUpdateUser
} from './okta.mocks';
import {JWTPayload, OktaOAuthProvider, OktaUser} from 'services/okta.interfaces';

chai.should();

let requester: ChaiHttp.Agent;
let sandbox: SinonSandbox;

nock.disableNetConnect();
nock.enableNetConnect(process.env.HOST_IP);

describe('[OKTA] Facebook auth endpoint tests', () => {

    before(async () => {
        if (process.env.NODE_ENV !== 'test') {
            throw Error(`Running the test suite with NODE_ENV ${process.env.NODE_ENV} may result in permanent data loss. Please use NODE_ENV=test.`);
        }
    });

    beforeEach(async () => {
        sandbox = sinon.createSandbox();
        stubConfigValue(sandbox, {
            'authProvider': 'OKTA',
            'okta.gfw.facebook.idp': 'GFW_FB_IDP',
            'okta.rw.facebook.idp': 'RW_FB_IDP',
            'okta.prep.facebook.idp': 'PREP_FB_IDP',
        });

        requester = await getTestAgent(true);
    });

    it('Visiting /auth/facebook while not being logged in should redirect to Okta\'s OAuth URL', async () => {
        const response: request.Response = await requester.get(`/auth/facebook`).redirects(0);
        response.should.redirect;
        response.header.location.should.contain(config.get('okta.url'));
        response.header.location.should.match(/oauth2\/default\/v1\/authorize/);
        response.header.location.should.contain(`client_id=${config.get('okta.clientId')}`);
        response.header.location.should.contain(`response_type=code`);
        response.header.location.should.contain(`response_mode=query`);
        response.header.location.should.match(/scope=openid(.*)profile(.*)email/);
        response.header.location.should.contain(`idp=${config.get('okta.rw.facebook.idp')}`);
        response.header.location.should.match(/state=\w/);

        const encodedRedirectUri: string = encodeURIComponent(`${config.get('server.publicUrl')}/auth/authorization-code/callback`);
        response.header.location.should.contain(`redirect_uri=${encodedRedirectUri}`);
    });

    it('Visiting /auth/facebook with query parameter indicating GFW should redirect to Okta\'s OAuth URL with the correct IDP for GFW', async () => {
        const response: request.Response = await requester.get(`/auth/facebook?origin=gfw`).redirects(0);
        response.should.redirect;
        response.header.location.should.contain(config.get('okta.url'));
        response.header.location.should.match(/oauth2\/default\/v1\/authorize/);
        response.header.location.should.contain(`client_id=${config.get('okta.clientId')}`);
        response.header.location.should.contain(`response_type=code`);
        response.header.location.should.contain(`response_mode=query`);
        response.header.location.should.match(/scope=openid(.*)profile(.*)email/);
        response.header.location.should.contain(`idp=${config.get('okta.gfw.facebook.idp')}`);
        response.header.location.should.match(/state=\w/);

        const encodedRedirectUri: string = encodeURIComponent(`${config.get('server.publicUrl')}/auth/authorization-code/callback`);
        response.header.location.should.contain(`redirect_uri=${encodedRedirectUri}`);
    });

    it('Visiting /auth/facebook with query parameter indicating PREP should redirect to Okta\'s OAuth URL with the correct IDP for PREP', async () => {
        const response: request.Response = await requester.get(`/auth/facebook?origin=prep`).redirects(0);
        response.should.redirect;
        response.header.location.should.contain(config.get('okta.url'));
        response.header.location.should.match(/oauth2\/default\/v1\/authorize/);
        response.header.location.should.contain(`client_id=${config.get('okta.clientId')}`);
        response.header.location.should.contain(`response_type=code`);
        response.header.location.should.contain(`response_mode=query`);
        response.header.location.should.match(/scope=openid(.*)profile(.*)email/);
        response.header.location.should.contain(`idp=${config.get('okta.prep.facebook.idp')}`);
        response.header.location.should.match(/state=\w/);

        const encodedRedirectUri: string = encodeURIComponent(`${config.get('server.publicUrl')}/auth/authorization-code/callback`);
        response.header.location.should.contain(`redirect_uri=${encodedRedirectUri}`);
    });

    it('Visiting /auth/facebook/token with a valid Facebook OAuth token for an existing user should generate a new token for the existing user', async () => {
        const providerId: string = '10216001184997572';
        const user: OktaUser = getMockOktaUser({
            email: 'john.doe@vizzuality.com',
            displayName: 'John Doe',
            provider: OktaOAuthProvider.FACEBOOK,
            providerId,
        });

        mockOktaListUsers({
            limit: 1,
            search: `(profile.provider eq "${OktaOAuthProvider.FACEBOOK}") and (profile.providerId eq "${providerId}")`
        }, [user]);

        mockOktaUpdateUser(user, { email: 'john.doe@vizzuality.com' });

        const proof: string = crypto.createHmac('sha256', config.get('settings.thirdParty.rw.facebook.clientSecret'))
            .update('TEST_FACEBOOK_OAUTH2_ACCESS_TOKEN')
            .digest('hex');

        nock('https://graph.facebook.com')
            .get('/v2.6/me')
            .query({
                appsecret_proof: proof,
                fields: 'id,name,last_name,first_name,middle_name,email',
                access_token: 'TEST_FACEBOOK_OAUTH2_ACCESS_TOKEN'
            })
            .reply(200, {
                id: providerId,
                name: 'John Doe',
                last_name: 'Doe',
                first_name: 'John',
                email: 'john.doe@vizzuality.com'
            });

        const response: request.Response = await requester.get(`/auth/facebook/token?access_token=TEST_FACEBOOK_OAUTH2_ACCESS_TOKEN`);
        response.status.should.equal(200);
        response.should.be.json;
        response.body.should.be.an('object');
        response.body.should.have.property('token').and.be.a('string');

        const tokenPayload: JWTPayload = JWT.verify(response.body.token, process.env.JWT_SECRET) as JWTPayload;
        tokenPayload.should.have.property('id').and.eql(user.profile.legacyId);
        tokenPayload.should.have.property('role').and.eql('USER');
        tokenPayload.should.have.property('email').and.eql(user.profile.email);
        tokenPayload.should.have.property('extraUserData').and.eql({ apps: user.profile.apps });
        tokenPayload.should.have.property('photo').and.eql(user.profile.photo);
        tokenPayload.should.have.property('name').and.eql(user.profile.displayName);
    });

    it('Visiting /auth/facebook/token with a valid Facebook OAuth token for an NON-existing user should create the user and generate a new token', async () => {
        const providerId: string = '10216001184997572';
        const user: OktaUser = getMockOktaUser({
            email: 'john.doe@vizzuality.com',
            displayName: 'John Doe',
            provider: OktaOAuthProvider.FACEBOOK,
            providerId,
        });

        mockOktaListUsers({
            limit: 1,
            search: `(profile.provider eq "${OktaOAuthProvider.FACEBOOK}") and (profile.providerId eq "${providerId}")`
        }, []);

        mockOktaCreateUser(user, {
            email: 'john.doe@vizzuality.com',
            name: 'John Doe',
            photo: null,
            role: 'USER',
            apps: [],
            provider: OktaOAuthProvider.FACEBOOK,
        });

        mockOktaSendActivationEmail(user);

        const proof: string = crypto.createHmac('sha256', config.get('settings.thirdParty.rw.facebook.clientSecret'))
            .update('TEST_FACEBOOK_OAUTH2_ACCESS_TOKEN')
            .digest('hex');

        nock('https://graph.facebook.com')
            .get('/v2.6/me')
            .query({
                appsecret_proof: proof,
                fields: 'id,name,last_name,first_name,middle_name,email',
                access_token: 'TEST_FACEBOOK_OAUTH2_ACCESS_TOKEN'
            })
            .reply(200, {
                id: providerId,
                name: 'John Doe',
                last_name: 'Doe',
                first_name: 'John',
                email: 'john.doe@vizzuality.com'
            });

        const response: request.Response = await requester.get(`/auth/facebook/token?access_token=TEST_FACEBOOK_OAUTH2_ACCESS_TOKEN`);
        response.status.should.equal(200);
        response.should.be.json;
        response.body.should.be.an('object');
        response.body.should.have.property('token').and.be.a('string');

        const tokenPayload: JWTPayload = JWT.verify(response.body.token, process.env.JWT_SECRET) as JWTPayload;
        tokenPayload.should.have.property('id').and.eql(user.profile.legacyId);
        tokenPayload.should.have.property('role').and.eql('USER');
        tokenPayload.should.have.property('email').and.eql(user.profile.email);
        tokenPayload.should.have.property('extraUserData').and.eql({ apps: user.profile.apps });
        tokenPayload.should.have.property('photo').and.eql(user.profile.photo);
        tokenPayload.should.have.property('name').and.eql(user.profile.displayName);
    });

    afterEach(async () => {
        if (!nock.isDone()) {
            throw new Error(`Not all nock interceptors were used: ${nock.pendingMocks()}`);
        }

        sandbox.restore();
        await closeTestAgent();
    });
});
