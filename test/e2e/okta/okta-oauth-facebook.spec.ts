import chai from 'chai';
import config from 'config';
import nock from 'nock';
import crypto from 'crypto';
import JWT from 'jsonwebtoken';

import { closeTestAgent, getTestAgent } from '../utils/test-server';
import type request from 'superagent';
import sinon, {SinonSandbox} from 'sinon';
import {stubConfigValue} from '../utils/helpers';

chai.should();

let requester: ChaiHttp.Agent;
let sandbox: SinonSandbox;

nock.disableNetConnect();
nock.enableNetConnect(process.env.HOST_IP);

describe('[OKTA] Facebook auth endpoint tests', () => {

    before(async () => {
        if (process.env.NODE_ENV !== 'test') {
            throw Error(`Running the test suite with NODE_ENV ${process.env.NODE_ENV} may result in permanent data loss. Please use NODE_ENV=test.`);
        }
    });

    beforeEach(async () => {
        sandbox = sinon.createSandbox();
        stubConfigValue(sandbox, { 'authProvider': 'OKTA' });

        requester = await getTestAgent(true);
    });

    it('Visiting /auth/facebook while not being logged in should redirect to Okta\'s OAuth URL', async () => {
        const response: request.Response = await requester.get(`/auth/facebook`).redirects(0);
        response.should.redirect;
        response.header.location.should.contain(config.get('okta.url'));
        response.header.location.should.match(/oauth2\/default\/v1\/authorize/);
        response.header.location.should.contain(`client_id=${config.get('okta.clientId')}`);
        response.header.location.should.contain(`response_type=code`);
        response.header.location.should.contain(`response_mode=query`);
        response.header.location.should.match(/scope=openid(.*)profile(.*)email/);
        response.header.location.should.match(/redirect_uri=(.*)auth(.*)authorization-code(.*)callback/);
        response.header.location.should.contain(`idp=${config.get('okta.gfw.facebook.idp')}`);
        response.header.location.should.match(/state=\w/);
    });

    // TODO: this might need to stay like this....
    it('Visiting /auth/facebook/token with a valid Facebook OAuth token should generate a new token', async () => {
        // TODO: switch to finding user by ID or email
        // const existingUser: UserDocument = await UserModel.findOne({ email: 'john.doe@vizzuality.com' }).exec();
        // should.exist(existingUser);
        // existingUser.should.have.property('email').and.equal('john.doe@vizzuality.com');
        // existingUser.should.have.property('name').and.equal('John Doe');
        // existingUser.should.have.property('photo').and.equal('https://images.pexels.com/photos/20787/pexels-photo.jpg?auto=compress&cs=tinysrgb&h=750&w=1260');
        // existingUser.should.have.property('role').and.equal('USER');
        // existingUser.should.have.property('provider').and.equal('facebook');
        // existingUser.should.have.property('providerId').and.equal('10216001184997572');
        // existingUser.should.have.property('userToken').and.equal(undefined);

        const proof: string = crypto.createHmac('sha256', config.get('settings.thirdParty.rw.facebook.clientSecret'))
            .update('TEST_FACEBOOK_OAUTH2_ACCESS_TOKEN')
            .digest('hex');

        nock('https://graph.facebook.com')
            .get('/v2.6/me')
            .query({
                appsecret_proof: proof,
                fields: 'id,name,last_name,first_name,middle_name,email',
                access_token: 'TEST_FACEBOOK_OAUTH2_ACCESS_TOKEN'
            })
            .reply(200, {
                id: '10216001184997572',
                name: 'John Doe',
                last_name: 'Doe',
                first_name: 'John',
                email: 'john.doe@vizzuality.com'
            });

        const response: request.Response = await requester.get(`/auth/facebook/token?access_token=TEST_FACEBOOK_OAUTH2_ACCESS_TOKEN`);
        response.status.should.equal(200);
        response.should.be.json;
        response.body.should.be.an('object');
        response.body.should.have.property('token').and.be.a('string');

        JWT.verify(response.body.token, process.env.JWT_SECRET);

        // TODO: validate token data
        // const userWithToken: UserDocument = await UserModel.findOne({ email: 'john.doe@vizzuality.com' }).exec();
        // should.exist(userWithToken);
        // userWithToken.should.have.property('email').and.equal('john.doe@vizzuality.com');
        // userWithToken.should.have.property('name').and.equal('John Doe');
        // userWithToken.should.have.property('photo').and.equal('https://images.pexels.com/photos/20787/pexels-photo.jpg?auto=compress&cs=tinysrgb&h=750&w=1260');
        // userWithToken.should.have.property('role').and.equal('USER');
        // userWithToken.should.have.property('provider').and.equal('facebook');
        // userWithToken.should.have.property('providerId').and.equal('10216001184997572');
        // userWithToken.should.have.property('userToken').and.equal(response.body.token);
    });

    afterEach(async () => {
        if (!nock.isDone()) {
            throw new Error(`Not all nock interceptors were used: ${nock.pendingMocks()}`);
        }

        sandbox.restore();
        await closeTestAgent();
    });
});
