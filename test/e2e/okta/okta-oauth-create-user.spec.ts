import nock from 'nock';
import chai from 'chai';
import chaiDateTime from "chai-datetime";
import type request from 'superagent';

import UserModel from 'models/user.model';
import UserTempSchema, {IUserTemp} from "models/user-temp.model";
import { closeTestAgent, getTestAgent } from '../utils/test-server';
import { createUserAndToken } from '../utils/helpers';

chai.should();
chai.use(chaiDateTime);

let requester: ChaiHttp.Agent;

nock.disableNetConnect();
nock.enableNetConnect(process.env.HOST_IP);

describe('[OKTA] User management endpoints tests - Create user', () => {

    before(async () => {
        if (process.env.NODE_ENV !== 'test') {
            throw Error(`Running the test suite with NODE_ENV ${process.env.NODE_ENV} may result in permanent data loss. Please use NODE_ENV=test.`);
        }

        requester = await getTestAgent();

        await UserModel.deleteMany({}).exec();
        await UserTempSchema.deleteMany({}).exec();
    });

    it('Creating an user while not logged in should return 401 Unauthorized', async () => {
        const response: request.Response = await requester
            .post(`/auth/user`)
            .set('Content-Type', 'application/json');

        response.status.should.equal(401);
        response.body.should.have.property('errors').and.be.an('array');
        response.body.errors[0].status.should.equal(401);
        response.body.errors[0].detail.should.equal('Not authenticated');
    });

    it('Creating an user while logged in as a USER should return 403 Forbidden', async () => {
        const { token } = await createUserAndToken({ role: 'USER' });
        const response: request.Response = await requester
            .post(`/auth/user`)
            .set('Content-Type', 'application/json')
            .set('Authorization', `Bearer ${token}`);

        response.status.should.equal(403);
        response.body.should.have.property('errors').and.be.an('array');
        response.body.errors[0].status.should.equal(403);
        response.body.errors[0].detail.should.equal('Not authorized');
    });

    it('Creating an ADMIN user while logged in as a MANAGER should return 403 Forbidden', async () => {
        const { token } = await createUserAndToken({ role: 'MANAGER' });
        const response: request.Response = await requester
            .post(`/auth/user`)
            .set('Content-Type', 'application/json')
            .set('Authorization', `Bearer ${token}`)
            .send({ role: 'ADMIN' });

        response.status.should.equal(403);
        response.body.should.have.property('errors').and.be.an('array');
        response.body.errors[0].status.should.equal(403);
        response.body.errors[0].detail.should.equal('Forbidden');
    });

    it('Creating an user while logged in as a MANAGER not providing apps should return 400 Bad Request', async () => {
        const { token } = await createUserAndToken({ role: 'MANAGER' });
        const response: request.Response = await requester
            .post(`/auth/user`)
            .set('Content-Type', 'application/json')
            .set('Authorization', `Bearer ${token}`)
            .send({ role: 'USER' });

        response.status.should.equal(400);
        response.body.should.have.property('errors').and.be.an('array');
        response.body.errors[0].status.should.equal(400);
        response.body.errors[0].detail.should.equal('Apps required');
    });

    it('Creating an user with an email that already exists in the DB should return 400 Bad Request', async () => {
        const { token, user } = await createUserAndToken({ role: 'MANAGER' });
        const response: request.Response = await requester
            .post(`/auth/user`)
            .set('Content-Type', 'application/json')
            .set('Authorization', `Bearer ${token}`)
            .send({
                role: 'USER',
                extraUserData: { apps: user.extraUserData.apps },
                email: user.email
            });

        response.status.should.equal(400);
        response.body.should.have.property('errors').and.be.an('array');
        response.body.errors[0].status.should.equal(400);
        response.body.errors[0].detail.should.equal('Email exists');
    });

    it('Creating an user with apps that the current user does not manage should return 403 Forbidden', async () => {
        const { token } = await createUserAndToken({ role: 'MANAGER' });
        const response: request.Response = await requester
            .post(`/auth/user`)
            .set('Content-Type', 'application/json')
            .set('Authorization', `Bearer ${token}`)
            .send({
                role: 'USER',
                extraUserData: { apps: ['gfw', 'fake-app-2'] },
                email: 'new.email2@example.com'
            });

        response.status.should.equal(403);
        response.body.should.have.property('errors').and.be.an('array');
        response.body.errors[0].status.should.equal(403);
        response.body.errors[0].detail.should.equal('Forbidden');
    });

    it('Creating an user with valid data should return 200 OK and the created user data', async () => {
        // Mock email sent after creation of user
        nock('https://api.sparkpost.com')
            .post('/api/v1/transmissions')
            .reply(200);

        const { token, user } = await createUserAndToken({ role: 'MANAGER' });
        const response: request.Response = await requester
            .post(`/auth/user`)
            .set('Content-Type', 'application/json')
            .set('Authorization', `Bearer ${token}`)
            .send({
                role: 'USER',
                extraUserData: { apps: user.extraUserData.apps },
                email: 'new.email3@example.com'
            });

        response.status.should.equal(200);
        response.body.should.be.an('object');

        const createdUser: IUserTemp = await UserTempSchema.findOne({ email: 'new.email3@example.com' });
        createdUser.should.be.an('object');
        createdUser.email.should.equal('new.email3@example.com');
    });

    after(closeTestAgent);

    afterEach(async () => {
        await UserModel.deleteMany({}).exec();
        await UserTempSchema.deleteMany({}).exec();

        if (!nock.isDone()) {
            throw new Error(`Not all nock interceptors were used: ${nock.pendingMocks()}`);
        }
    });
});
