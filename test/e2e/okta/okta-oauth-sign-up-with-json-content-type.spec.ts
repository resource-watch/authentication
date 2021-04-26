import nock from 'nock';
import chai from 'chai';
import type request from 'superagent';

import {OktaOAuthProvider, OktaUser} from 'services/okta.interfaces';
import {closeTestAgent, getTestAgent} from '../utils/test-server';
import {getMockOktaUser, mockOktaCreateUser, mockOktaFailedSignUp, mockOktaSendActivationEmail} from './okta.mocks';

chai.should();

let requester: ChaiHttp.Agent;

nock.disableNetConnect();
nock.enableNetConnect(process.env.HOST_IP);

describe('[OKTA] OAuth endpoints tests - Sign up with JSON content type', () => {

    before(async () => {
        if (process.env.NODE_ENV !== 'test') {
            throw Error(`Running the test suite with NODE_ENV ${process.env.NODE_ENV} may result in permanent data loss. Please use NODE_ENV=test.`);
        }

        requester = await getTestAgent();
    });

    it('Registering a user without being logged in returns a 422 error - JSON version', async () => {
        mockOktaFailedSignUp('login: The field cannot be left blank');

        const response: request.Response = await requester
            .post(`/auth/sign-up`)
            .set('Content-Type', 'application/json');

        response.status.should.equal(422);
        response.should.be.json;
        response.body.should.have.property('errors').and.be.an('array');
        response.body.errors[0].status.should.equal(422);
        response.body.errors[0].detail.should.equal('Email is required');
    });

    it('Registering a user with correct data and no app returns a 200', async () => {
        const user: OktaUser = getMockOktaUser({ apps: [] });
        mockOktaCreateUser(user, {
            email: user.profile.email,
            provider: OktaOAuthProvider.LOCAL,
            role: 'USER',
            apps: [],
        });
        mockOktaSendActivationEmail(user);

        const response: request.Response = await requester
            .post(`/auth/sign-up`)
            .set('Content-Type', 'application/json')
            .send({ email: user.profile.email });

        response.status.should.equal(200);
        response.should.be.json;
        response.body.should.have.property('data').and.not.be.empty;
        response.body.data.should.have.property('email').and.equal(user.profile.email);
        response.body.data.should.have.property('role').and.equal(user.profile.role);
        response.body.data.should.have.property('extraUserData').and.be.an('object');
        response.body.data.extraUserData.should.have.property('apps').and.be.an('array').and.be.empty;
    });

    it('Registering a user with an existing email address (temp user) returns a 422 error', async () => {
        mockOktaFailedSignUp('login: An object with this field already exists in the current organization');

        const response: request.Response = await requester
            .post(`/auth/sign-up`)
            .set('Content-Type', 'application/json')
            .send({ email: 'someemail@gmail.com' });

        response.status.should.equal(422);
        response.should.be.json;
        response.body.should.have.property('errors').and.be.an('array');
        response.body.errors[0].status.should.equal(422);
        response.body.errors[0].detail.should.equal('Email exists');
    });

    it('Registering a user with correct data and app returns a 200', async () => {
        const user: OktaUser = getMockOktaUser({ apps: ['gfw'] });
        mockOktaCreateUser(user, {
            email: user.profile.email,
            provider: OktaOAuthProvider.LOCAL,
            role: 'USER',
            apps: ['gfw'],
        });
        mockOktaSendActivationEmail(user);

        const response: request.Response = await requester
            .post(`/auth/sign-up`)
            .set('Content-Type', 'application/json')
            .send({
                email: user.profile.email,
                apps: user.profile.apps
            });

        response.status.should.equal(200);
        response.should.be.json;
        response.body.should.have.property('data').and.not.be.empty;
        response.body.data.should.have.property('email').and.equal(user.profile.email);
        response.body.data.should.have.property('role').and.equal(user.profile.role);
        response.body.data.should.have.property('extraUserData').and.be.an('object');
        response.body.data.extraUserData.should.have.property('apps').and.eql(user.profile.apps);
    });

    it('Registering a user with a custom role should return a 200 and ignore the role', async () => {
        const user: OktaUser = getMockOktaUser({ apps: ['gfw'] });
        mockOktaCreateUser(user, {
            email: user.profile.email,
            name: 'Example name',
            provider: OktaOAuthProvider.LOCAL,
            role: 'USER',
            apps: ['gfw'],
        });
        mockOktaSendActivationEmail(user);

        const response: request.Response = await requester
            .post(`/auth/sign-up`)
            .set('Content-Type', 'application/json')
            .send({
                email: user.profile.email,
                name: 'Example name',
                role: 'ADMIN',
                apps: user.profile.apps,
            });

        response.status.should.equal(200);
        response.should.be.json;
        response.body.should.have.property('data').and.not.be.empty;
        response.body.data.should.have.property('email').and.equal(user.profile.email);
        response.body.data.should.have.property('role').and.equal('USER');
        response.body.data.should.have.property('extraUserData').and.be.an('object');
        response.body.data.extraUserData.should.have.property('apps').and.eql(user.profile.apps);
    });

    after(async () => {
        await closeTestAgent();
    });

    afterEach(async () => {
        if (!nock.isDone()) {
            throw new Error(`Not all nock interceptors were used: ${nock.pendingMocks()}`);
        }
    });
});
