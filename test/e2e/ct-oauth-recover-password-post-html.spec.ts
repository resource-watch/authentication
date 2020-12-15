import nock from 'nock';
import chai from 'chai';
import mongoose from 'mongoose';

import UserModel, { IUser } from 'models/user.model';
import UserTempModel from 'models/user-temp.model';
import RenewModel from 'models/renew.model';
import type request from 'superagent';
import { closeTestAgent, getTestAgent } from './utils/test-server';

chai.should();

let requester: ChaiHttp.Agent;

nock.disableNetConnect();
nock.enableNetConnect(process.env.HOST_IP);

describe('OAuth endpoints tests - Recover password post - HTML version', () => {

    before(async () => {
        if (process.env.NODE_ENV !== 'test') {
            throw Error(`Running the test suite with NODE_ENV ${process.env.NODE_ENV} may result in permanent data loss. Please use NODE_ENV=test.`);
        }

        requester = await getTestAgent(true);
    });

    beforeEach(async () => {
        await UserModel.deleteMany({}).exec();
        await UserTempModel.deleteMany({}).exec();
        await RenewModel.deleteMany({}).exec();
    });

    it('Recover password post with fake token should return an error - HTML format (TODO: this should return a 422)', async () => {
        const response: request.Response = await requester
            .post(`/auth/reset-password/token`);

        return new Promise((resolve) => {
            response.status.should.equal(200);
            response.should.be.html;
            response.text.should.include(`Token expired`);
            resolve();
        });
    });

    it('Recover password post with correct token and missing passwords should return an error message - HTML format', async () => {
        await new RenewModel({
            userId: mongoose.Types.ObjectId(),
            token: 'myToken'
        }).save();

        const response: request.Response = await requester
            .post(`/auth/reset-password/myToken`)
            .type('form');

        return new Promise((resolve) => {
            response.status.should.equal(200);
            response.should.be.html;
            response.text.should.include(`Password and Repeat password are required`);
            resolve();
        });
    });

    it('Recover password post with correct token and missing repeat password should return an error message - HTML format', async () => {
        await new RenewModel({
            userId: mongoose.Types.ObjectId(),
            token: 'myToken'
        }).save();

        const response: request.Response = await requester
            .post(`/auth/reset-password/myToken`)
            .type('form')
            .send({
                password: 'abcd'
            });

        return new Promise((resolve) => {
            response.status.should.equal(200);
            response.should.be.html;
            response.text.should.include(`Password and Repeat password not equal`);
            resolve();
        });
    });

    it('Recover password post with correct token and different password and repeatPassword should return an error message - HTML format', async () => {
        await new RenewModel({
            userId: mongoose.Types.ObjectId(),
            token: 'myToken'
        }).save();

        const response: request.Response = await requester
            .post(`/auth/reset-password/myToken`)
            .type('form')
            .send({
                password: 'abcd',
                repeatPassword: 'efgh'
            });

        return new Promise((resolve) => {
            response.status.should.equal(200);
            response.should.be.html;
            response.text.should.include(`Password and Repeat password not equal`);
            resolve();
        });
    });

    it('Recover password post with correct token and matching passwords should redirect to the configured URL (happy case) - HTML format', async () => {
        const user: IUser = await new UserModel({
            email: 'potato@gmail.com'
        }).save();

        await new RenewModel({
            userId: user._id,
            token: 'myToken'
        }).save();

        const response: request.Response = await requester
            .post(`/auth/reset-password/myToken`)
            .type('form')
            .redirects(0)
            .send({
                password: 'abcd',
                repeatPassword: 'abcd'
            });

        return new Promise((resolve) => {
            response.should.redirect;
            response.should.redirectTo('https://resourcewatch.org');
            resolve();
        });
    });

    it('Recover password post with correct token, matching passwords and custom origin app should redirect to that app\'s configured URL - HTML format', async () => {
        const user: IUser = await new UserModel({
            email: 'potato@gmail.com'
        }).save();

        await new RenewModel({
            userId: user._id,
            token: 'myToken'
        }).save();

        const response: request.Response = await requester
            .post(`/auth/reset-password/myToken?origin=gfw`)
            .type('form')
            .redirects(0)
            .send({
                password: 'abcd',
                repeatPassword: 'abcd'
            });

        return new Promise((resolve) => {
            response.should.redirect;
            response.should.redirectTo('https://www.globalforestwatch.org');
            resolve();
        });
    });

    after(async () => {
        await closeTestAgent();
    });

    afterEach(async () => {
        await UserModel.deleteMany({}).exec();
        await UserTempModel.deleteMany({}).exec();
        await RenewModel.deleteMany({}).exec();

        if (!nock.isDone()) {
            throw new Error(`Not all nock interceptors were used: ${nock.pendingMocks()}`);
        }
    });
});
