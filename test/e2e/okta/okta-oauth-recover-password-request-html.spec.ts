import nock from 'nock';
import chai from 'chai';
import type request from 'superagent';

import { OktaUser } from 'services/okta.interfaces';
import { closeTestAgent, getTestAgent } from '../utils/test-server';
import { mockOktaSendResetPasswordEmail } from './okta.mocks';

chai.should();

let requester: ChaiHttp.Agent;

nock.disableNetConnect();
nock.enableNetConnect(process.env.HOST_IP);

describe('[OKTA] OAuth endpoints tests - Recover password request - HTML version', () => {

    before(async () => {
        if (process.env.NODE_ENV !== 'test') {
            throw Error(`Running the test suite with NODE_ENV ${process.env.NODE_ENV} may result in permanent data loss. Please use NODE_ENV=test.`);
        }

        requester = await getTestAgent();
    });

    it('Recover password request with no email should return an error - HTML format (TODO: this should return a 422)', async () => {
        const response: request.Response = await requester.post(`/auth/reset-password`);
        response.status.should.equal(200);
        response.should.be.html;
        response.text.should.include(`Mail required`);
    });

    it('Recover password request with non-existing email should return an error - HTML format', async () => {
        const response: request.Response = await requester
            .post(`/auth/reset-password`)
            .type('form')
            .send({ email: 'pepito@gmail.com' });

        response.status.should.equal(200);
        response.should.be.html;
        response.text.should.include(`User not found`);
    });

    it('Recover password request with correct email should return OK - HTML format', async () => {
        const user: OktaUser = mockOktaSendResetPasswordEmail();

        const response: request.Response = await requester
            .post(`/auth/reset-password`)
            .type('form')
            .send({ email: user.profile.email });

        response.status.should.equal(200);
        response.should.be.html;
        response.text.should.include(`Email sent`);
    });

    it('Okta user origin is updated with HTTP referer when a submitting a successful recover password request', async () => {
        const user: OktaUser = mockOktaSendResetPasswordEmail({}, 1, 'https://www.google.com');

        const response: request.Response = await requester
            .post(`/auth/reset-password`)
            .type('form')
            .set('Referer', 'https://www.google.com')
            .send({ email: user.profile.email });

        response.status.should.equal(200);
        response.should.be.html;
        response.text.should.include(`Email sent`);
    });

    it('Okta user origin is updated with callback URL from query if provided when a submitting a successful recover password request', async () => {
        const user: OktaUser = mockOktaSendResetPasswordEmail({}, 1, 'https://www.facebook.com');

        const response: request.Response = await requester
            .post(`/auth/reset-password?callbackUrl=https://www.facebook.com`)
            .type('form')
            .send({ email: user.profile.email });

        response.status.should.equal(200);
        response.should.be.html;
        response.text.should.include(`Email sent`);
    });

    it('Okta user origin is updated with callback URL from body if provided when a submitting a successful recover password request', async () => {
        const user: OktaUser = mockOktaSendResetPasswordEmail({}, 1, 'https://www.google.com');

        const response: request.Response = await requester
            .post(`/auth/reset-password`)
            .type('form')
            .send({ email: user.profile.email, callbackUrl: 'https://www.google.com' });

        response.status.should.equal(200);
        response.should.be.html;
        response.text.should.include(`Email sent`);
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
