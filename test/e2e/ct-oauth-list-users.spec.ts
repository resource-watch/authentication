import chai from 'chai';
import nock from 'nock';
import type request from 'superagent';

import UserModel, { IUser, IUserModel } from 'models/user.model';
import { closeTestAgent, getTestAgent } from './utils/test-server';
import { createUserAndToken, ensureHasPaginationElements } from './utils/helpers';
import { getMockOktaUser, mockOktaListUsers } from "./utils/okta.mocks";

chai.should();

let requester: ChaiHttp.Agent;

nock.disableNetConnect();
nock.enableNetConnect(process.env.HOST_IP);

describe('List users', () => {

    before(async () => {
        if (process.env.NODE_ENV !== 'test') {
            throw Error(`Running the test suite with NODE_ENV ${process.env.NODE_ENV} may result in permanent data loss. Please use NODE_ENV=test.`);
        }

        requester = await getTestAgent();

        await UserModel.deleteMany({}).exec();
    });

    it('Visiting /auth/user while not logged in should return a 401 error', async () => {
        const response: request.Response = await requester
            .get(`/auth/user`)
            .set('Content-Type', 'application/json');

        response.status.should.equal(401);
        response.should.be.json;
        response.body.should.have.property('errors').and.be.an('array');
        response.body.errors[0].should.have.property('detail').and.equal(`Not authenticated`);
    });

    it('Visiting /auth/user while logged in as USER should return a 403 error', async () => {
        const { token } = await createUserAndToken(null);

        const response: request.Response = await requester
            .get(`/auth/user`)
            .set('Content-Type', 'application/json')
            .set('Authorization', `Bearer ${token}`);

        response.status.should.equal(403);
        response.should.be.json;
        response.body.should.have.property('errors').and.be.an('array');
        response.body.errors[0].should.have.property('detail').and.equal(`Not authorized`);
    });

    it('Visiting /auth/user while logged in as MANAGER should return a 403 error', async () => {
        const { token } = await createUserAndToken({ role: 'MANAGER' });

        const response: request.Response = await requester
            .get(`/auth/user`)
            .set('Content-Type', 'application/json')
            .set('Authorization', `Bearer ${token}`);

        response.status.should.equal(403);
        response.body.errors[0].should.have.property('detail').and.equal(`Not authorized`);
    });

    it('Visiting /auth/user while logged in as ADMIN should return the list of users - just current user', async () => {
        const user = getMockOktaUser({});
        mockOktaListUsers({ limit: 10, search: 'profile.apps pr "rw"' }, [user]);

        const { token } = await createUserAndToken({ role: 'ADMIN' });
        const response: request.Response = await requester
            .get(`/auth/user`)
            .set('Content-Type', 'application/json')
            .set('Authorization', `Bearer ${token}`);

        response.status.should.equal(200);
        response.body.should.have.property('data').and.be.an('array').and.have.length(1);
        response.body.data[0].should.have.property('id').and.equal(user.profile.legacyId);
        response.body.data[0].should.have.property('email').and.equal(user.profile.email);
        response.body.data[0].should.have.property('role').and.equal(user.profile.role);
        ensureHasPaginationElements(response);
    });

    it('Visiting /auth/user while logged in as ADMIN should return the list of users - just current user if no other matches the current user\'s apps', async () => {
        const user = getMockOktaUser({});
        mockOktaListUsers({ limit: 10, search: 'profile.apps pr "rw"' }, [user]);

        const { token } = await createUserAndToken({ role: 'ADMIN' });
        const response: request.Response = await requester
            .get(`/auth/user`)
            .set('Content-Type', 'application/json')
            .set('Authorization', `Bearer ${token}`);

        response.status.should.equal(200);
        response.body.should.have.property('data').and.be.an('array').and.have.length(1);
        response.body.data[0].should.have.property('id').and.equal(user.profile.legacyId);
        response.body.data[0].should.have.property('email').and.equal(user.profile.email);
        response.body.data[0].should.have.property('role').and.equal(user.profile.role);
        ensureHasPaginationElements(response);
    });

    it('Visiting /auth/user while logged in as ADMIN should return the list of users - only return users that match current user\'s app', async () => {
        const users = [
            getMockOktaUser({ email: 'rw-user-one@example.com', apps: ['rw'] }),
            getMockOktaUser({ email: 'rw-user-two@example.com', apps: ['rw'] }),
            getMockOktaUser({}),
        ];
        mockOktaListUsers({ limit: 10, search: 'profile.apps pr "rw"' }, users);

        const { token } = await createUserAndToken({ role: 'ADMIN' });
        const response: request.Response = await requester
            .get(`/auth/user`)
            .set('Content-Type', 'application/json')
            .set('Authorization', `Bearer ${token}`);

        response.status.should.equal(200);
        response.body.should.have.property('data').and.be.an('array').and.have.length(3);
        response.body.data.map((e: IUser) => e.email).should
            .include(users[0].profile.email).and.to
            .include(users[1].profile.email).and.to
            .include(users[2].profile.email);
        ensureHasPaginationElements(response);
    });

    it('Visiting /auth/user while logged in as ADMIN should return the list of users - filter by email address is supported', async () => {
        const user = getMockOktaUser({});
        mockOktaListUsers({ limit: 10, search: `profile.apps pr "rw" and email sw "${user.profile.email}"` }, [user]);

        const { token } = await createUserAndToken({ role: 'ADMIN' });
        const response: request.Response = await requester
            .get(`/auth/user?email=${user.profile.email}`)
            .set('Content-Type', 'application/json')
            .set('Authorization', `Bearer ${token}`);

        response.status.should.equal(200);
        response.body.should.have.property('data').and.be.an('array').and.have.length(1);
        response.body.data.map((e: IUser) => e.email).should.include(user.profile.email);
        ensureHasPaginationElements(response);
    });

    it('Visiting /auth/user while logged in as ADMIN should return the list of users - filter by email address with plus sign in it is supported as long as it\'s escaped', async () => {
        const user = getMockOktaUser({ email: 'text+email@vizzuality.com' });
        mockOktaListUsers({ limit: 10, search: `profile.apps pr "rw" and email sw "${user.profile.email}"` }, [user]);

        const { token } = await createUserAndToken({ role: 'ADMIN', email: 'text+email@vizzuality.com' });
        const response: request.Response = await requester
            .get(`/auth/user`)
            .query({ email: 'text\\\+email@vizzuality.com' })
            .set('Content-Type', 'application/json')
            .set('Authorization', `Bearer ${token}`);

        response.status.should.equal(200);
        response.body.should.have.property('data').and.be.an('array').and.have.length(1);
        response.body.data.map((e: IUserModel) => e.email).should.include(user.profile.email);

        ensureHasPaginationElements(response);
    });

    it('Visiting /auth/user while logged in as ADMIN should return the list of users - filter by provider is supported', async () => {
        const localUser = getMockOktaUser({ provider: 'local' });
        const googleUser = getMockOktaUser({ provider: 'google' });
        mockOktaListUsers(
            { limit: 10, search: `profile.apps pr "rw" and provider eq "${localUser.profile.provider}"` },
            [localUser],
        );

        const { token } = await createUserAndToken({ role: 'ADMIN' });
        const responseOne: request.Response = await requester
            .get(`/auth/user?provider=local`)
            .set('Content-Type', 'application/json')
            .set('Authorization', `Bearer ${token}`);

        responseOne.status.should.equal(200);
        responseOne.body.should.have.property('data').and.be.an('array').and.have.length(1);
        responseOne.body.data.map((e: IUser) => e.email).should.include(localUser.profile.email);
        ensureHasPaginationElements(responseOne);

        mockOktaListUsers(
            { limit: 10, search: `profile.apps pr "rw" and provider eq "${googleUser.profile.provider}"` },
            [googleUser],
        );

        const responseTwo: request.Response = await requester
            .get(`/auth/user?provider=google`)
            .set('Content-Type', 'application/json')
            .set('Authorization', `Bearer ${token}`);

        responseTwo.status.should.equal(200);
        responseTwo.body.should.have.property('data').and.be.an('array').and.have.length(1);
        responseTwo.body.data.map((e: IUser) => e.email).should.include(googleUser.profile.email);
        ensureHasPaginationElements(responseTwo);
    });

    it('Visiting /auth/user while logged in as ADMIN should return the list of users - filter by name is supported', async () => {
        const userOne = getMockOktaUser({});
        const userTwo = getMockOktaUser({});

        mockOktaListUsers(
            { limit: 10, search: `profile.apps pr "rw" and profile.displayName sw "${userOne.profile.displayName}"` },
            [userOne],
        );

        const { token } = await createUserAndToken({ role: 'ADMIN' });
        const responseOne: request.Response = await requester
            .get(`/auth/user?name=${userOne.profile.displayName}`)
            .set('Content-Type', 'application/json')
            .set('Authorization', `Bearer ${token}`);

        responseOne.status.should.equal(200);
        responseOne.body.should.have.property('data').and.be.an('array').and.have.length(1);
        responseOne.body.data.map((e: IUser) => e.email).should.include(userOne.profile.email);
        ensureHasPaginationElements(responseOne);

        mockOktaListUsers(
            { limit: 10, search: `profile.apps pr "rw" and profile.displayName sw "${userTwo.profile.displayName}"` },
            [userTwo],
        );

        const responseTwo: request.Response = await requester
            .get(`/auth/user?name=${userTwo.profile.displayName}`)
            .set('Content-Type', 'application/json')
            .set('Authorization', `Bearer ${token}`);

        responseTwo.status.should.equal(200);
        responseTwo.body.should.have.property('data').and.be.an('array').and.have.length(1);
        responseTwo.body.data.map((e: IUser) => e.email).should.include(userTwo.profile.email);
        ensureHasPaginationElements(responseTwo);
    });

    it('Visiting /auth/user while logged in as ADMIN should return the list of users - filter by role is supported', async () => {
        const user = getMockOktaUser({ role: 'USER' });
        const manager = getMockOktaUser({ role: 'MANAGER' });
        const admin = getMockOktaUser({ role: 'ADMIN' });

        mockOktaListUsers(
            { limit: 10, search: `profile.apps pr "rw" and profile.role sw "${user.profile.role}"` },
            [user],
        );

        const { token } = await createUserAndToken({ role: 'ADMIN' });
        const responseOne: request.Response = await requester
            .get(`/auth/user?role=USER`)
            .set('Content-Type', 'application/json')
            .set('Authorization', `Bearer ${token}`);

        responseOne.status.should.equal(200);
        responseOne.body.should.have.property('data').and.be.an('array').and.have.length(1);
        responseOne.body.data.map((e: IUser) => e.email).should.include(user.profile.email);
        ensureHasPaginationElements(responseOne);

        mockOktaListUsers(
            { limit: 10, search: `profile.apps pr "rw" and profile.role sw "${manager.profile.role}"` },
            [manager],
        );

        const responseTwo: request.Response = await requester
            .get(`/auth/user?role=MANAGER`)
            .set('Content-Type', 'application/json')
            .set('Authorization', `Bearer ${token}`);

        responseTwo.status.should.equal(200);
        responseTwo.body.should.have.property('data').and.be.an('array').and.have.length(1);
        responseTwo.body.data.map((e: IUser) => e.email).should.include(manager.profile.email);
        ensureHasPaginationElements(responseTwo);

        mockOktaListUsers(
            { limit: 10, search: `profile.apps pr "rw" and profile.role sw "${admin.profile.role}"` },
            [manager],
        );

        const responseThree: request.Response = await requester
            .get(`/auth/user?role=ADMIN`)
            .set('Content-Type', 'application/json')
            .set('Authorization', `Bearer ${token}`);

        responseThree.status.should.equal(200);
        responseThree.body.should.have.property('data').and.be.an('array').and.have.length(1);
        responseThree.body.data.map((e: IUser) => e.email).should.include(admin.profile.email);
        ensureHasPaginationElements(responseThree);
    });

    it('Visiting /auth/user while logged in as ADMIN should return the list of users - filter by password not supported', async () => {
        const user = getMockOktaUser({});
        mockOktaListUsers({ limit: 10, search: `profile.apps pr "rw"` }, [user]);

        const { token } = await createUserAndToken({ role: 'ADMIN' });
        const response: request.Response = await requester
            .get(`/auth/user?password=%242b%2410%241wDgP5YCStyvZndwDu2GwuC6Ie9wj7yRZ3BNaaI.p9JqV8CnetdPK`)
            .set('Content-Type', 'application/json')
            .set('Authorization', `Bearer ${token}`);

        response.status.should.equal(200);
        response.body.should.have.property('data').and.be.an('array').and.have.length(1);
        response.body.data.map((e: IUser) => e.email).should.include(user.profile.email);
        ensureHasPaginationElements(response);
    });

    it('Visiting /auth/user while logged in as ADMIN and query app=all should return the list of users - even if apps of users are not match to current user\'s app', async () => {
        const userOne = getMockOktaUser({ apps: ['gfw'] });
        const userTwo = getMockOktaUser({ apps: ['rw'] });
        const userThree = getMockOktaUser({ apps: ['fake-app-2'] });
        mockOktaListUsers({ limit: 10 }, [userOne, userTwo, userThree]);

        const { token } = await createUserAndToken({});
        const response: request.Response = await requester
            .get(`/auth/user?app=all`)
            .set('Content-Type', 'application/json')
            .set('Authorization', `Bearer ${token}`)
            .send();

        response.status.should.equal(200);
        response.body.should.have.property('data').and.be.an('array').and.have.length(3);
        response.body.data.map((e: IUserModel) => e.email).should
            .include(userOne.profile.email).and.to
            .include(userTwo.profile.email).and.to
            .include(userThree.profile.email);
        ensureHasPaginationElements(response);
    });

    it('Visiting /auth/user while logged in as ADMIN and filtering by app should return the list of users with apps which provided in the query app', async () => {
        const userOne = getMockOktaUser({ apps: ['fake-app'] });
        const userTwo = getMockOktaUser({ apps: ['fake-app-2'] });
        mockOktaListUsers(
            { limit: 10, search: `profile.apps pr "rw" and (profile.apps pr "fake-app" or profile.apps pr "fake-app-2")` },
            [userOne, userTwo]
        );

        const { token } = await createUserAndToken({ role: 'ADMIN' });
        const response: request.Response = await requester
            .get(`/auth/user?app=fake-app,fake-app-2`)
            .set('Content-Type', 'application/json')
            .set('Authorization', `Bearer ${token}`)
            .send();

        response.status.should.equal(200);
        response.body.should.have.property('data').and.be.an('array').and.have.length(2);
        response.body.data.map((e: IUser) => e.extraUserData.apps[0]).should
            .include(userOne.profile.apps[0]).and.to
            .include(userTwo.profile.apps[0]);
        ensureHasPaginationElements(response);
    });

    it('Visiting /auth/user while logged in as ADMIN and an invalid query param should return the list of users ignoring the invalid query param', async () => {
        const userOne = getMockOktaUser({});
        const userTwo = getMockOktaUser({});
        mockOktaListUsers({ limit: 10 }, [userOne, userTwo]);

        const { token } = await createUserAndToken({ role: 'ADMIN' });
        const response: request.Response = await requester
            .get(`/auth/user?foo=bar`)
            .set('Content-Type', 'application/json')
            .set('Authorization', `Bearer ${token}`)
            .send();

        response.status.should.equal(200);
        response.body.should.have.property('data').and.be.an('array').and.have.length(2);
        ensureHasPaginationElements(response);
    });

    after(() => {
        closeTestAgent();
    });

    afterEach(async () => {
        await UserModel.deleteMany({}).exec();

        if (!nock.isDone()) {
            throw new Error(`Not all nock interceptors were used: ${nock.pendingMocks()}`);
        }
    });
});
