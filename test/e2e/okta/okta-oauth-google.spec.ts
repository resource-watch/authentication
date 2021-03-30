import nock from 'nock';
import chai from 'chai';
import config from 'config';
import JWT from 'jsonwebtoken';
import chaiString from 'chai-string';

import {closeTestAgent, getTestAgent} from '../utils/test-server';
import type request from 'superagent';
import sinon, {SinonSandbox} from 'sinon';
import {stubConfigValue} from '../utils/helpers';
import {JWTPayload, OktaOAuthProvider, OktaUser} from 'services/okta.interfaces';
import {
    getMockOktaUser,
    mockOktaCreateUser,
    mockOktaListUsers,
    mockOktaSendActivationEmail,
    mockOktaUpdateUser
} from './okta.mocks';

chai.should();
chai.use(chaiString);

let requester: ChaiHttp.Agent;
let sandbox: SinonSandbox;

nock.disableNetConnect();
nock.enableNetConnect(process.env.HOST_IP);

describe('[OKTA] Google auth endpoint tests', () => {

    before(async () => {
        if (process.env.NODE_ENV !== 'test') {
            throw Error(`Running the test suite with NODE_ENV ${process.env.NODE_ENV} may result in permanent data loss. Please use NODE_ENV=test.`);
        }
    });

    beforeEach(async () => {
        sandbox = sinon.createSandbox();
        stubConfigValue(sandbox, {
            'authProvider': 'OKTA',
            'okta.gfw.google.idp': 'GFW_GOOGLE_IDP',
            'okta.rw.google.idp': 'RW_GOOGLE_IDP',
            'okta.prep.google.idp': 'PREP_GOOGLE_IDP',
        });

        requester = await getTestAgent(true);
    });

    it('Visiting /auth/google while not being logged in should redirect to Okta\'s OAuth URL', async () => {
        const response: request.Response = await requester.get(`/auth/google`).redirects(0);
        response.should.redirect;
        response.header.location.should.contain(config.get('okta.url'));
        response.header.location.should.match(/oauth2\/default\/v1\/authorize/);
        response.header.location.should.contain(`client_id=${config.get('okta.clientId')}`);
        response.header.location.should.contain(`response_type=code`);
        response.header.location.should.contain(`response_mode=query`);
        response.header.location.should.match(/scope=openid(.*)profile(.*)email/);
        response.header.location.should.contain(`idp=${config.get('okta.rw.google.idp')}`);
        response.header.location.should.match(/state=\w/);

        const encodedRedirectUri: string = encodeURIComponent(`${config.get('server.publicUrl')}/auth/authorization-code/callback`);
        response.header.location.should.contain(`redirect_uri=${encodedRedirectUri}`);
    });

    it('Visiting /auth/google with query parameter indicating PREP should redirect to Okta\'s OAuth URL with the correct IDP for PREP', async () => {
        const response: request.Response = await requester.get(`/auth/google?origin=prep`).redirects(0);
        response.should.redirect;
        response.header.location.should.contain(config.get('okta.url'));
        response.header.location.should.match(/oauth2\/default\/v1\/authorize/);
        response.header.location.should.contain(`client_id=${config.get('okta.clientId')}`);
        response.header.location.should.contain(`response_type=code`);
        response.header.location.should.contain(`response_mode=query`);
        response.header.location.should.match(/scope=openid(.*)profile(.*)email/);
        response.header.location.should.contain(`idp=${config.get('okta.prep.google.idp')}`);
        response.header.location.should.match(/state=\w/);

        const encodedRedirectUri: string = encodeURIComponent(`${config.get('server.publicUrl')}/auth/authorization-code/callback`);
        response.header.location.should.contain(`redirect_uri=${encodedRedirectUri}`);
    });

    it('Visiting /auth/google with query parameter indicating GFW should redirect to Okta\'s OAuth URL with the correct IDP for GFW', async () => {
        const response: request.Response = await requester.get(`/auth/google?origin=gfw`).redirects(0);
        response.should.redirect;
        response.header.location.should.contain(config.get('okta.url'));
        response.header.location.should.match(/oauth2\/default\/v1\/authorize/);
        response.header.location.should.contain(`client_id=${config.get('okta.clientId')}`);
        response.header.location.should.contain(`response_type=code`);
        response.header.location.should.contain(`response_mode=query`);
        response.header.location.should.match(/scope=openid(.*)profile(.*)email/);
        response.header.location.should.contain(`idp=${config.get('okta.gfw.google.idp')}`);
        response.header.location.should.match(/state=\w/);

        const encodedRedirectUri: string = encodeURIComponent(`${config.get('server.publicUrl')}/auth/authorization-code/callback`);
        response.header.location.should.contain(`redirect_uri=${encodedRedirectUri}`);
    });

    it('Visiting /auth/google/token with a valid Google OAuth token for an existing user should generate a new token for the existing user', async () => {
        const providerId: string = '113994825016233013735';
        const user: OktaUser = getMockOktaUser({
            email: 'john.doe@vizzuality.com',
            displayName: 'John Doe',
            provider: OktaOAuthProvider.GOOGLE,
            providerId,
        });

        mockOktaListUsers({
            limit: 1,
            search: `(profile.provider eq "${OktaOAuthProvider.GOOGLE}") and (profile.providerId eq "${providerId}")`
        }, [user]);

        mockOktaUpdateUser(user, { email: 'john.doe@vizzuality.com' });

        nock('https://www.googleapis.com')
            .get('/oauth2/v1/userinfo')
            .query({ access_token: 'TEST_GOOGLE_OAUTH2_ACCESS_TOKEN' })
            .reply(200, {
                id: providerId,
                email: 'john.doe@vizzuality.com',
                verified_email: true,
                name: 'John Doe',
                given_name: 'John',
                family_name: 'Doe',
                picture: 'https://images.pexels.com/photos/20787/pexels-photo.jpg?auto=compress&cs=tinysrgb&h=750&w=1260',
                hd: 'vizzuality.com'
            });

        const response: request.Response = await requester
            .get(`/auth/google/token?access_token=TEST_GOOGLE_OAUTH2_ACCESS_TOKEN`);

        response.status.should.equal(200);
        response.header['content-type'].should.equalIgnoreCase('application/json; charset=utf-8');
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

    it('Visiting /auth/google/token with a valid Google OAuth token should generate a new token - account with no email address', async () => {
        const providerId: string = '113994825016233013735';
        const user: OktaUser = getMockOktaUser({
            email: 'john.doe@vizzuality.com',
            displayName: 'John Doe',
            provider: OktaOAuthProvider.GOOGLE,
            providerId,
        });

        mockOktaListUsers({
            limit: 1,
            search: `(profile.provider eq "${OktaOAuthProvider.GOOGLE}") and (profile.providerId eq "${providerId}")`
        }, []);

        mockOktaCreateUser(user, {
            email: 'john.doe@vizzuality.com',
            name: 'John Doe',
            photo: null,
            role: 'USER',
            apps: [],
            provider: OktaOAuthProvider.GOOGLE,
        });

        mockOktaSendActivationEmail(user);

        nock('https://www.googleapis.com')
            .get('/oauth2/v1/userinfo')
            .query({ access_token: 'TEST_GOOGLE_OAUTH2_ACCESS_TOKEN' })
            .reply(200, {
                id: providerId,
                email: 'john.doe@vizzuality.com',
                verified_email: true,
                name: 'John Doe',
                given_name: 'John',
                family_name: 'Doe',
                picture: 'https://images.pexels.com/photos/20787/pexels-photo.jpg?auto=compress&cs=tinysrgb&h=750&w=1260',
                hd: 'vizzuality.com'
            });

        const response: request.Response = await requester
            .get(`/auth/google/token?access_token=TEST_GOOGLE_OAUTH2_ACCESS_TOKEN`);

        response.status.should.equal(200);
        response.header['content-type'].should.equalIgnoreCase('application/json; charset=utf-8');
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
