import nock from 'nock';
import chai from 'chai';
import type request from 'superagent';

import RenewModel from 'models/renew.model';
import { OktaUser } from 'services/okta.interfaces';
import { closeTestAgent, getTestAgent } from '../utils/test-server';
import { mockOktaSendResetPasswordEmail } from './okta.mocks';

chai.should();

let requester: ChaiHttp.Agent;

nock.disableNetConnect();
nock.enableNetConnect(process.env.HOST_IP);

describe('[OKTA] OAuth endpoints tests - Recover password request - JSON version', () => {

    before(async () => {
        if (process.env.NODE_ENV !== 'test') {
            throw Error(`Running the test suite with NODE_ENV ${process.env.NODE_ENV} may result in permanent data loss. Please use NODE_ENV=test.`);
        }

        requester = await getTestAgent();

        await RenewModel.deleteMany({}).exec();
    });

    it('Recover password request with no email should return an error - JSON format', async () => {
        const response: request.Response = await requester
            .post(`/auth/reset-password`)
            .set('Content-Type', 'application/json');

        response.status.should.equal(422);
        response.should.be.json;
        response.body.should.have.property('errors').and.be.an('array');
        response.body.errors[0].should.have.property('detail').and.equal(`Mail required`);
    });

    it('Recover password request with non-existing email should return a 422 error - JSON format', async () => {
        const response: request.Response = await requester
            .post(`/auth/reset-password`)
            .set('Content-Type', 'application/json')
            .send({ email: 'pepito@gmail.com' });

        response.status.should.equal(422);
        response.should.be.json;
        response.body.should.have.property('errors').and.be.an('array');
        response.body.errors[0].should.have.property('detail').and.equal(`User not found`);
    });

    it('Recover password request with correct email should return OK - JSON format', async () => {
        const user: OktaUser = mockOktaSendResetPasswordEmail();

        const response: request.Response = await requester
            .post(`/auth/reset-password`)
            .set('Content-Type', 'application/json')
            .send({ email: user.profile.email });

        response.status.should.equal(200);
        response.should.be.json;
        response.body.should.have.property('message').and.equal(`Email sent`);
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
