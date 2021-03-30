import nock from 'nock';
import chai from 'chai';
import type request from 'superagent';

import { OktaUser } from 'services/okta.interfaces';
import { closeTestAgent, getTestAgent } from '../utils/test-server';
import { TOKENS } from '../utils/test.constants';
import { getMockOktaUser, mockOktaListUsers, mockValidJWT } from './okta.mocks';

chai.should();

let requester: ChaiHttp.Agent;

nock.disableNetConnect();
nock.enableNetConnect(process.env.HOST_IP);

describe('[OKTA] GET users ids by role', () => {

    before(async () => {
        if (process.env.NODE_ENV !== 'test') {
            throw Error(`Running the test suite with NODE_ENV ${process.env.NODE_ENV} may result in permanent data loss. Please use NODE_ENV=test.`);
        }

        requester = await getTestAgent();
    });

    it('Get users ids by role without being logged in returns a 401', async () => {
        const response: request.Response = await requester.get(`/auth/user/ids/USER`);
        response.status.should.equal(401);
    });

    it('Get users ids by role while being logged in as a USER returns a 400 error', async () => {
        const token: string = mockValidJWT();

        const response: request.Response = await requester
            .get(`/auth/user/ids/USER`)
            .set('Authorization', `Bearer ${token}`);

        response.status.should.equal(403);
        response.body.should.have.property('errors').and.be.an('array');
        response.body.errors[0].should.have.property('detail').and.equal(`Not authorized`);
    });

    it('Get users ids by role while being logged in as a MANAGER returns a 400 error', async () => {
        const token: string = mockValidJWT({ role: 'MANAGER' });

        const response: request.Response = await requester
            .get(`/auth/user/ids/USER`)
            .set('Authorization', `Bearer ${token}`);

        response.status.should.equal(403);
        response.body.should.have.property('errors').and.be.an('array');
        response.body.errors[0].should.have.property('detail').and.equal(`Not authorized`);
    });

    it('Get users ids by role while being logged in as an ADMIN returns a 400 error', async () => {
        const token: string = mockValidJWT({ role: 'ADMIN' });

        const response: request.Response = await requester
            .get(`/auth/user/ids/USER`)
            .set('Authorization', `Bearer ${token}`);

        response.status.should.equal(403);
        response.body.should.have.property('errors').and.be.an('array');
        response.body.errors[0].should.have.property('detail').and.equal(`Not authorized`);
    });

    it('Get users ids by role with an invalid role returns a 422', async () => {
        const response: request.Response = await requester
            .get(`/auth/user/ids/FOO`)
            .set('Authorization', `Bearer ${TOKENS.MICROSERVICE}`);

        response.status.should.equal(422);
        response.body.should.have.property('errors').and.be.an('array');
        response.body.errors[0].should.have.property('detail').and.equal(`Invalid role FOO provided`);
    });

    it('Get users ids by role with a valid role and no users on the database returns a 200 response and an empty array', async () => {
        mockOktaListUsers({ limit: 200, search: `(profile.role eq "USER")` }, []);

        const response: request.Response = await requester
            .get(`/auth/user/ids/USER`)
            .set('Authorization', `Bearer ${TOKENS.MICROSERVICE}`);

        response.status.should.equal(200);
        response.body.should.have.property('data').and.eql([]);
    });

    it('Get users ids by role with a valid role returns a 200 response with the users ids (happy case, single user)', async () => {
        const user: OktaUser = getMockOktaUser({ role: 'USER' });
        mockOktaListUsers({ limit: 200, search: `(profile.role eq "USER")` }, [user]);

        const response: request.Response = await requester
            .get(`/auth/user/ids/USER`)
            .set('Authorization', `Bearer ${TOKENS.MICROSERVICE}`);

        response.status.should.equal(200);
        response.body.should.have.property('data').and.be.an('array').and.length(1);
        response.body.should.have.property('data').and.eql([user.profile.legacyId]);
    });

    it('Get users ids by role with a valid role returns a 200 response with the users ids (happy case, multiple users)', async () => {
        const userOne: OktaUser = getMockOktaUser({ role: 'USER' });
        const userTwo: OktaUser = getMockOktaUser({ role: 'USER' });
        mockOktaListUsers({ limit: 200, search: `(profile.role eq "USER")` }, [userOne, userTwo]);

        const response: request.Response = await requester
            .get(`/auth/user/ids/USER`)
            .set('Authorization', `Bearer ${TOKENS.MICROSERVICE}`);

        response.status.should.equal(200);
        response.body.should.have.property('data').and.be.an('array').and.length(2);
        response.body.should.have.property('data').and.eql([userOne.profile.legacyId, userTwo.profile.legacyId]);
    });

    after(async () => {
        await closeTestAgent();
    });

    afterEach(() => {
        if (!nock.isDone()) {
            throw new Error(`Not all nock interceptors were used: ${nock.pendingMocks()}`);
        }
    });
});
