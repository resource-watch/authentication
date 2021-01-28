import nock from 'nock';
import chai from 'chai';
import mongoose from 'mongoose';
import sinon, { SinonSandbox } from 'sinon';
import type request from 'superagent';

import RenewModel from 'models/renew.model';
import { OktaUser } from 'services/okta.interfaces';
import { closeTestAgent, getTestAgent } from '../utils/test-server';
import { stubConfigValue } from '../utils/helpers';
import {getMockOktaUser, mockOktaUpdatePassword} from './okta.mocks';

chai.should();

let requester: ChaiHttp.Agent;
let sandbox: SinonSandbox;

nock.disableNetConnect();
nock.enableNetConnect(process.env.HOST_IP);

describe('[OKTA] OAuth endpoints tests - Recover password post - HTML version', () => {

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

    it('Recover password post with fake token should return an error - HTML format (TODO: this should return a 422)', async () => {
        const response: request.Response = await requester.post(`/auth/reset-password/token`);
        response.status.should.equal(200);
        response.should.be.html;
        response.text.should.include(`Token expired`);
    });

    it('Recover password post with correct token and missing passwords should return an error message - HTML format', async () => {
        await new RenewModel({
            userId: mongoose.Types.ObjectId(),
            token: 'myToken'
        }).save();

        const response: request.Response = await requester
            .post(`/auth/reset-password/myToken`)
            .type('form');

        response.status.should.equal(200);
        response.should.be.html;
        response.text.should.include(`Password and Repeat password are required`);
    });

    it('Recover password post with correct token and missing repeat password should return an error message - HTML format', async () => {
        await new RenewModel({
            userId: mongoose.Types.ObjectId(),
            token: 'myToken'
        }).save();

        const response: request.Response = await requester
            .post(`/auth/reset-password/myToken`)
            .type('form')
            .send({ password: 'abcd' });

        response.status.should.equal(200);
        response.should.be.html;
        response.text.should.include(`Password and Repeat password not equal`);
    });

    it('Recover password post with correct token and different password and repeatPassword should return an error message - HTML format', async () => {
        await new RenewModel({
            userId: mongoose.Types.ObjectId(),
            token: 'myToken'
        }).save();

        const response: request.Response = await requester
            .post(`/auth/reset-password/myToken`)
            .type('form')
            .send({ password: 'abcd', repeatPassword: 'efgh' });

        response.status.should.equal(200);
        response.should.be.html;
        response.text.should.include(`Password and Repeat password not equal`);
    });

    it('Recover password post with correct token and matching passwords should redirect to the configured URL (happy case) - HTML format', async () => {
        const user: OktaUser = getMockOktaUser();
        mockOktaUpdatePassword(user);
        await new RenewModel({ userId: user.profile.legacyId, token: 'myToken' }).save();

        const response: request.Response = await requester
            .post(`/auth/reset-password/myToken`)
            .type('form')
            .redirects(0)
            .send({ password: 'abcd', repeatPassword: 'abcd' });

        response.should.redirect;
        response.should.redirectTo('https://resourcewatch.org');
    });

    it('Recover password post with correct token, matching passwords and custom origin app should redirect to that app\'s configured URL - HTML format', async () => {
        const user: OktaUser = getMockOktaUser();
        mockOktaUpdatePassword(user);
        await new RenewModel({ userId: user.profile.legacyId, token: 'myToken' }).save();

        const response: request.Response = await requester
            .post(`/auth/reset-password/myToken?origin=gfw`)
            .type('form')
            .redirects(0)
            .send({ password: 'abcd', repeatPassword: 'abcd' });

        response.should.redirect;
        response.should.redirectTo('https://www.globalforestwatch.org');
    });

    afterEach(async () => {
        if (!nock.isDone()) {
            throw new Error(`Not all nock interceptors were used: ${nock.pendingMocks()}`);
        }

        sandbox.restore();
        await closeTestAgent();
    });
});
