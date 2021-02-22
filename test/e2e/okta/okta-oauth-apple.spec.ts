import chai from 'chai';
import nock from 'nock';
import crypto, { KeyPairSyncResult } from 'crypto';
import JWT from 'jsonwebtoken';
import jwt from 'jsonwebtoken';
import { pem2jwk, RSA_JWK } from 'pem-jwk';
import { closeTestAgent, getTestAgent } from '../utils/test-server';
import type request from 'superagent';
import sinon, { SinonSandbox } from 'sinon';
import { stubConfigValue } from '../utils/helpers';
import config from 'config';
import {JWTPayload, OktaOAuthProvider, OktaUser} from 'services/okta.interfaces';
import {
    getMockOktaUser,
    mockOktaCreateUser,
    mockOktaListUsers,
    mockOktaSendActivationEmail,
    mockOktaUpdateUser
} from './okta.mocks';
import axios, { AxiosResponse } from 'axios';

chai.should();

let requester: ChaiHttp.Agent;
let sandbox: SinonSandbox;
let b64string:string;
let appleKeys: AxiosResponse;
let keys: KeyPairSyncResult<string, string>;
let jwkKey: RSA_JWK;

nock.disableNetConnect();
nock.enableNetConnect(process.env.HOST_IP);

const mockAppleKeys: (id: string, times: number) => Promise<string> = async (id, times) => {
    nock('https://appleid.apple.com')
        .persist()
        .get('/auth/keys')
        .reply(200, {
            keys: appleKeys.data.keys.map((elem: Record<string, any>) => ({ ...elem, n: jwkKey.n, e: jwkKey.e }))
        });

    return jwt.sign({
        iss: 'https://appleid.apple.com',
        aud: 'org.resourcewatch.api.dev.auth',
        exp: Math.floor(Date.now() / 1000) + 100,
        iat: Math.floor(Date.now() / 1000) - 100,
        sub: id,
        at_hash: 'f0M-78UN58lEDlwW9ZnXdQ',
        email: 'dj8e99g34n@privaterelay.appleid.com',
        email_verified: 'true',
        is_private_email: 'true',
        auth_time: Math.floor(Date.now() / 1000),
        nonce_supported: true
    }, keys.privateKey, { algorithm: 'RS256' });
};

