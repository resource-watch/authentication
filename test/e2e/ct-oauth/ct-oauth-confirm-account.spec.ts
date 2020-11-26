import chai from 'chai';
import nock  from 'nock';
import sinon, {SinonSandbox} from 'sinon';

import UserModel from 'plugins/sd-ct-oauth-plugin/models/user.model';
import UserTempModel from 'plugins/sd-ct-oauth-plugin/models/user-temp.model';
import { getTestAgent, closeTestAgent } from '../test-server';
import { getUUID, stubConfigValue } from '../utils/helpers';

const should = chai.should();

let requester: ChaiHttp.Agent;
let sandbox: SinonSandbox;

nock.disableNetConnect();
nock.enableNetConnect(process.env.HOST_IP);

describe('OAuth endpoints tests - Confirm account', () => {

    before(async () => {
        if (process.env.NODE_ENV !== 'test') {
            throw Error(`Running the test suite with NODE_ENV ${process.env.NODE_ENV} may result in permanent data loss. Please use NODE_ENV=test.`);
        }

        requester = await getTestAgent(true);

        await UserModel.deleteMany({}).exec();
        await UserTempModel.deleteMany({}).exec();
    });

    beforeEach(() => { sandbox = sinon.createSandbox(); });

    it('Confirm account request with invalid token should return an error', async () => {
        const response = await requester
            .get(`/auth/confirm/fakeToken`)
            .set('Content-Type', 'application/json');

        response.status.should.equal(400);
        response.should.be.json;
        response.body.should.have.property('errors').and.be.an('array');
        response.body.errors[0].should.have.property('detail').and.equal(`User expired or token not found`);
    });

    it('Confirm account request with valid token should return HTTP 200 and the user data', async () => {
        const confirmationToken = getUUID();
        await new UserTempModel({
            email: 'test@example.com',
            confirmationToken,
            extraUserData: {
                apps: ['rw']
            }
        }).save();

        const response = await requester
            .get(`/auth/confirm/${confirmationToken}`)
            .set('Content-Type', 'application/json');

        response.status.should.equal(200);
        response.should.be.json;

        const responseUser = response.body.data;
        responseUser.should.have.property('email').and.equal('test@example.com');
        responseUser.should.have.property('role').and.equal('USER');
        responseUser.should.have.property('extraUserData').and.be.an('object');
        responseUser.extraUserData.should.have.property('apps').and.be.an('array').and.contain('rw');
    });

    it('Confirm account request with configured redirect should return HTTP 200 and redirect to URL', async () => {
        const confirmationToken = getUUID();
        await new UserTempModel({
            email: 'test@example.com',
            confirmationToken,
            extraUserData: {
                apps: ['rw']
            }
        }).save();

        const response = await requester
            .get(`/auth/confirm/${confirmationToken}`);

        response.status.should.equal(200);
        response.should.be.json;

        const responseUser = response.body.data;
        responseUser.should.have.property('email').and.equal('test@example.com');
        responseUser.should.have.property('role').and.equal('USER');
        responseUser.should.have.property('extraUserData').and.be.an('object');
        responseUser.extraUserData.should.have.property('apps').and.be.an('array').and.contain('rw');

        const missingTempUser = await UserTempModel.findOne({ email: 'test@example.com' }).exec();
        should.not.exist(missingTempUser);

        const confirmedUser = await UserModel.findOne({ email: 'test@example.com' }).exec();
        should.exist(confirmedUser);
        confirmedUser.should.have.property('email').and.equal('test@example.com');
        confirmedUser.should.have.property('role').and.equal('USER');
        confirmedUser.should.have.property('extraUserData').and.be.an('object');
        confirmedUser.extraUserData.apps.should.be.an('array').and.contain('rw');
    });

    it('Confirm account request with valid token and a configured global redirect should return HTTP 200 and the redirect URL', async () => {
        stubConfigValue(sandbox, { 'settings.local.confirmUrlRedirect' : 'http://www.google.com/' });

        const confirmationToken = getUUID();
        await new UserTempModel({
            email: 'test@example.com',
            confirmationToken,
            extraUserData: {
                apps: ['rw']
            }
        }).save();

        const response = await requester.get(`/auth/confirm/${confirmationToken}`).redirects(0);
        response.should.redirect;
        response.header.location.should.equal('http://www.google.com/');

        const missingTempUser = await UserTempModel.findOne({ email: 'test@example.com' }).exec();
        should.not.exist(missingTempUser);

        const confirmedUser = await UserModel.findOne({ email: 'test@example.com' }).exec();
        should.exist(confirmedUser);
        confirmedUser.should.have.property('email').and.equal('test@example.com');
        confirmedUser.should.have.property('role').and.equal('USER');
        confirmedUser.should.have.property('extraUserData').and.be.an('object');
        confirmedUser.extraUserData.apps.should.be.an('array').and.contain('rw');
    });

    it('Confirm account request with valid token and a configured redirect per app should return HTTP 200 and the matching redirect URL', async () => {
        stubConfigValue(sandbox,  {
            'settings.local.gfw.confirmUrlRedirect': 'https://www.globalforestwatch.org/',
            'settings.local.rw.confirmUrlRedirect': 'https://resourcewatch.org/myrw/areas',
            'settings.local.prep.confirmUrlRedirect': 'https://www.prepdata.org/',
            'settings.local.confirmUrlRedirect': 'http://www.google.com/',
        });

        requester = await getTestAgent(true);

        const confirmationToken = getUUID();
        await new UserTempModel({
            email: 'test@example.com',
            confirmationToken,
            extraUserData: {
                apps: ['rw']
            }
        }).save();

        const response = await requester
            .get(`/auth/confirm/${confirmationToken}`)
            .redirects(0);

        response.should.redirect;

        response.header.location.should.equal('https://resourcewatch.org/myrw/areas');

        const missingTempUser = await UserTempModel.findOne({ email: 'test@example.com' }).exec();
        should.not.exist(missingTempUser);

        const confirmedUser = await UserModel.findOne({ email: 'test@example.com' }).exec();
        should.exist(confirmedUser);
        confirmedUser.should.have.property('email').and.equal('test@example.com');
        confirmedUser.should.have.property('role').and.equal('USER');
        confirmedUser.should.have.property('extraUserData').and.be.an('object');
        confirmedUser.extraUserData.apps.should.be.an('array').and.contain('rw');
    });

    it('Confirm account request with valid token and a configured redirect per app should return HTTP 200 and the use the fallback redirect URL', async () => {
        stubConfigValue(sandbox,  {
            'settings.local.gfw.confirmUrlRedirect': 'https://www.globalforestwatch.org/',
            'settings.local.rw.confirmUrlRedirect': 'https://resourcewatch.org/myrw/areas',
            'settings.local.prep.confirmUrlRedirect': 'https://www.prepdata.org/',
            'settings.local.confirmUrlRedirect': 'http://www.google.com/',
        });

        requester = await getTestAgent(true);

        const confirmationToken = getUUID();
        await new UserTempModel({
            email: 'test@example.com',
            confirmationToken,
            extraUserData: {
                apps: ['fakeApp']
            }
        }).save();

        const response = await requester
            .get(`/auth/confirm/${confirmationToken}`)
            .redirects(0);

        response.should.redirect;

        response.redirects.should.be.an('array');
        response.header.location.should.equal('http://www.google.com/');

        const missingTempUser = await UserTempModel.findOne({ email: 'test@example.com' }).exec();
        should.not.exist(missingTempUser);

        const confirmedUser = await UserModel.findOne({ email: 'test@example.com' }).exec();
        should.exist(confirmedUser);
        confirmedUser.should.have.property('email').and.equal('test@example.com');
        confirmedUser.should.have.property('role').and.equal('USER');
        confirmedUser.should.have.property('extraUserData').and.be.an('object');
        confirmedUser.extraUserData.apps.should.be.an('array').and.contain('rw');
    });

    it('Confirm account request with valid token and a redirect query param should return HTTP 200 and the use the query param redirect', async () => {
        stubConfigValue(sandbox,  {
            'settings.local.gfw.confirmUrlRedirect': 'https://www.globalforestwatch.org/',
            'settings.local.rw.confirmUrlRedirect': 'https://resourcewatch.org/myrw/areas',
            'settings.local.prep.confirmUrlRedirect': 'https://www.prepdata.org/',
            'settings.local.confirmUrlRedirect': 'http://www.google.com/',
        });

        requester = await getTestAgent(true);

        const confirmationToken = getUUID();
        await new UserTempModel({
            email: 'test@example.com',
            confirmationToken,
            extraUserData: {
                apps: ['fakeApp']
            }
        }).save();

        const response = await requester
            .get(`/auth/confirm/${confirmationToken}?callbackUrl=http://vizzuality.com/`)
            .redirects(0);

        response.should.redirect;

        response.header.location.should.equal('http://vizzuality.com/');

        const missingTempUser = await UserTempModel.findOne({ email: 'test@example.com' }).exec();
        should.not.exist(missingTempUser);

        const confirmedUser = await UserModel.findOne({ email: 'test@example.com' }).exec();
        should.exist(confirmedUser);
        confirmedUser.should.have.property('email').and.equal('test@example.com');
        confirmedUser.should.have.property('role').and.equal('USER');
        confirmedUser.should.have.property('extraUserData').and.be.an('object');
        confirmedUser.extraUserData.apps.should.be.an('array').and.contain('rw');
    });

    after(async () => {
        await UserModel.deleteMany({}).exec();
        await UserTempModel.deleteMany({}).exec();

        await closeTestAgent();
    });

    afterEach(() => {
        if (!nock.isDone()) {
            throw new Error(`Not all nock interceptors were used: ${nock.pendingMocks()}`);
        }

        sandbox.restore();
    });
});
