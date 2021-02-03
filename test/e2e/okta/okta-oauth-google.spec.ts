import nock from 'nock';
import chai from 'chai';
import config from 'config';
import JWT from 'jsonwebtoken';
import chaiString from 'chai-string';
import UserModel, { UserDocument } from 'models/user.model';
import UserService from 'services/user.service';

import { closeTestAgent, getTestAgent } from '../utils/test-server';
import type request from 'superagent';
import sinon, {SinonSandbox} from 'sinon';
import {stubConfigValue} from '../utils/helpers';

const should: Chai.Should = chai.should();
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
        stubConfigValue(sandbox, { 'authProvider': 'OKTA' });

        requester = await getTestAgent(true);

        await UserModel.deleteMany({}).exec();
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
        response.header.location.should.match(/redirect_uri=(.*)auth(.*)authorization-code(.*)callback/);
        response.header.location.should.contain(`idp=${config.get('okta.gfw.google.idp')}`);
        response.header.location.should.match(/state=\w/);
    });

    it('Visiting /auth/google/token with a valid Google OAuth token should generate a new token', async () => {
        await new UserModel({
            name: 'John Doe',
            email: 'john.doe@vizzuality.com',
            role: 'USER',
            provider: 'google',
            providerId: '113994825016233013735',
            photo: 'https://images.pexels.com/photos/20787/pexels-photo.jpg?auto=compress&cs=tinysrgb&h=750&w=1260'
        }).save();

        const existingUser: UserDocument = await UserModel.findOne({ email: 'john.doe@vizzuality.com' })
            .exec();
        should.exist(existingUser);
        existingUser.should.have.property('email')
            .and
            .equal('john.doe@vizzuality.com');
        existingUser.should.have.property('name')
            .and
            .equal('John Doe');
        existingUser.should.have.property('photo')
            .and
            .equal('https://images.pexels.com/photos/20787/pexels-photo.jpg?auto=compress&cs=tinysrgb&h=750&w=1260');
        existingUser.should.have.property('role')
            .and
            .equal('USER');
        existingUser.should.have.property('provider')
            .and
            .equal('google');
        existingUser.should.have.property('providerId')
            .and
            .equal('113994825016233013735');
        existingUser.should.have.property('userToken')
            .and
            .equal(undefined);

        nock('https://www.googleapis.com')
            .get('/oauth2/v1/userinfo')
            .query({
                access_token: 'TEST_GOOGLE_OAUTH2_ACCESS_TOKEN'
            })
            .reply(200, {
                id: '113994825016233013735',
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
        response.body.should.have.property('token')
            .and
            .be
            .a('string');

        JWT.verify(response.body.token, process.env.JWT_SECRET);

        // @ts-ignore
        const decodedTokenData: Record<string, any> = JWT.verify(response.body.token, process.env.JWT_SECRET);
        const isTokenRevoked: boolean = await UserService.checkRevokedToken(null, decodedTokenData);
        isTokenRevoked.should.equal(false);

        const userWithToken: UserDocument = await UserModel.findOne({ email: 'john.doe@vizzuality.com' })
            .exec();
        should.exist(userWithToken);
        userWithToken.should.have.property('email')
            .and
            .equal('john.doe@vizzuality.com')
            .and
            .equal(decodedTokenData.email);
        userWithToken.should.have.property('name')
            .and
            .equal('John Doe')
            .and
            .equal(decodedTokenData.name);
        userWithToken.should.have.property('photo')
            .and
            .equal('https://images.pexels.com/photos/20787/pexels-photo.jpg?auto=compress&cs=tinysrgb&h=750&w=1260')
            .and
            .equal(decodedTokenData.photo);
        userWithToken.should.have.property('role')
            .and
            .equal('USER')
            .and
            .equal(decodedTokenData.role);
        userWithToken.should.have.property('provider')
            .and
            .equal('google')
            .and
            .equal(decodedTokenData.provider);
        userWithToken.should.have.property('providerId')
            .and
            .equal('113994825016233013735');
        userWithToken.should.have.property('userToken')
            .and
            .equal(response.body.token);
    });

    it('Visiting /auth/google/token with a valid Google OAuth token should generate a new token - account with no email address', async () => {
        const savedUser: UserDocument = await new UserModel({
            name: 'John Doe',
            role: 'USER',
            provider: 'google',
            providerId: '113994825016233013735',
            photo: 'https://images.pexels.com/photos/20787/pexels-photo.jpg?auto=compress&cs=tinysrgb&h=750&w=1260'
        }).save();

        const existingUser: UserDocument = await UserModel.findOne({ _id: savedUser.id })
            .exec();
        should.exist(existingUser);
        existingUser.should.have.property('name')
            .and
            .equal('John Doe');
        existingUser.should.have.property('photo')
            .and
            .equal('https://images.pexels.com/photos/20787/pexels-photo.jpg?auto=compress&cs=tinysrgb&h=750&w=1260');
        existingUser.should.have.property('role')
            .and
            .equal('USER');
        existingUser.should.have.property('provider')
            .and
            .equal('google');
        existingUser.should.have.property('providerId')
            .and
            .equal('113994825016233013735');
        existingUser.should.have.property('userToken')
            .and
            .equal(undefined);

        nock('https://www.googleapis.com')
            .get('/oauth2/v1/userinfo')
            .query({
                access_token: 'TEST_GOOGLE_OAUTH2_ACCESS_TOKEN'
            })
            .reply(200, {
                id: '113994825016233013735',
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
        response.body.should.have.property('token')
            .and
            .be
            .a('string');

        JWT.verify(response.body.token, process.env.JWT_SECRET);

        // @ts-ignore
        const decodedTokenData: Record<string, any> = JWT.verify(response.body.token, process.env.JWT_SECRET);
        const isTokenRevoked: boolean = await UserService.checkRevokedToken(null, decodedTokenData);
        isTokenRevoked.should.equal(false);

        const userWithToken: UserDocument = await UserModel.findOne({ _id: savedUser.id })
            .exec();
        should.exist(userWithToken);
        userWithToken.should.have.property('name')
            .and
            .equal('John Doe')
            .and
            .equal(decodedTokenData.name);
        userWithToken.should.have.property('photo')
            .and
            .equal('https://images.pexels.com/photos/20787/pexels-photo.jpg?auto=compress&cs=tinysrgb&h=750&w=1260')
            .and
            .equal(decodedTokenData.photo);
        userWithToken.should.have.property('role')
            .and
            .equal('USER')
            .and
            .equal(decodedTokenData.role);
        userWithToken.should.have.property('provider')
            .and
            .equal('google')
            .and
            .equal(decodedTokenData.provider);
        userWithToken.should.have.property('providerId')
            .and
            .equal('113994825016233013735');
        userWithToken.should.have.property('userToken')
            .and
            .equal(response.body.token);
    });

    afterEach(async () => {
        if (!nock.isDone()) {
            throw new Error(`Not all nock interceptors were used: ${nock.pendingMocks()}`);
        }

        sandbox.restore();
        await closeTestAgent();
    });
});
