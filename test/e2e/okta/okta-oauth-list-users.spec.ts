import chai from 'chai';
import nock from 'nock';
import config from 'config';
import type request from 'superagent';
import { IUser, OktaUser } from 'services/okta.interfaces';
import { closeTestAgent, getTestAgent } from '../utils/test-server';
import { createApplication, createOrganization, ensureHasPaginationElements } from '../utils/helpers';
import { getMockOktaUser, mockOktaListUsers, mockValidJWT } from './okta.mocks';
import ApplicationModel, { IApplication } from "models/application";
import ApplicationUserModel from "models/application-user";
import OrganizationModel, { IOrganization } from "models/organization";
import OrganizationUserModel from "models/organization-user";
import OrganizationApplicationModel from "models/organization-application";
import { mockValidateRequestWithApiKey, mockValidateRequestWithApiKeyAndUserToken } from "../utils/mocks";

chai.should();

let requester: ChaiHttp.Agent;

nock.disableNetConnect();
nock.enableNetConnect(process.env.HOST_IP);

describe('[OKTA] List users', () => {

    before(async () => {
        if (process.env.NODE_ENV !== 'test') {
            throw Error(`Running the test suite with NODE_ENV ${process.env.NODE_ENV} may result in permanent data loss. Please use NODE_ENV=test.`);
        }

        requester = await getTestAgent();
    });

    describe('Test links objects', () => {
        it('Get users without referer header should be successful and use the request host', async () => {
            const user: OktaUser = getMockOktaUser({});
            mockOktaListUsers({ limit: 10, search: '((profile.apps eq "rw"))' }, [user]);

            const token: string = mockValidJWT({ role: 'ADMIN' });
            mockValidateRequestWithApiKeyAndUserToken({ token });

            const response: request.Response = await requester
                .get(`/auth/user`)
                .set('x-api-key', 'api-key-test')
                .set('Authorization', `Bearer ${token}`);

            response.status.should.equal(200);
            response.body.should.have.property('data').and.be.an('array');
            response.body.should.have.property('links').and.be.an('object');
            response.body.links.should.have.property('self').and.equal(`http://127.0.0.1:${config.get('server.port')}/auth/user?page[number]=1&page[size]=10`);
            response.body.links.should.have.property('prev').and.equal(`http://127.0.0.1:${config.get('server.port')}/auth/user?page[number]=1&page[size]=10`);
            response.body.links.should.have.property('next').and.equal(`http://127.0.0.1:${config.get('server.port')}/auth/user?page[number]=2&page[size]=10`);
            response.body.links.should.have.property('first').and.equal(`http://127.0.0.1:${config.get('server.port')}/auth/user?page[number]=1&page[size]=10`);
        });

        it('Get users with referer header should be successful and use that header on the links on the response', async () => {
            const user: OktaUser = getMockOktaUser({});
            mockOktaListUsers({ limit: 10, search: '((profile.apps eq "rw"))' }, [user]);

            const token: string = mockValidJWT({ role: 'ADMIN' });
            mockValidateRequestWithApiKeyAndUserToken({ token });

            const response: request.Response = await requester
                .get(`/auth/user`)
                .set('referer', `https://potato.com/get-me-all-the-data`)
                .set('x-api-key', 'api-key-test')
                .set('Authorization', `Bearer ${token}`);

            response.status.should.equal(200);
            response.body.should.have.property('data').and.be.an('array');
            response.body.should.have.property('links').and.be.an('object');
            response.body.links.should.have.property('self').and.equal('http://potato.com/auth/user?page[number]=1&page[size]=10');
            response.body.links.should.have.property('prev').and.equal('http://potato.com/auth/user?page[number]=1&page[size]=10');
            response.body.links.should.have.property('next').and.equal('http://potato.com/auth/user?page[number]=2&page[size]=10');
            response.body.links.should.have.property('first').and.equal('http://potato.com/auth/user?page[number]=1&page[size]=10');
        });
    });

    it('Visiting /auth/user while not logged in should return a 401 error', async () => {
        mockValidateRequestWithApiKey({});
        const response: request.Response = await requester
            .get(`/auth/user`)
            .set('x-api-key', 'api-key-test')
            .set('Content-Type', 'application/json');

        response.status.should.equal(401);
        response.should.be.json;
        response.body.should.have.property('errors').and.be.an('array');
        response.body.errors[0].should.have.property('detail').and.equal(`Not authenticated`);
    });

    it('Visiting /auth/user while logged in as USER should return a 403 error', async () => {
        const token: string = mockValidJWT();
        mockValidateRequestWithApiKeyAndUserToken({ token });

        const response: request.Response = await requester
            .get(`/auth/user`)
            .set('Content-Type', 'application/json')
            .set('x-api-key', 'api-key-test')
            .set('Authorization', `Bearer ${token}`);

        response.status.should.equal(403);
        response.should.be.json;
        response.body.should.have.property('errors').and.be.an('array');
        response.body.errors[0].should.have.property('detail').and.equal(`Not authorized`);
    });

    it('Visiting /auth/user while logged in as MANAGER should return a 403 error', async () => {
        const token: string = mockValidJWT({ role: 'MANAGER' });
        mockValidateRequestWithApiKeyAndUserToken({ token });

        const response: request.Response = await requester
            .get(`/auth/user`)
            .set('Content-Type', 'application/json')
            .set('x-api-key', 'api-key-test')
            .set('Authorization', `Bearer ${token}`);

        response.status.should.equal(403);
        response.body.errors[0].should.have.property('detail').and.equal(`Not authorized`);
    });

    it('Visiting /auth/user while logged in as ADMIN should return the list of users - just current user', async () => {
        const user: OktaUser = getMockOktaUser({});
        mockOktaListUsers({ limit: 10, search: '((profile.apps eq "rw"))' }, [user]);

        const token: string = mockValidJWT({ role: 'ADMIN' });
        mockValidateRequestWithApiKeyAndUserToken({ token });
        const response: request.Response = await requester
            .get(`/auth/user`)
            .set('Content-Type', 'application/json')
            .set('x-api-key', 'api-key-test')
            .set('Authorization', `Bearer ${token}`);

        response.status.should.equal(200);
        response.body.should.have.property('data').and.be.an('array').and.have.length(1);
        response.body.data[0].should.have.property('id').and.equal(user.profile.legacyId);
        response.body.data[0].should.have.property('email').and.equal(user.profile.email);
        response.body.data[0].should.have.property('role').and.equal(user.profile.role);
        ensureHasPaginationElements(response);
    });

    it('Visiting /auth/user while logged in as ADMIN should return the list of users - just current user if no other matches the current user\'s apps', async () => {
        const user: OktaUser = getMockOktaUser({});
        mockOktaListUsers({ limit: 10, search: '((profile.apps eq "rw"))' }, [user]);

        const token: string = mockValidJWT({ role: 'ADMIN' });
        mockValidateRequestWithApiKeyAndUserToken({ token });
        const response: request.Response = await requester
            .get(`/auth/user`)
            .set('Content-Type', 'application/json')
            .set('x-api-key', 'api-key-test')
            .set('Authorization', `Bearer ${token}`);

        response.status.should.equal(200);
        response.body.should.have.property('data').and.be.an('array').and.have.length(1);
        response.body.data[0].should.have.property('id').and.equal(user.profile.legacyId);
        response.body.data[0].should.have.property('email').and.equal(user.profile.email);
        response.body.data[0].should.have.property('role').and.equal(user.profile.role);
        ensureHasPaginationElements(response);
    });

    it('Visiting /auth/user while logged in as ADMIN should return the list of users - only return users that match current user\'s app', async () => {
        const users: OktaUser[] = [
            getMockOktaUser({ email: 'rw-user-one@example.com', apps: ['rw'] }),
            getMockOktaUser({ email: 'rw-user-two@example.com', apps: ['rw'] }),
            getMockOktaUser({}),
        ];
        mockOktaListUsers({ limit: 10, search: '((profile.apps eq "rw"))' }, users);

        const token: string = mockValidJWT({ role: 'ADMIN' });
        mockValidateRequestWithApiKeyAndUserToken({ token });
        const response: request.Response = await requester
            .get(`/auth/user`)
            .set('Content-Type', 'application/json')
            .set('x-api-key', 'api-key-test')
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
        const user: OktaUser = getMockOktaUser({});
        mockOktaListUsers({ limit: 10, search: `(profile.email sw "${user.profile.email}") and ((profile.apps eq "rw"))` }, [user]);

        const token: string = mockValidJWT({ role: 'ADMIN' });
        mockValidateRequestWithApiKeyAndUserToken({ token });
        const response: request.Response = await requester
            .get(`/auth/user?email=${user.profile.email}`)
            .set('Content-Type', 'application/json')
            .set('x-api-key', 'api-key-test')
            .set('Authorization', `Bearer ${token}`);

        response.status.should.equal(200);
        response.body.should.have.property('data').and.be.an('array').and.have.length(1);
        response.body.data.map((e: IUser) => e.email).should.include(user.profile.email);
        ensureHasPaginationElements(response);
    });

    it('Visiting /auth/user while logged in as ADMIN should return the list of users - filter by email address with plus sign in it is supported as long as it\'s escaped', async () => {
        const user: OktaUser = getMockOktaUser({ email: 'text+email@vizzuality.com' });
        mockOktaListUsers({ limit: 10, search: `(profile.email sw "${user.profile.email}") and ((profile.apps eq "rw"))` }, [user]);

        const token: string = mockValidJWT({ role: 'ADMIN', email: 'text+email@vizzuality.com' });
        mockValidateRequestWithApiKeyAndUserToken({ token });
        const response: request.Response = await requester
            .get(`/auth/user`)
            .query({ email: user.profile.email })
            .set('Content-Type', 'application/json')
            .set('x-api-key', 'api-key-test')
            .set('Authorization', `Bearer ${token}`);

        response.status.should.equal(200);
        response.body.should.have.property('data').and.be.an('array').and.have.length(1);
        response.body.data.map((e: IUser) => e.email).should.include(user.profile.email);

        ensureHasPaginationElements(response);
    });

    it('Visiting /auth/user while logged in as ADMIN should return the list of users - filter by provider is supported', async () => {
        const localUser: OktaUser = getMockOktaUser({ provider: 'local' });
        const googleUser: OktaUser = getMockOktaUser({ provider: 'google' });
        mockOktaListUsers(
            { limit: 10, search: `(profile.provider eq "${localUser.profile.provider}") and ((profile.apps eq "rw"))` },
            [localUser],
        );

        let token: string = mockValidJWT({ role: 'ADMIN' });
        mockValidateRequestWithApiKeyAndUserToken({ token });
        const responseOne: request.Response = await requester
            .get(`/auth/user?provider=local`)
            .set('Content-Type', 'application/json')
            .set('x-api-key', 'api-key-test')
            .set('Authorization', `Bearer ${token}`);

        responseOne.status.should.equal(200);
        responseOne.body.should.have.property('data').and.be.an('array').and.have.length(1);
        responseOne.body.data.map((e: IUser) => e.email).should.include(localUser.profile.email);
        ensureHasPaginationElements(responseOne);

        mockOktaListUsers(
            { limit: 10, search: `(profile.provider eq "${googleUser.profile.provider}") and ((profile.apps eq "rw"))` },
            [googleUser],
        );

        token = mockValidJWT({ role: 'ADMIN' });
        mockValidateRequestWithApiKeyAndUserToken({ token });
        const responseTwo: request.Response = await requester
            .get(`/auth/user?provider=google`)
            .set('Content-Type', 'application/json')
            .set('x-api-key', 'api-key-test')
            .set('Authorization', `Bearer ${token}`);

        responseTwo.status.should.equal(200);
        responseTwo.body.should.have.property('data').and.be.an('array').and.have.length(1);
        responseTwo.body.data.map((e: IUser) => e.email).should.include(googleUser.profile.email);
        ensureHasPaginationElements(responseTwo);
    });

    it('Visiting /auth/user while logged in as ADMIN should return the list of users - filter by name is supported', async () => {
        const userOne: OktaUser = getMockOktaUser({});
        const userTwo: OktaUser = getMockOktaUser({});

        mockOktaListUsers(
            { limit: 10, search: `(profile.displayName sw "${userOne.profile.displayName}") and ((profile.apps eq "rw"))` },
            [userOne],
        );

        let token: string = mockValidJWT({ role: 'ADMIN' });
        mockValidateRequestWithApiKeyAndUserToken({ token });
        const responseOne: request.Response = await requester
            .get(`/auth/user?name=${userOne.profile.displayName}`)
            .set('Content-Type', 'application/json')
            .set('x-api-key', 'api-key-test')
            .set('Authorization', `Bearer ${token}`);

        responseOne.status.should.equal(200);
        responseOne.body.should.have.property('data').and.be.an('array').and.have.length(1);
        responseOne.body.data.map((e: IUser) => e.email).should.include(userOne.profile.email);
        ensureHasPaginationElements(responseOne);

        mockOktaListUsers(
            { limit: 10, search: `(profile.displayName sw "${userTwo.profile.displayName}") and ((profile.apps eq "rw"))` },
            [userTwo],
        );

        token = mockValidJWT({ role: 'ADMIN' });
        mockValidateRequestWithApiKeyAndUserToken({ token });
        const responseTwo: request.Response = await requester
            .get(`/auth/user?name=${userTwo.profile.displayName}`)
            .set('Content-Type', 'application/json')
            .set('x-api-key', 'api-key-test')
            .set('Authorization', `Bearer ${token}`);

        responseTwo.status.should.equal(200);
        responseTwo.body.should.have.property('data').and.be.an('array').and.have.length(1);
        responseTwo.body.data.map((e: IUser) => e.email).should.include(userTwo.profile.email);
        ensureHasPaginationElements(responseTwo);
    });

    it('Visiting /auth/user while logged in as ADMIN should return the list of users - filter by role is supported', async () => {
        const user: OktaUser = getMockOktaUser({ role: 'USER' });
        const manager: OktaUser = getMockOktaUser({ role: 'MANAGER' });
        const admin: OktaUser = getMockOktaUser({ role: 'ADMIN' });

        mockOktaListUsers(
            { limit: 10, search: `(profile.role eq "${user.profile.role}") and ((profile.apps eq "rw"))` },
            [user],
        );

        let token: string = mockValidJWT({ role: 'ADMIN' });
        mockValidateRequestWithApiKeyAndUserToken({ token });
        const responseOne: request.Response = await requester
            .get(`/auth/user?role=USER`)
            .set('Content-Type', 'application/json')
            .set('x-api-key', 'api-key-test')
            .set('Authorization', `Bearer ${token}`);

        responseOne.status.should.equal(200);
        responseOne.body.should.have.property('data').and.be.an('array').and.have.length(1);
        responseOne.body.data.map((e: IUser) => e.email).should.include(user.profile.email);
        ensureHasPaginationElements(responseOne);

        mockOktaListUsers(
            { limit: 10, search: `(profile.role eq "${manager.profile.role}") and ((profile.apps eq "rw"))` },
            [manager],
        );

        token = mockValidJWT({ role: 'ADMIN' });
        mockValidateRequestWithApiKeyAndUserToken({ token });
        const responseTwo: request.Response = await requester
            .get(`/auth/user?role=MANAGER`)
            .set('Content-Type', 'application/json')
            .set('x-api-key', 'api-key-test')
            .set('Authorization', `Bearer ${token}`);

        responseTwo.status.should.equal(200);
        responseTwo.body.should.have.property('data').and.be.an('array').and.have.length(1);
        responseTwo.body.data.map((e: IUser) => e.email).should.include(manager.profile.email);
        ensureHasPaginationElements(responseTwo);

        mockOktaListUsers(
            { limit: 10, search: `(profile.role eq "${admin.profile.role}") and ((profile.apps eq "rw"))` },
            [admin],
        );

        token = mockValidJWT({ role: 'ADMIN' });
        mockValidateRequestWithApiKeyAndUserToken({ token });
        const responseThree: request.Response = await requester
            .get(`/auth/user?role=ADMIN`)
            .set('Content-Type', 'application/json')
            .set('x-api-key', 'api-key-test')
            .set('Authorization', `Bearer ${token}`);

        responseThree.status.should.equal(200);
        responseThree.body.should.have.property('data').and.be.an('array').and.have.length(1);
        responseThree.body.data.map((e: IUser) => e.email).should.include(admin.profile.email);
        ensureHasPaginationElements(responseThree);
    });

    it('Visiting /auth/user while logged in as ADMIN should return the list of users - filter by password not supported', async () => {
        const user: OktaUser = getMockOktaUser({});
        mockOktaListUsers({ limit: 10, search: `((profile.apps eq "rw"))` }, [user]);

        const token: string = mockValidJWT({ role: 'ADMIN' });
        mockValidateRequestWithApiKeyAndUserToken({ token });
        const response: request.Response = await requester
            .get(`/auth/user?password=%242b%2410%241wDgP5YCStyvZndwDu2GwuC6Ie9wj7yRZ3BNaaI.p9JqV8CnetdPK`)
            .set('Content-Type', 'application/json')
            .set('x-api-key', 'api-key-test')
            .set('Authorization', `Bearer ${token}`);

        response.status.should.equal(200);
        response.body.should.have.property('data').and.be.an('array').and.have.length(1);
        response.body.data.map((e: IUser) => e.email).should.include(user.profile.email);
        ensureHasPaginationElements(response);
    });

    it('Visiting /auth/user while logged in as ADMIN and query app=all should return the list of users - even if apps of users are not match to current user\'s app', async () => {
        const userOne: OktaUser = getMockOktaUser({ apps: ['gfw'] });
        const userTwo: OktaUser = getMockOktaUser({ apps: ['rw'] });
        const userThree: OktaUser = getMockOktaUser({ apps: ['fake-app-2'] });
        mockOktaListUsers({ limit: 10 }, [userOne, userTwo, userThree]);

        const token: string = mockValidJWT({ role: 'ADMIN' });
        mockValidateRequestWithApiKeyAndUserToken({ token });
        const response: request.Response = await requester
            .get(`/auth/user?app=all`)
            .set('Content-Type', 'application/json')
            .set('x-api-key', 'api-key-test')
            .set('Authorization', `Bearer ${token}`)
            .send();

        response.status.should.equal(200);
        response.body.should.have.property('data').and.be.an('array').and.have.length(3);
        response.body.data.map((e: IUser) => e.email).should
            .include(userOne.profile.email).and.to
            .include(userTwo.profile.email).and.to
            .include(userThree.profile.email);
        ensureHasPaginationElements(response);
    });

    it('Visiting /auth/user while logged in as ADMIN and filtering by app should return the list of users with apps which provided in the query app', async () => {
        const userOne: OktaUser = getMockOktaUser({ apps: ['fake-app'] });
        const userTwo: OktaUser = getMockOktaUser({ apps: ['fake-app-2'] });
        mockOktaListUsers(
            { limit: 10, search: `((profile.apps eq "fake-app") or (profile.apps eq "fake-app-2"))` },
            [userOne, userTwo]
        );

        const token: string = mockValidJWT({ role: 'ADMIN' });
        mockValidateRequestWithApiKeyAndUserToken({ token });
        const response: request.Response = await requester
            .get(`/auth/user?app=fake-app,fake-app-2`)
            .set('Content-Type', 'application/json')
            .set('x-api-key', 'api-key-test')
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
        const userOne: OktaUser = getMockOktaUser({});
        const userTwo: OktaUser = getMockOktaUser({});
        mockOktaListUsers({ limit: 10, search: `((profile.apps eq "rw"))` }, [userOne, userTwo]);

        const token: string = mockValidJWT({ role: 'ADMIN' });
        mockValidateRequestWithApiKeyAndUserToken({ token });
        const response: request.Response = await requester
            .get(`/auth/user?foo=bar`)
            .set('Content-Type', 'application/json')
            .set('x-api-key', 'api-key-test')
            .set('Authorization', `Bearer ${token}`)
            .send();

        response.status.should.equal(200);
        response.body.should.have.property('data').and.be.an('array').and.have.length(2);
        ensureHasPaginationElements(response);
    });

    describe('with associated applications', () => {
        it('Getting an user with associated applications should be successful and get the association', async () => {
            const user: OktaUser = getMockOktaUser();
            const token: string = mockValidJWT({ role: 'ADMIN' });
            mockValidateRequestWithApiKeyAndUserToken({ token });

            const testApplication: IApplication = await createApplication();

            await new ApplicationUserModel({
                userId: user.profile.legacyId,
                application: testApplication
            }).save();

            mockOktaListUsers({ limit: 10, search: `((profile.apps eq "rw"))` }, [user]);

            const response: request.Response = await requester
                .get(`/auth/user`)
                .set('Content-Type', 'application/json')
                .set('x-api-key', 'api-key-test')
                .set('Authorization', `Bearer ${token}`);

            response.status.should.equal(200);
            response.body.data[0].should.have.property('name').and.equal(user.profile.displayName);
            response.body.data[0].should.have.property('photo').and.equal(user.profile.photo);
            response.body.data[0].should.have.property('extraUserData').and.be.an('object').and.deep.eql({ apps: user.profile.apps });
            response.body.data[0].should.have.property('role').and.equal(user.profile.role);
            response.body.data[0].should.have.property('id').and.equal(user.profile.legacyId);
            response.body.data[0].should.have.property('email').and.equal(user.profile.email);
            response.body.data[0].should.have.property('applications').and.eql([{
                id: testApplication.id,
                name: testApplication.name,
            }]);
            response.body.data[0].should.have.property('createdAt');
            response.body.data[0].should.have.property('updatedAt');
        });
    })

    describe('with associated organizations', () => {
        it('Getting an user with associated organizations should be successful and get the association', async () => {
            const user: OktaUser = getMockOktaUser();
            const token: string = mockValidJWT({ role: 'ADMIN' });
            mockValidateRequestWithApiKeyAndUserToken({ token });

            const testOrganization: IOrganization = await createOrganization();

            await new OrganizationUserModel({
                userId: user.profile.legacyId,
                organization: testOrganization,
                role: 'ORG_ADMIN'
            }).save();

            mockOktaListUsers({ limit: 10, search: `((profile.apps eq "rw"))` }, [user]);

            const response: request.Response = await requester
                .get(`/auth/user`)
                .set('Content-Type', 'application/json')
                .set('x-api-key', 'api-key-test')
                .set('Authorization', `Bearer ${token}`);

            response.status.should.equal(200);
            response.body.data[0].should.have.property('name').and.equal(user.profile.displayName);
            response.body.data[0].should.have.property('photo').and.equal(user.profile.photo);
            response.body.data[0].should.have.property('extraUserData').and.be.an('object').and.deep.eql({ apps: user.profile.apps });
            response.body.data[0].should.have.property('role').and.equal(user.profile.role);
            response.body.data[0].should.have.property('id').and.equal(user.profile.legacyId);
            response.body.data[0].should.have.property('email').and.equal(user.profile.email);
            response.body.data[0].should.have.property('organizations').and.eql([{
                id: testOrganization.id,
                name: testOrganization.name,
                role: 'ORG_ADMIN'
            }]);
            response.body.data[0].should.have.property('createdAt');
            response.body.data[0].should.have.property('updatedAt');
        });
    })

    after(async () => {
        await closeTestAgent();
    });

    afterEach(async () => {
        await ApplicationModel.deleteMany({}).exec();
        await OrganizationModel.deleteMany({}).exec();
        await OrganizationApplicationModel.deleteMany({}).exec();
        await OrganizationUserModel.deleteMany({}).exec();
        await ApplicationUserModel.deleteMany({}).exec();

        if (!nock.isDone()) {
            throw new Error(`Not all nock interceptors were used: ${nock.pendingMocks()}`);
        }
    });
});
