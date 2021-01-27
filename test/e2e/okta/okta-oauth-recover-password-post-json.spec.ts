import nock from 'nock';
import chai from 'chai';
import mongoose from 'mongoose';
import sinon, { SinonSandbox } from 'sinon';
import type request from 'superagent';

import RenewModel from 'models/renew.model';
import { closeTestAgent, getTestAgent } from '../utils/test-server';
import { stubConfigValue } from '../utils/helpers';
import {OktaUser} from '../../../src/services/okta.interfaces';
import {mockOktaUpdatePassword} from './okta.mocks';

chai.should();

let requester: ChaiHttp.Agent;
let sandbox: SinonSandbox;

nock.disableNetConnect();
nock.enableNetConnect(process.env.HOST_IP);

describe('[OKTA] OAuth endpoints tests - Recover password post - JSON version', () => {

    before(async () => {
        if (process.env.NODE_ENV !== 'test') {
            throw Error(`Running the test suite with NODE_ENV ${process.env.NODE_ENV} may result in permanent data loss. Please use NODE_ENV=test.`);
        }
    });

    beforeEach(async () => {
        sandbox = sinon.createSandbox();
        stubConfigValue(sandbox, { 'authProvider': 'OKTA' });

        requester = await getTestAgent(true);

        await RenewModel.deleteMany({}).exec();
    });

    it('Recover password post with fake token returns a 422 error - JSON format', async () => {
        const response: request.Response = await requester
            .post(`/auth/reset-password/token`)
            .set('Content-Type', 'application/json');

        response.status.should.equal(422);
        response.should.be.json;
        response.body.should.have.property('errors').and.be.an('array');
        response.body.errors[0].should.have.property('detail').and.equal(`Token expired`);
    });

    it('Recover password post with correct token and missing passwords should return an error message - JSON format', async () => {
        await new RenewModel({
            userId: mongoose.Types.ObjectId(),
            token: 'myToken'
        }).save();

        const response: request.Response = await requester
            .post(`/auth/reset-password/myToken`)
            .set('Content-Type', 'application/json');

        response.status.should.equal(422);
        response.should.be.json;
        response.body.should.have.property('errors').and.be.an('array');
        response.body.errors[0].status.should.equal(422);
        response.body.errors[0].detail.should.equal('Password and Repeat password are required');
    });

    it('Recover password post with correct token and missing repeat password should return an error message - JSON format', async () => {
        await new RenewModel({
            userId: mongoose.Types.ObjectId(),
            token: 'myToken'
        }).save();

        const response: request.Response = await requester
            .post(`/auth/reset-password/myToken`)
            .set('Content-Type', 'application/json')
            .send({
                password: 'abcd'
            });

        response.status.should.equal(422);
        response.should.be.json;
        response.body.should.have.property('errors').and.be.an('array');
        response.body.errors[0].status.should.equal(422);
        response.body.errors[0].detail.should.equal('Password and Repeat password not equal');
    });

    it('Recover password post with correct token and different password and repeatPassword should return an error message - JSON format', async () => {
        await new RenewModel({
            userId: mongoose.Types.ObjectId(),
            token: 'myToken'
        }).save();

        const response: request.Response = await requester
            .post(`/auth/reset-password/myToken`)
            .set('Content-Type', 'application/json')
            .send({ password: 'abcd', repeatPassword: 'efgh' });

        response.status.should.equal(422);
        response.should.be.json;
        response.body.should.have.property('errors').and.be.an('array');
        response.body.errors[0].status.should.equal(422);
        response.body.errors[0].detail.should.equal('Password and Repeat password not equal');
    });

    it('Recover password post with correct token and matching passwords should redirect to the configured URL (happy case) - JSON format', async () => {
        const user: OktaUser = mockOktaUpdatePassword();
        await new RenewModel({ userId: user.profile.legacyId, token: 'myToken' }).save();

        const response: request.Response = await requester
            .post(`/auth/reset-password/myToken`)
            .set('Content-Type', 'application/json')
            .send({ password: 'abcd', repeatPassword: 'abcd' });

        response.status.should.equal(200);
        response.redirects.should.be.an('array').and.length(0);
        response.body.data.should.have.property('id').and.be.a('string').and.eql(user.profile.legacyId);
        response.body.data.should.have.property('name').and.be.a('string').and.equal(user.profile.displayName);
        response.body.data.should.have.property('photo').and.be.a('string').and.equal(user.profile.photo);
        response.body.data.should.have.property('email').and.equal(user.profile.email);
        response.body.data.should.have.property('role').and.equal(user.profile.role);
        response.body.data.should.have.property('extraUserData').and.be.an('object');
        response.body.data.extraUserData.should.have.property('apps').and.eql(user.profile.apps);
    });

    afterEach(async () => {
        if (!nock.isDone()) {
            throw new Error(`Not all nock interceptors were used: ${nock.pendingMocks()}`);
        }

        sandbox.restore();
        await closeTestAgent();
    });
});
