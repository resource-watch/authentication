import nock from 'nock';
import chai from 'chai';

import UserModel, { UserDocument } from 'models/user.model';
import { createUserAndToken } from './utils/helpers';
import { closeTestAgent, getTestAgent } from './utils/test-server';
import type request from 'superagent';

chai.should();

let requester: ChaiHttp.Agent;

nock.disableNetConnect();
nock.enableNetConnect(process.env.HOST_IP);

const assertTokenInfo: (response: ChaiHttp.Response, user: (UserDocument | Partial<UserDocument>)) => void = (response: ChaiHttp.Response, user: UserDocument | Partial<UserDocument>) => {
    response.status.should.equal(200);
    response.body.should.have.property('_id').and.equal(user.id.toString());
    response.body.should.have.property('extraUserData').and.be.an('object');
    response.body.extraUserData.should.have.property('apps').and.be.an('array').and.deep.equal(user.extraUserData.apps);
    response.body.should.have.property('email').and.equal(user.email);
    response.body.should.have.property('createdAt');
    response.body.should.have.property('role').and.equal(user.role);
    response.body.should.have.property('provider').and.equal(user.provider);
};

describe('GET current user details from token (to be called by other MSs)', () => {

    before(async () => {
        if (process.env.NODE_ENV !== 'test') {
            throw Error(`Running the test suite with NODE_ENV ${process.env.NODE_ENV} may result in permanent data loss. Please use NODE_ENV=test.`);
        }

        requester = await getTestAgent();

        await UserModel.deleteMany({}).exec();
    });

    it('Getting user details from token without being logged in returns a 401', async () => {
        const response: request.Response = await requester.get(`/auth/user/me`);
        response.status.should.equal(401);
    });

    it('Getting user details from token while being logged in with USER role returns 403 Forbidden', async () => {
        const { token, user } = await createUserAndToken({ role: 'USER' });
        const response: request.Response = await requester.get(`/auth/user/me`).set('Authorization', `Bearer ${token}`);
        assertTokenInfo(response, user);
    });

    it('Getting user details from token while being logged in with MANAGER role returns', async () => {
        const { token, user } = await createUserAndToken({ role: 'MANAGER' });
        const response: request.Response = await requester.get(`/auth/user/me`).set('Authorization', `Bearer ${token}`);
        assertTokenInfo(response, user);
    });

    it('Getting user details from token while being logged in with ADMIN role returns', async () => {
        const { token, user } = await createUserAndToken({ role: 'ADMIN' });
        const response: request.Response = await requester.get(`/auth/user/me`).set('Authorization', `Bearer ${token}`);
        assertTokenInfo(response, user);
    });

    it('Getting user details from token while being logged in with MICROSERVICE role returns', async () => {
        const { token, user } = await createUserAndToken({ role: 'MICROSERVICE' });
        const response: request.Response = await requester.get(`/auth/user/me`).set('Authorization', `Bearer ${token}`);
        assertTokenInfo(response, user);
    });

    after(closeTestAgent);

    afterEach(async () => {
        await UserModel.deleteMany({}).exec();

        if (!nock.isDone()) {
            throw new Error(`Not all nock interceptors were used: ${nock.pendingMocks()}`);
        }
    });
});
