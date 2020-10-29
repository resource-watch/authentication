const nock = require('nock');
const chai = require('chai');

const UserModel = require('plugins/sd-ct-oauth-plugin/models/user.model');

const { createUserAndToken } = require('../utils/helpers');
const { getTestAgent, closeTestAgent } = require('./../test-server');

chai.should();

let requester;

nock.disableNetConnect();
nock.enableNetConnect(process.env.HOST_IP);

describe('GET current user details', () => {

    before(async () => {
        if (process.env.NODE_ENV !== 'test') {
            throw Error(`Running the test suite with NODE_ENV ${process.env.NODE_ENV} may result in permanent data loss. Please use NODE_ENV=test.`);
        }

        requester = await getTestAgent();

        await UserModel.deleteMany({}).exec();


    });

    it('Getting my user without being logged in returns a 401', async () => {
        const response = await requester
            .get(`/auth/user/me`);

        response.status.should.equal(401);
    });

    it('Getting my user while being logged in with USER role returns the user', async () => {
        const { token, user } = await createUserAndToken({ role: 'USER' });

        const response = await requester
            .get(`/auth/user/me`)
            .set('Authorization', `Bearer ${token}`);

        response.status.should.equal(200);

        response.body.should.have.property('_id').and.equal(user.id.toString());
        response.body.should.have.property('extraUserData').and.be.an('object');
        response.body.extraUserData.should.have.property('apps').and.be.an('array').and.deep.equal(user.extraUserData.apps);
        response.body.should.have.property('email').and.equal(user.email);
        response.body.should.have.property('createdAt');
        response.body.should.have.property('role').and.equal(user.role);
        response.body.should.have.property('provider').and.equal(user.provider);
    });

    it('Getting my user while being logged in with ADMIN role returns', async () => {
        const { token, user } = await createUserAndToken({ role: 'ADMIN' });

        const response = await requester
            .get(`/auth/user/me`)
            .set('Authorization', `Bearer ${token}`);

        response.status.should.equal(200);

        response.body.should.have.property('_id').and.equal(user.id.toString());
        response.body.should.have.property('extraUserData').and.be.an('object');
        response.body.extraUserData.should.have.property('apps').and.be.an('array').and.deep.equal(user.extraUserData.apps);
        response.body.should.have.property('email').and.equal(user.email);
        response.body.should.have.property('createdAt');
        response.body.should.have.property('role').and.equal(user.role);
        response.body.should.have.property('provider').and.equal(user.provider);
    });

    after(closeTestAgent);

    afterEach(async () => {
        await UserModel.deleteMany({}).exec();

        if (!nock.isDone()) {
            throw new Error(`Not all nock interceptors were used: ${nock.pendingMocks()}`);
        }
    });
});
