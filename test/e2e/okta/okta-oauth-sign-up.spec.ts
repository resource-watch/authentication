import nock from 'nock';
import chai from 'chai';
import sinon, {SinonSandbox} from 'sinon';
import type request from 'superagent';

import {OktaOAuthProvider, OktaUser} from 'services/okta.interfaces';
import {stubConfigValue} from '../utils/helpers';
import {closeTestAgent, getTestAgent} from '../utils/test-server';
import {getMockOktaUser, mockOktaCreateUser, mockOktaFailedSignUp, mockOktaSendActivationEmail} from './okta.mocks';

chai.should();

let requester: ChaiHttp.Agent;
let sandbox: SinonSandbox;

nock.disableNetConnect();
nock.enableNetConnect(process.env.HOST_IP);

describe('[OKTA] OAuth endpoints tests - Sign up', () => {

    before(async () => {
        if (process.env.NODE_ENV !== 'test') {
            throw Error(`Running the test suite with NODE_ENV ${process.env.NODE_ENV} may result in permanent data loss. Please use NODE_ENV=test.`);
        }

        sandbox = sinon.createSandbox();
        stubConfigValue(sandbox, { 'settings.defaultApp': 'gfw' });

        requester = await getTestAgent();
    });

    it('Sign up HTML page includes name and email (email as required) form input fields', async () => {
        const response: request.Response = await requester.get(`/auth/sign-up`);
        response.status.should.equal(200);
        response.text.should.include('<input type="text" name="name" placeholder="Name" />');
        response.text.should.include('<input type="email" name="email" placeholder="Email" value="" required />');
    });

    it('Registering a user without the actual data returns a 200 error (TODO: this should return a 422)', async () => {
        mockOktaFailedSignUp('login: The field cannot be left blank');

        const response: request.Response = await requester
            .post(`/auth/sign-up`)
            .type('form');

        response.status.should.equal(200);
        response.text.should.include('Email is required');
    });

    it('Registering a user with correct data (just email) and no app returns a 200', async () => {
        const user: OktaUser = getMockOktaUser();
        mockOktaCreateUser(user, {
            email: user.profile.email,
            provider: OktaOAuthProvider.LOCAL,
            apps: [],
        });
        mockOktaSendActivationEmail(user);

        const response: request.Response = await requester
            .post(`/auth/sign-up`)
            .type('form')
            .send({ email: user.profile.email });

        response.status.should.equal(200);
        response.text.should.include('Registration successful');
        response.text.should.include('We\'ve sent you an email. Click the link in it to confirm your account.');
    });

    it('Registering a user with correct data (email + name) and no app returns a 200', async () => {
        const user: OktaUser = getMockOktaUser();
        mockOktaCreateUser(user, {
            email: user.profile.email,
            name: 'Example name',
            provider: OktaOAuthProvider.LOCAL,
            apps: [],
        });
        mockOktaSendActivationEmail(user);

        const response: request.Response = await requester
            .post(`/auth/sign-up`)
            .type('form')
            .send({
                email: user.profile.email,
                name: 'Example name',
            });

        response.status.should.equal(200);
        response.text.should.include('Registration successful');
        response.text.should.include('We\'ve sent you an email. Click the link in it to confirm your account.');
    });

    it('Registering a user with an existing email address (temp user) returns a 200 error (TODO: this should return a 422)', async () => {
        mockOktaFailedSignUp('login: An object with this field already exists in the current organization');

        const response: request.Response = await requester
            .post(`/auth/sign-up`)
            .type('form')
            .send({ email: 'someemail@gmail.com' });

        response.status.should.equal(200);
        response.text.should.include('Email exists');
    });

    // User registration - with app
    it('Registering a user with correct data and app returns a 200', async () => {
        const user: OktaUser = getMockOktaUser({ apps: ['rw'] });
        mockOktaCreateUser(user, {
            email: user.profile.email,
            apps: ['rw'],
            provider: OktaOAuthProvider.LOCAL,
        });
        mockOktaSendActivationEmail(user);

        const response: request.Response = await requester
            .post(`/auth/sign-up`)
            .type('form')
            .send({
                email: user.profile.email,
                apps: ['rw']
            });

        response.status.should.equal(200);
        response.text.should.include('Registration successful');
        response.text.should.include('We\'ve sent you an email. Click the link in it to confirm your account.');
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
