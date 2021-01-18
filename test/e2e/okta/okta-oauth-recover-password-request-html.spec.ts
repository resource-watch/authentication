import nock from 'nock';
import chai from 'chai';
import { isEqual } from 'lodash';

import config from 'config';
import UserModel from 'models/user.model';
import UserTempModel from 'models/user-temp.model';
import RenewModel from 'models/renew.model';
import type request from 'superagent';
import { closeTestAgent, getTestAgent } from '../utils/test-server';

chai.should();

let requester: ChaiHttp.Agent;

nock.disableNetConnect();
nock.enableNetConnect(process.env.HOST_IP);

describe('[OKTA] OAuth endpoints tests - Recover password request - HTML version', () => {

    before(async () => {
        if (process.env.NODE_ENV !== 'test') {
            throw Error(`Running the test suite with NODE_ENV ${process.env.NODE_ENV} may result in permanent data loss. Please use NODE_ENV=test.`);
        }
        if (!process.env.SPARKPOST_KEY) {
            throw Error(`Running the test suite without SPARKPOST_KEY will fail. Please set a value for SPARKPOST_KEY`);
        }

        requester = await getTestAgent(true);

        await UserModel.deleteMany({}).exec();
        await UserTempModel.deleteMany({}).exec();
    });

    beforeEach(async () => {
        await UserModel.deleteMany({}).exec();
        await UserTempModel.deleteMany({}).exec();
        await RenewModel.deleteMany({}).exec();
    });

    it('Recover password request with no email should return an error - HTML format (TODO: this should return a 422)', async () => {
        const response: request.Response = await requester
            .post(`/auth/reset-password`);

        response.status.should.equal(200);
        response.should.be.html;
        response.text.should.include(`Mail required`);
    });

    it('Recover password request with non-existing email should return an error - HTML format', async () => {
        const response: request.Response = await requester
            .post(`/auth/reset-password`)
            .type('form')
            .send({
                email: 'pepito@gmail.com'
            });

        response.status.should.equal(200);
        response.should.be.html;
        response.text.should.include(`User not found`);
    });

    it('Recover password request with correct email should return OK - HTML format', async () => {
        nock('https://api.sparkpost.com')
            .post('/api/v1/transmissions', (body) => {
                const expectedRequestBody: Record<string, any> = {
                    content: {
                        template_id: 'recover-password'
                    },
                    recipients: [
                        {
                            address: {
                                email: 'potato@gmail.com'
                            }
                        }
                    ],
                    substitution_data: {
                        fromEmail: 'noreply@resourcewatch.org',
                        fromName: 'Resource Watch',
                        appName: 'RW API',
                        logo: 'https://resourcewatch.org/static/images/logo-embed.png'
                    }
                };

                body.should.have.property('substitution_data').and.be.an('object');
                body.substitution_data.should.have.property('urlRecover').and.include(`${config.get('server.publicUrl')}/auth/reset-password/`);
                body.substitution_data.should.have.property('urlRecover').and.include('origin=rw');

                delete body.substitution_data.urlRecover;

                body.should.deep.equal(expectedRequestBody);

                return isEqual(body, expectedRequestBody);
            })
            .once()
            .reply(200, {
                results: {
                    total_rejected_recipients: 0,
                    total_accepted_recipients: 1,
                    id: 11668787484950529
                }
            });

        await new UserModel({
            email: 'potato@gmail.com'
        }).save();

        const response: request.Response = await requester
            .post(`/auth/reset-password`)
            .type('form')
            .send({
                email: 'potato@gmail.com'
            });

        response.status.should.equal(200);
        response.should.be.html;
        response.text.should.include(`Email sent`);
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