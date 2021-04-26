import nock from 'nock';
import chai from 'chai';
import type request from 'superagent';

import {OktaOAuthProvider, OktaUser} from 'services/okta.interfaces';
import {closeTestAgent, getTestAgent} from '../utils/test-server';
import {getMockOktaUser, mockOktaCreateUser, mockOktaGetUserByEmail, mockOktaSendActivationEmail} from './okta.mocks';
import config from 'config';

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

    it('No email provided on query parameter returns 400 Bad Request', async () => {
        const response: request.Response = await requester.get(`/auth/sign-up-redirect`);
        response.status.should.equal(400);
        response.body.errors[0].detail.should.equal('No email provided.');
    });

    it('Okta user not found returns 404 Not Found', async () => {
        nock(config.get('okta.url'))
            .get(`/api/v1/users/hello@world.com`)
            .reply(404);

        const response: request.Response = await requester.get(`/auth/sign-up-redirect?email=hello@world.com`);
        response.status.should.equal(404);
        response.body.errors[0].detail.should.equal('User not found.');
    });

    it('User with no redirect stored in Okta returns 404 Not Found error', async () => {
        const user: OktaUser = getMockOktaUser({ apps: [] });
        mockOktaGetUserByEmail(user.profile);

        const response: request.Response = await requester.get(`/auth/sign-up-redirect?email=${user.profile.email}`);
        response.status.should.equal(404);
        response.body.errors[0].detail.should.equal('Redirect not found.');
    });

    it('Signing up with no callbackUrl provided should use HTTP header referrer, and hitting the redirect endpoint should redirect the user to the origin request stored in the user upon sign up', async () => {
        const user: OktaUser = getMockOktaUser({ apps: [] });
        mockOktaCreateUser(user, {
            email: user.profile.email,
            provider: OktaOAuthProvider.LOCAL,
            role: 'USER',
            origin: 'https://www.google.com',
            apps: [],
        });
        mockOktaSendActivationEmail(user);

        const response: request.Response = await requester
            .post(`/auth/sign-up`)
            .set('Content-Type', 'application/json')
            .set('Referer', 'https://www.google.com')
            .send({ email: user.profile.email });

        response.status.should.equal(200);
        response.should.be.json;

        mockOktaGetUserByEmail({
            ...user.profile,
            origin: 'https://www.google.com',
        });

        const redirectResponse: request.Response = await requester
            .get(`/auth/sign-up-redirect?email=${user.profile.email}`)
            .redirects(0);

        redirectResponse.status.should.equal(302);
        redirectResponse.should.redirectTo('https://www.google.com');
    });

    it('Signing up with callbackUrl in request body should redirect the user to the origin request stored in the user upon sign up', async () => {
        const user: OktaUser = getMockOktaUser({ apps: [] });
        mockOktaCreateUser(user, {
            email: user.profile.email,
            provider: OktaOAuthProvider.LOCAL,
            role: 'USER',
            origin: 'https://www.google.com',
            apps: [],
        });
        mockOktaSendActivationEmail(user);

        const response: request.Response = await requester
            .post(`/auth/sign-up`)
            .set('Content-Type', 'application/json')
            .send({
                email: user.profile.email,
                callbackUrl: 'https://www.google.com',
            });

        response.status.should.equal(200);
        response.should.be.json;

        mockOktaGetUserByEmail({
            ...user.profile,
            origin: 'https://www.google.com',
        });

        const redirectResponse: request.Response = await requester
            .get(`/auth/sign-up-redirect?email=${user.profile.email}`)
            .redirects(0);

        redirectResponse.status.should.equal(302);
        redirectResponse.should.redirectTo('https://www.google.com');
    });

    it('Signing up with callbackUrl in query parameter should redirect the user to the origin request stored in the user upon sign up', async () => {
        const user: OktaUser = getMockOktaUser({ apps: [] });
        mockOktaCreateUser(user, {
            email: user.profile.email,
            provider: OktaOAuthProvider.LOCAL,
            role: 'USER',
            origin: 'https://www.google.com',
            apps: [],
        });
        mockOktaSendActivationEmail(user);

        const response: request.Response = await requester
            .post(`/auth/sign-up?callbackUrl=https://www.google.com`)
            .set('Content-Type', 'application/json')
            .send({ email: user.profile.email });

        response.status.should.equal(200);
        response.should.be.json;

        mockOktaGetUserByEmail({
            ...user.profile,
            origin: 'https://www.google.com',
        });

        const redirectResponse: request.Response = await requester
            .get(`/auth/sign-up-redirect?email=${user.profile.email}`)
            .redirects(0);

        redirectResponse.status.should.equal(302);
        redirectResponse.should.redirectTo('https://www.google.com');
    });

    it('Emails with special characters get correctly decoded when requesting a sign-up redirect', async () => {
        const user: OktaUser = getMockOktaUser({ email: 'test-with-plus+2@email.com' });

        mockOktaGetUserByEmail({ ...user.profile, origin: 'https://www.google.com' });

        const redirectResponse: request.Response = await requester
            .get(`/auth/sign-up-redirect?email=test-with-plus%2B2%40email.com`)
            .redirects(0);

        redirectResponse.status.should.equal(302);
        redirectResponse.should.redirectTo('https://www.google.com');
    });

    it('Emails with spaces get replaced with `+` signs and correctly decoded when requesting a sign-up redirect', async () => {
        const user: OktaUser = getMockOktaUser({ email: 'test-with-plus+2@email.com' });

        mockOktaGetUserByEmail({ ...user.profile, origin: 'https://www.google.com' });

        const redirectResponse: request.Response = await requester
            .get(`/auth/sign-up-redirect?email=test-with-plus%202@email.com`)
            .redirects(0);

        redirectResponse.status.should.equal(302);
        redirectResponse.should.redirectTo('https://www.google.com');
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
