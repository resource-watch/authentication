import nock from 'nock';
import chai from 'chai';
import chaiDateTime from 'chai-datetime';
import type request from 'superagent';
import sinon, {SinonSandbox} from 'sinon';

import {OktaOAuthProvider, OktaUser} from 'services/okta.interfaces';
import {closeTestAgent, getTestAgent} from '../utils/test-server';
import {stubConfigValue} from '../utils/helpers';
import {
    getMockOktaUser,
    mockOktaCreateUser,
    mockOktaFailedSignUp,
    mockOktaSendActivationEmail,
    mockValidJWT
} from './okta.mocks';

chai.should();
chai.use(chaiDateTime);

let requester: ChaiHttp.Agent;
let sandbox: SinonSandbox;

nock.disableNetConnect();
nock.enableNetConnect(process.env.HOST_IP);

describe('[OKTA] User management endpoints tests - Create user', () => {

    before(async () => {
        if (process.env.NODE_ENV !== 'test') {
            throw Error(`Running the test suite with NODE_ENV ${process.env.NODE_ENV} may result in permanent data loss. Please use NODE_ENV=test.`);
        }

        sandbox = sinon.createSandbox();
        stubConfigValue(sandbox, { 'authProvider': 'OKTA' });

        requester = await getTestAgent();
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
        const token: string = mockValidJWT({ role: 'USER' });
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
        const token: string = mockValidJWT({ role: 'MANAGER' });
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
        const token: string = mockValidJWT({ role: 'MANAGER' });
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
        const email: string = 'test@example.com';
        const token: string = mockValidJWT({
            role: 'MANAGER',
            extraUserData: { apps: ['rw'] },
            email
        });
        mockOktaFailedSignUp('login: An object with this field already exists in the current organization');

        const response: request.Response = await requester
            .post(`/auth/user`)
            .set('Content-Type', 'application/json')
            .set('Authorization', `Bearer ${token}`)
            .send({
                role: 'USER',
                extraUserData: { apps: ['rw'] },
                email,
            });

        response.status.should.equal(400);
        response.body.should.have.property('errors').and.be.an('array');
        response.body.errors[0].status.should.equal(400);
        response.body.errors[0].detail.should.equal('Email exists');
    });

    it('Creating an user with apps that the current user does not manage should return 403 Forbidden', async () => {
        const token: string = mockValidJWT({ role: 'MANAGER' });
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

    it('Creating an user with valid data ("name") should return 200 OK and the created user data', async () => {
        const apps: string[] = ['rw'];
        const token: string = mockValidJWT({ role: 'MANAGER', extraUserData: { apps } });
        const user: OktaUser = getMockOktaUser({ apps });

        mockOktaCreateUser(user, {
            email: user.profile.email,
            name: 'Test User',
            role: user.profile.role,
            photo: user.profile.photo,
            apps,
            provider: OktaOAuthProvider.LOCAL,
        });
        mockOktaSendActivationEmail(user);

        const response: request.Response = await requester
            .post(`/auth/user`)
            .set('Content-Type', 'application/json')
            .set('Authorization', `Bearer ${token}`)
            .send({
                role: user.profile.role,
                extraUserData: { apps },
                email: user.profile.email,
                photo: user.profile.photo,
                name: 'Test User',
            });

        response.status.should.equal(200);
        response.body.should.be.an('object');
        response.body.should.have.property('id').and.eql(user.profile.legacyId);
        response.body.should.have.property('email').and.eql(user.profile.email);
        response.body.should.have.property('name').and.eql(user.profile.displayName);
        response.body.should.have.property('role').and.eql(user.profile.role);
        response.body.should.have.property('extraUserData').and.eql({ apps });
        response.body.should.have.property('photo').and.eql(user.profile.photo);
    });

    after(async () => {
        sandbox.restore();
        await closeTestAgent();
    });

    afterEach(async () => {
        if (!nock.isDone()) {
            throw new Error(`Not all nock interceptors were used: ${nock.pendingMocks()}`);
        }
    });
});