describe('[OKTA] Apple auth endpoint tests', () => {

    // tslint:disable-next-line:typedef
    before(async function () {
        if (process.env.NODE_ENV !== 'test') {
            throw Error(`Running the test suite with NODE_ENV ${process.env.NODE_ENV} may result in permanent data loss. Please use NODE_ENV=test.`);
        }

        // CT and OKTA apple tests dont seem to like running in the same test execution.
        // Because CT tests are going away soon, here be hackzzzzzz
        if (
            config.get('settings.thirdParty.gfw.apple.teamId') &&
            config.get('settings.thirdParty.gfw.apple.keyId') &&
            config.get('settings.thirdParty.gfw.apple.clientId') &&
            config.get('settings.thirdParty.gfw.apple.privateKeyString')
        ) {
            this.skip();
        }

        nock.cleanAll();
        nock.enableNetConnect();
        appleKeys = await axios.get('https://appleid.apple.com/auth/keys');
        nock.cleanAll();
        nock.disableNetConnect();
        nock.enableNetConnect(process.env.HOST_IP);

        keys = crypto.generateKeyPairSync('rsa', {
            modulusLength: 4096,
            publicKeyEncoding: {
                type: 'spki',
                format: 'pem'
            },
            privateKeyEncoding: {
                type: 'pkcs8',
                format: 'pem'
            }
        });

        jwkKey = pem2jwk(keys.publicKey);
    });

    beforeEach(async () => {
        b64string = 'test';

        sandbox = sinon.createSandbox();
        stubConfigValue(sandbox, {
            'settings.defaultApp': 'gfw',
            'authProvider': 'OKTA',
            'okta.gfw.apple.idp': 'GFW_APPLE_IDP',
            'okta.rw.apple.idp': 'RW_APPLE_IDP',
            'okta.prep.apple.idp': 'PREP_APPLE_IDP',
            'settings.thirdParty.gfw.apple.privateKeyString': Buffer.from(b64string, 'base64').toString()
        });

        requester = await getTestAgent(true);
    });

    it('Visiting /auth/apple while not being logged in should redirect to the login page', async () => {
        const response: request.Response = await requester.get(`/auth/apple`).redirects(0);
        response.should.redirect;
        response.header.location.should.contain(config.get('okta.url'));
        response.header.location.should.match(/oauth2\/default\/v1\/authorize/);
        response.header.location.should.contain(`client_id=${config.get('okta.clientId')}`);
        response.header.location.should.contain(`response_type=code`);
        response.header.location.should.contain(`response_mode=query`);
        response.header.location.should.match(/scope=openid(.*)profile(.*)email/);
        response.header.location.should.match(/redirect_uri=(.*)auth(.*)authorization-code(.*)callback/);
        response.header.location.should.contain(`idp=${config.get('okta.gfw.apple.idp')}`);
        response.header.location.should.match(/state=\w/);

        const encodedRedirectUri: string = encodeURIComponent(`${config.get('server.publicUrl')}/auth/authorization-code/callback`);
        response.header.location.should.contain(`redirect_uri=${encodedRedirectUri}`);
    });

    it('Visiting /auth/apple with query parameter indicating RW should redirect to Okta\'s OAuth URL with the correct IDP for RW', async () => {
        const response: request.Response = await requester.get(`/auth/apple?origin=rw`).redirects(0);
        response.should.redirect;
        response.header.location.should.contain(config.get('okta.url'));
        response.header.location.should.match(/oauth2\/default\/v1\/authorize/);
        response.header.location.should.contain(`client_id=${config.get('okta.clientId')}`);
        response.header.location.should.contain(`response_type=code`);
        response.header.location.should.contain(`response_mode=query`);
        response.header.location.should.match(/scope=openid(.*)profile(.*)email/);
        response.header.location.should.contain(`idp=${config.get('okta.rw.apple.idp')}`);
        response.header.location.should.match(/state=\w/);

        const encodedRedirectUri: string = encodeURIComponent(`${config.get('server.publicUrl')}/auth/authorization-code/callback`);
        response.header.location.should.contain(`redirect_uri=${encodedRedirectUri}`);
    });

    it('Visiting /auth/apple with query parameter indicating PREP should redirect to Okta\'s OAuth URL with the correct IDP for PREP', async () => {
        const response: request.Response = await requester.get(`/auth/apple?origin=prep`).redirects(0);
        response.should.redirect;
        response.header.location.should.contain(config.get('okta.url'));
        response.header.location.should.match(/oauth2\/default\/v1\/authorize/);
        response.header.location.should.contain(`client_id=${config.get('okta.clientId')}`);
        response.header.location.should.contain(`response_type=code`);
        response.header.location.should.contain(`response_mode=query`);
        response.header.location.should.match(/scope=openid(.*)profile(.*)email/);
        response.header.location.should.contain(`idp=${config.get('okta.prep.apple.idp')}`);
        response.header.location.should.match(/state=\w/);

        const encodedRedirectUri: string = encodeURIComponent(`${config.get('server.publicUrl')}/auth/authorization-code/callback`);
        response.header.location.should.contain(`redirect_uri=${encodedRedirectUri}`);
    });

    it('Visiting /auth/apple/token with a valid Apple OAuth token for an NON-existing user should create the user and generate a new token', async () => {
        const providerId: string = '000958.a4550a8804284886a5b5116a1c0351af.1425';
        const user: OktaUser = getMockOktaUser({
            email: 'dj8e99g34n@privaterelay.appleid.com',
            provider: OktaOAuthProvider.APPLE,
            providerId,
        });

        mockOktaListUsers({
            limit: 1,
            search: `(profile.provider eq "${OktaOAuthProvider.APPLE}") and (profile.providerId eq "${providerId}")`
        }, []);

        mockOktaCreateUser(user, {
            email: 'dj8e99g34n@privaterelay.appleid.com',
            name: '',
            photo: null,
            role: 'USER',
            apps: [],
        });

        mockOktaSendActivationEmail(user);

        const token: string = await mockAppleKeys(providerId, 3);
        const response: request.Response = await requester
            .get(`/auth/apple/token`)
            .query({ access_token: token });
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

    it('Visiting /auth/apple/token with a valid Apple OAuth token for an existing user should update the user and generate a new token for the existing user', async () => {
        const providerId: string = '000958.a4550a8804284886a5b5116a1c0351af.1425';
        const user: OktaUser = getMockOktaUser({
            email: 'dj8e99g34n@privaterelay.appleid.com',
            provider: OktaOAuthProvider.APPLE,
            providerId,
        });

        mockOktaListUsers({
            limit: 1,
            search: `(profile.provider eq "${OktaOAuthProvider.APPLE}") and (profile.providerId eq "${providerId}")`
        }, [user]);

        mockOktaUpdateUser(user, { email: 'dj8e99g34n@privaterelay.appleid.com' });

        const token: string = await mockAppleKeys(providerId, 1);
        const response: request.Response = await requester
            .get(`/auth/apple/token`)
            .query({ access_token: token });
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
            // Apple key validation seems to require a varying number of calls, so we specify the max, and trim down here.
            const pendingMocks: string[] = nock.pendingMocks();
            if (pendingMocks.length > 1 && pendingMocks[0] !== 'GET https://appleid.apple.com:443/auth/keys') {
                throw new Error(`Not all nock interceptors were used: ${nock.pendingMocks()}`);
            }
            nock.cleanAll();
        }

        sandbox.restore();
        await closeTestAgent();
    });
});
