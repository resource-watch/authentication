import nock from 'nock';
import chai from 'chai';
import sinon, { SinonSandbox } from 'sinon';
import type request from 'superagent';

import { OktaUser } from 'services/okta.interfaces';
import { stubConfigValue } from '../utils/helpers';
import { closeTestAgent, getTestAgent } from '../utils/test-server';
import { mockOktaFailedSignUp, mockOktaSuccessfulSignUp } from './okta.mocks';

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
    });

    beforeEach(async () => {
        sandbox = sinon.createSandbox();
        stubConfigValue(sandbox, {
            'settings.defaultApp': 'gfw',
            'authProvider': 'OKTA'
        });

        requester = await getTestAgent(true);
    });

    it('Registering a user without the actual data returns a 200 error (TODO: this should return a 422)', async () => {
        mockOktaFailedSignUp('login: The field cannot be left blank');

        const response: request.Response = await requester
            .post(`/auth/sign-up`)
            .type('form');

        response.status.should.equal(200);
        response.text.should.include('Email is required');
    });

    it('Registering a user with correct data and no app returns a 200', async () => {
        const user: OktaUser = getMockOktaUser();
        mockOktaSuccessfulSignUp(user, {
            email: user.profile.email,
            name: '',
        });

        const response: request.Response = await requester
            .post(`/auth/sign-up`)
            .type('form')
            .send({ email: user.profile.email });

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
        mockOktaSuccessfulSignUp(user, {
            email: user.profile.email,
            name: '',
            apps: ['rw'],
        });

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

    afterEach(async () => {
        if (!nock.isDone()) {
            throw new Error(`Not all nock interceptors were used: ${nock.pendingMocks()}`);
        }

        sandbox.restore();
        await closeTestAgent();
    });
});
