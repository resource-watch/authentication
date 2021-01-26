import nock from 'nock';
import chai from 'chai';
import sinon, { SinonSandbox } from 'sinon';
import type request from 'superagent';

import RenewModel from 'models/renew.model';
import { OktaUser } from 'services/okta.interfaces';
import { closeTestAgent, getTestAgent } from '../utils/test-server';
import { stubConfigValue } from '../utils/helpers';
import { mockOktaSendResetPasswordEmail } from './okta.mocks';

chai.should();

let requester: ChaiHttp.Agent;
let sandbox: SinonSandbox;

nock.disableNetConnect();
nock.enableNetConnect(process.env.HOST_IP);

describe('[OKTA] OAuth endpoints tests - Recover password request - HTML version', () => {

    before(async () => {
        if (process.env.NODE_ENV !== 'test') {
            throw Error(`Running the test suite with NODE_ENV ${process.env.NODE_ENV} may result in permanent data loss. Please use NODE_ENV=test.`);
        }

        sandbox = sinon.createSandbox();
        stubConfigValue(sandbox, { 'authProvider': 'OKTA' });

        requester = await getTestAgent();

        await RenewModel.deleteMany({}).exec();
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
