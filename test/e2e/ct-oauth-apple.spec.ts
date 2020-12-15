import chai from 'chai';
import nock from 'nock';
import crypto, { KeyPairSyncResult } from 'crypto';
import JWT from 'jsonwebtoken';
import jwt from 'jsonwebtoken';
import { pem2jwk, RSA_JWK } from 'pem-jwk';
import UserModel, { IUserDocument } from 'models/user.model';
import { closeTestAgent, getTestAgent } from './utils/test-server';
import type request from 'superagent';
import sinon, { SinonSandbox } from 'sinon';
import { stubConfigValue } from "./utils/helpers";
import config from "config";

const should: Chai.Should = chai.should();

let requester: ChaiHttp.Agent;
let sandbox: SinonSandbox;
let b64string:string;

const { expect } = chai;

nock.disableNetConnect();
nock.enableNetConnect(process.env.HOST_IP);

describe('Apple auth endpoint tests', () => {

    // tslint:disable-next-line:typedef
    before(async function () {
        if (process.env.NODE_ENV !== 'test') {
            throw Error(`Running the test suite with NODE_ENV ${process.env.NODE_ENV} may result in permanent data loss. Please use NODE_ENV=test.`);
        }

        if (
            !config.get('settings.thirdParty.gfw.apple.teamId') ||
            !config.get('settings.thirdParty.gfw.apple.keyId') ||
            !config.get('settings.thirdParty.gfw.apple.clientId') ||
            !config.get('settings.thirdParty.gfw.apple.privateKeyString')
        ) {
            this.skip();
        }

        b64string = config.get('settings.thirdParty.gfw.apple.privateKeyString');
        sandbox = sinon.createSandbox();
        stubConfigValue(sandbox, { 'settings.defaultApp': 'gfw', 'settings.thirdParty.gfw.apple.privateKeyString': Buffer.from(b64string, 'base64').toString() });

        requester = await getTestAgent(true);

        return UserModel.deleteMany({}).exec();
    });

    beforeEach(async () => {
        requester = await getTestAgent(true);
    });

    it('Visiting /auth/apple while not being logged in should redirect to the login page', async () => {
        const response: request.Response = await requester.get(`/auth/apple`).redirects(0);
        response.should.redirect;
        response.should.redirectTo(/^https:\/\/appleid\.apple\.com\/auth\/authorize/);
    });

    it('Visiting /auth/apple/callback with valid data should redirect to the login successful page', async () => {
        const missingUser: IUserDocument = await UserModel.findOne({ email: 'john.doe@vizzuality.com' }).exec();
        should.not.exist(missingUser);

        nock('https://appleid.apple.com')
            .post('/auth/token', (body) => {
                expect(body).to.have.property('grant_type').and.equal('authorization_code');
                expect(body).to.have.property('redirect_uri').and.equal(`${config.get('server.publicUrl')}/auth/apple/callback`);
                expect(body).to.have.property('client_id').and.equal(config.get('settings.thirdParty.gfw.apple.clientId'));
                expect(body).to.have.property('code').and.be.a('string');
                expect(body).to.have.property('client_secret').and.be.a('string');
                return true;
            })
            .reply(200, {
                access_token: 'a9bac2c1cef3e4535a24817ea81ac48e7.0.mzvy.Gq8EWTPv_3zHceOGzmu6eg',
                token_type: 'Bearer',
                expires_in: 3600,
                refresh_token: 'r1350f8480d5c45d3a74f3aaa7c0d979e.0.mzvy.J9iC84ON-bQEcEDspOa17w',
                id_token: 'eyJraWQiOiJlWGF1bm1MIiwiYWxnIjoiUlMyNTYifQ.eyJpc3MiOiJodHRwczovL2FwcGxlaWQuYXBwbGUuY29tIiwiYXVkIjoib3JnLnJlc291cmNld2F0Y2guYXBpLmRldi5hdXRoIiwiZXhwIjoxNjAzOTYwOTY3LCJpYXQiOjE2MDM4NzQ1NjcsInN1YiI6IjAwMDk1OC5hNDU1MGE4ODA0Mjg0ODg2YTViNTExNmExYzAzNTFhZi4xNDI1IiwiYXRfaGFzaCI6InhWNkJBN2xZVU8takt6QTdHdGhrRXciLCJlbWFpbCI6ImRqOGU5OWczNG5AcHJpdmF0ZXJlbGF5LmFwcGxlaWQuY29tIiwiZW1haWxfdmVyaWZpZWQiOiJ0cnVlIiwiaXNfcHJpdmF0ZV9lbWFpbCI6InRydWUiLCJhdXRoX3RpbWUiOjE2MDM4NzQ1MDUsIm5vbmNlX3N1cHBvcnRlZCI6dHJ1ZX0.l_AYOAArJf1suJ3218CndgD4QVwoPklUEcHBN6ZSAXOlKRCDWNQgx7bCXPMZzZ6W2E4SYV2Hx53z0yJXeW_i-CeDyGpInWTihKywq22lN7DIsTfzyLQsgA2ShPf1JGiJ7953fm-QkBvkISd0SmgUDHWRtVKtFEAtaoEdOlnTR7-RFUV_APbpsz_vWzzJkwy-smyfKeh2CImfWoZHnzLXEUCcCpbfynx6k8MwUR2iVoUP6UPbwNoO7Pc6wxrwQYb8GSyGGW953A1BJhfWSwPFP8aCukyuHA5YEG329QTUphd9tpb92M27hnqK_GPJqBQhy-Ub7rehOiPNQZ3eoNTwpg'
            });

        const response: request.Response = await requester
            .post(`/auth/apple/callback`)
            .send({
                state: 'a54cad0426',
                code: 'c1a641aaf5719487ab395441ac14efc2a.0.mzvy.OtWbwTotcBdWy3xmI_M7e1'
            })
            .redirects(0);

        response.should.redirect;
        response.should.redirectTo(new RegExp(`/auth/success$`));

        const confirmedUser: IUserDocument = await UserModel.findOne({ email: 'dj8e99g34n@privaterelay.appleid.com' }).exec();
        should.exist(confirmedUser);
        confirmedUser.should.have.property('email').and.equal('dj8e99g34n@privaterelay.appleid.com');
        confirmedUser.should.have.property('role').and.equal('USER');
        confirmedUser.should.have.property('provider').and.equal('apple');
        confirmedUser.should.have.property('providerId').and.equal('000958.a4550a8804284886a5b5116a1c0351af.1425');
    });

    it('Visiting /auth/apple/callback while being logged in with a callbackUrl param should redirect to the callback URL page', async () => {
        const missingUser: IUserDocument = await UserModel.findOne({ email: 'john.doe@vizzuality.com' }).exec();
        should.not.exist(missingUser);

        nock('https://appleid.apple.com')
            .post('/auth/token', (body) => {
                expect(body).to.have.property('grant_type').and.equal('authorization_code');
                expect(body).to.have.property('redirect_uri').and.equal(`${config.get('server.publicUrl')}/auth/apple/callback`);
                expect(body).to.have.property('client_id').and.equal(config.get('settings.thirdParty.gfw.apple.clientId'));
                expect(body).to.have.property('code').and.be.a('string');
                expect(body).to.have.property('client_secret').and.be.a('string');
                return true;
            })
            .reply(200, {
                access_token: 'a9bac2c1cef3e4535a24817ea81ac48e7.0.mzvy.Gq8EWTPv_3zHceOGzmu6eg',
                token_type: 'Bearer',
                expires_in: 3600,
                refresh_token: 'r1350f8480d5c45d3a74f3aaa7c0d979e.0.mzvy.J9iC84ON-bQEcEDspOa17w',
                id_token: 'eyJraWQiOiJlWGF1bm1MIiwiYWxnIjoiUlMyNTYifQ.eyJpc3MiOiJodHRwczovL2FwcGxlaWQuYXBwbGUuY29tIiwiYXVkIjoib3JnLnJlc291cmNld2F0Y2guYXBpLmRldi5hdXRoIiwiZXhwIjoxNjAzOTYwOTY3LCJpYXQiOjE2MDM4NzQ1NjcsInN1YiI6IjAwMDk1OC5hNDU1MGE4ODA0Mjg0ODg2YTViNTExNmExYzAzNTFhZi4xNDI1IiwiYXRfaGFzaCI6InhWNkJBN2xZVU8takt6QTdHdGhrRXciLCJlbWFpbCI6ImRqOGU5OWczNG5AcHJpdmF0ZXJlbGF5LmFwcGxlaWQuY29tIiwiZW1haWxfdmVyaWZpZWQiOiJ0cnVlIiwiaXNfcHJpdmF0ZV9lbWFpbCI6InRydWUiLCJhdXRoX3RpbWUiOjE2MDM4NzQ1MDUsIm5vbmNlX3N1cHBvcnRlZCI6dHJ1ZX0.l_AYOAArJf1suJ3218CndgD4QVwoPklUEcHBN6ZSAXOlKRCDWNQgx7bCXPMZzZ6W2E4SYV2Hx53z0yJXeW_i-CeDyGpInWTihKywq22lN7DIsTfzyLQsgA2ShPf1JGiJ7953fm-QkBvkISd0SmgUDHWRtVKtFEAtaoEdOlnTR7-RFUV_APbpsz_vWzzJkwy-smyfKeh2CImfWoZHnzLXEUCcCpbfynx6k8MwUR2iVoUP6UPbwNoO7Pc6wxrwQYb8GSyGGW953A1BJhfWSwPFP8aCukyuHA5YEG329QTUphd9tpb92M27hnqK_GPJqBQhy-Ub7rehOiPNQZ3eoNTwpg'
            });

        nock('https://www.wikipedia.org')
            .get('/')
            .reply(200, 'ok');

        await requester
            .get(`/auth?callbackUrl=https://www.wikipedia.org`);

        const responseOne: request.Response = await requester
            .post(`/auth/apple/callback`)
            .send({
                state: 'a54cad0426',
                code: 'c1a641aaf5719487ab395441ac14efc2a.0.mzvy.OtWbwTotcBdWy3xmI_M7e1'
            })
            .redirects(0);

        responseOne.should.redirect;
        responseOne.should.redirectTo(new RegExp(`/auth/success$`));

        const responseTwo: request.Response = await requester
            .get('/auth/success');

        responseTwo.should.redirect;
        responseTwo.should.redirectTo('https://www.wikipedia.org/');

        const confirmedUser: IUserDocument | null = await UserModel.findOne({ email: 'dj8e99g34n@privaterelay.appleid.com' }).exec();
        should.exist(confirmedUser);
        confirmedUser.should.have.property('email').and.equal('dj8e99g34n@privaterelay.appleid.com');
        confirmedUser.should.have.property('role').and.equal('USER');
        confirmedUser.should.have.property('provider').and.equal('apple');
        confirmedUser.should.have.property('providerId').and.equal('000958.a4550a8804284886a5b5116a1c0351af.1425');
    });

    it('Visiting /auth/apple/callback while being logged in with an updated callbackUrl param should redirect to the new callback URL page', async () => {
        const missingUser: IUserDocument = await UserModel.findOne({ email: 'john.doe@vizzuality.com' }).exec();
        should.not.exist(missingUser);

        nock('https://appleid.apple.com')
            .post('/auth/token', (body) => {
                expect(body).to.have.property('grant_type').and.equal('authorization_code');
                expect(body).to.have.property('redirect_uri').and.equal(`${config.get('server.publicUrl')}/auth/apple/callback`);
                expect(body).to.have.property('client_id').and.equal(config.get('settings.thirdParty.gfw.apple.clientId'));
                expect(body).to.have.property('code').and.be.a('string');
                expect(body).to.have.property('client_secret').and.be.a('string');
                return true;
            })
            .reply(200, {
                access_token: 'a9bac2c1cef3e4535a24817ea81ac48e7.0.mzvy.Gq8EWTPv_3zHceOGzmu6eg',
                token_type: 'Bearer',
                expires_in: 3600,
                refresh_token: 'r1350f8480d5c45d3a74f3aaa7c0d979e.0.mzvy.J9iC84ON-bQEcEDspOa17w',
                id_token: 'eyJraWQiOiJlWGF1bm1MIiwiYWxnIjoiUlMyNTYifQ.eyJpc3MiOiJodHRwczovL2FwcGxlaWQuYXBwbGUuY29tIiwiYXVkIjoib3JnLnJlc291cmNld2F0Y2guYXBpLmRldi5hdXRoIiwiZXhwIjoxNjAzOTYwOTY3LCJpYXQiOjE2MDM4NzQ1NjcsInN1YiI6IjAwMDk1OC5hNDU1MGE4ODA0Mjg0ODg2YTViNTExNmExYzAzNTFhZi4xNDI1IiwiYXRfaGFzaCI6InhWNkJBN2xZVU8takt6QTdHdGhrRXciLCJlbWFpbCI6ImRqOGU5OWczNG5AcHJpdmF0ZXJlbGF5LmFwcGxlaWQuY29tIiwiZW1haWxfdmVyaWZpZWQiOiJ0cnVlIiwiaXNfcHJpdmF0ZV9lbWFpbCI6InRydWUiLCJhdXRoX3RpbWUiOjE2MDM4NzQ1MDUsIm5vbmNlX3N1cHBvcnRlZCI6dHJ1ZX0.l_AYOAArJf1suJ3218CndgD4QVwoPklUEcHBN6ZSAXOlKRCDWNQgx7bCXPMZzZ6W2E4SYV2Hx53z0yJXeW_i-CeDyGpInWTihKywq22lN7DIsTfzyLQsgA2ShPf1JGiJ7953fm-QkBvkISd0SmgUDHWRtVKtFEAtaoEdOlnTR7-RFUV_APbpsz_vWzzJkwy-smyfKeh2CImfWoZHnzLXEUCcCpbfynx6k8MwUR2iVoUP6UPbwNoO7Pc6wxrwQYb8GSyGGW953A1BJhfWSwPFP8aCukyuHA5YEG329QTUphd9tpb92M27hnqK_GPJqBQhy-Ub7rehOiPNQZ3eoNTwpg'
            });

        nock('https://www.wri.org')
            .get('/')
            .reply(200, 'ok');

        await requester
            .get(`/auth?callbackUrl=https://www.google.com`);

        await requester
            .get(`/auth?callbackUrl=https://www.wri.org`);

        const responseOne: request.Response = await requester
            .post(`/auth/apple/callback`)
            .send({
                state: 'a54cad0426',
                code: 'c1a641aaf5719487ab395441ac14efc2a.0.mzvy.OtWbwTotcBdWy3xmI_M7e1'
            })
            .redirects(0);

        responseOne.should.redirect;
        responseOne.should.redirectTo(new RegExp(`/auth/success$`));

        const responseTwo: request.Response = await requester
            .get('/auth/success');

        responseTwo.should.redirect;
        responseTwo.should.redirectTo('https://www.wri.org/');

        const confirmedUser: IUserDocument = await UserModel.findOne({ email: 'dj8e99g34n@privaterelay.appleid.com' }).exec();
        should.exist(confirmedUser);
        confirmedUser.should.have.property('email').and.equal('dj8e99g34n@privaterelay.appleid.com');
        confirmedUser.should.have.property('role').and.equal('USER');
        confirmedUser.should.have.property('provider').and.equal('apple');
        confirmedUser.should.have.property('providerId').and.equal('000958.a4550a8804284886a5b5116a1c0351af.1425');
    });

    it('Visiting /auth/apple/token with a valid Apple OAuth token should generate a new user and a new token if providerId does not match', async () => {
        const existingUser: IUserDocument = await UserModel.findOne({ providerId: '000958.a4550a8804284886a5b5116a1c0351af.1425' }).exec();
        should.not.exist(existingUser);

        const keys: KeyPairSyncResult<string, string> = crypto.generateKeyPairSync('rsa', {
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

        const jwkKey: RSA_JWK = pem2jwk(keys.publicKey);

        nock('https://appleid.apple.com')
            .get('/auth/keys')
            .times(2)
            .reply(200, {
                keys: [
                    {
                        kty: 'RSA',
                        kid: '77D88Kf',
                        use: 'sig',
                        alg: 'RS256',
                        n: jwkKey.n,
                        e: jwkKey.e
                    }
                ]
            });

        const tokenContent: Record<string, any> = {
            iss: 'https://appleid.apple.com',
            aud: 'org.resourcewatch.api.dev.auth',
            exp: Math.floor(Date.now() / 1000) + 100,
            iat: 1603962083,
            sub: '000958.a4550a8804284886a5b5116a1c0351af.1425',
            at_hash: 'f0M-78UN58lEDlwW9ZnXdQ',
            email: 'dj8e99g34n@privaterelay.appleid.com',
            email_verified: 'true',
            is_private_email: 'true',
            auth_time: 1603962070,
            nonce_supported: true
        };
        const token: string = jwt.sign(tokenContent, keys.privateKey, { algorithm: 'RS256' });

        const response: request.Response = await requester
            .get(`/auth/apple/token`)
            .query({
                access_token: token
            });

        response.status.should.equal(200);
        response.should.be.json;
        response.body.should.be.an('object');
        response.body.should.have.property('token').and.be.a('string');

        JWT.verify(response.body.token, process.env.JWT_SECRET);

        const userWithToken: IUserDocument = await UserModel.findOne({ providerId: '000958.a4550a8804284886a5b5116a1c0351af.1425' }).exec();
        should.exist(userWithToken);
        userWithToken.should.have.property('email').and.equal('dj8e99g34n@privaterelay.appleid.com');
        userWithToken.should.have.property('role').and.equal('USER');
        userWithToken.should.have.property('provider').and.equal('apple');
        userWithToken.should.have.property('providerId').and.equal('000958.a4550a8804284886a5b5116a1c0351af.1425');
        userWithToken.should.have.property('userToken').and.equal(response.body.token);
    });

    it('Visiting /auth/apple/token with a valid Apple OAuth token should generate a new token and update an existing user email if providerId matches', async () => {
        await new UserModel({
            name: 'John Doe',
            email: 'john.doe@vizzuality.com',
            role: 'USER',
            provider: 'apple',
            providerId: '000958.a4550a8804284886a5b5116a1c0351af.1425',
            photo: 'https://images.pexels.com/photos/20787/pexels-photo.jpg?auto=compress&cs=tinysrgb&h=750&w=1260'
        }).save();

        const existingUser: IUserDocument = await UserModel.findOne({ email: 'john.doe@vizzuality.com' }).exec();
        should.exist(existingUser);
        existingUser.should.have.property('email').and.equal('john.doe@vizzuality.com');
        existingUser.should.have.property('name').and.equal('John Doe');
        existingUser.should.have.property('photo').and.equal('https://images.pexels.com/photos/20787/pexels-photo.jpg?auto=compress&cs=tinysrgb&h=750&w=1260');
        existingUser.should.have.property('role').and.equal('USER');
        existingUser.should.have.property('provider').and.equal('apple');
        existingUser.should.have.property('providerId').and.equal('000958.a4550a8804284886a5b5116a1c0351af.1425');
        existingUser.should.have.property('userToken').and.equal(undefined);

        const keys: KeyPairSyncResult<string, string> = crypto.generateKeyPairSync('rsa', {
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

        const jwkKey: RSA_JWK = pem2jwk(keys.publicKey);

        nock('https://appleid.apple.com')
            .get('/auth/keys')
            .times(2)
            .reply(200, {
                keys: [
                    {
                        kty: 'RSA',
                        kid: '86D88Kf',
                        use: 'sig',
                        alg: 'RS256',
                        n: jwkKey.n,
                        e: jwkKey.e
                    }
                ]
            });

        const tokenContent: Record<string, any> = {
            iss: 'https://appleid.apple.com',
            aud: 'org.resourcewatch.api.dev.auth',
            exp: Math.floor(Date.now() / 1000) + 100,
            iat: 1603962083,
            sub: '000958.a4550a8804284886a5b5116a1c0351af.1425',
            at_hash: 'f0M-78UN58lEDlwW9ZnXdQ',
            email: 'dj8e99g34n@privaterelay.appleid.com',
            email_verified: 'true',
            is_private_email: 'true',
            auth_time: 1603962070,
            nonce_supported: true
        };
        const token: string = jwt.sign(tokenContent, keys.privateKey, { algorithm: 'RS256' });

        const response: request.Response = await requester
            .get(`/auth/apple/token`)
            .query({
                access_token: token
            });

        response.status.should.equal(200);
        response.should.be.json;
        response.body.should.be.an('object');
        response.body.should.have.property('token').and.be.a('string');

        JWT.verify(response.body.token, process.env.JWT_SECRET);

        const userWithToken: IUserDocument = await UserModel.findOne({ email: 'dj8e99g34n@privaterelay.appleid.com' }).exec();
        should.exist(userWithToken);
        userWithToken.should.have.property('email').and.equal('dj8e99g34n@privaterelay.appleid.com');
        userWithToken.should.have.property('role').and.equal('USER');
        userWithToken.should.have.property('provider').and.equal('apple');
        userWithToken.should.have.property('providerId').and.equal('000958.a4550a8804284886a5b5116a1c0351af.1425');
        userWithToken.should.have.property('userToken').and.equal(response.body.token);
    });

    afterEach(() => {
        if (!nock.isDone()) {
            throw new Error(`Not all nock interceptors were used: ${nock.pendingMocks()}`);
        }

        UserModel.deleteMany({}).exec();

        closeTestAgent();
    });

    after(() => {
        if (sandbox) {
            sandbox.restore();
        }
    });
});
