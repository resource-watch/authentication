import nock from 'nock';
import chai from 'chai';
import chaiDateTime from 'chai-datetime';
import type request from 'superagent';

import { OktaOAuthProvider, OktaUser } from 'services/okta.interfaces';
import { closeTestAgent, getTestAgent } from '../utils/test-server';
import {
    getMockOktaUser, mockGetUserById,
    mockOktaCreateUser,
    mockOktaFailedSignUp,
    mockOktaSendActivationEmail, mockOktaUpdateUser,
    mockValidJWT
} from './okta.mocks';
import OrganizationModel, { IOrganization } from "models/organization";
import { assertConnection, assertNoConnection, createApplication, createOrganization } from "../utils/helpers";
import ApplicationModel, { IApplication } from "models/application";
import OrganizationApplicationModel from "models/organization-application";
import { HydratedDocument } from "mongoose";
import ApplicationUserModel from "models/application-user";
import OrganizationUserModel, { ORGANIZATION_ROLES } from "models/organization-user";
import { describe } from "mocha";
import application from "models/application";
import { mockValidateRequestWithApiKey, mockValidateRequestWithApiKeyAndUserToken } from "../utils/mocks";

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
    });

    it('Creating an user while not logged in should return 401 Unauthorized', async () => {
        mockValidateRequestWithApiKey({});

        const response: request.Response = await requester
            .post(`/auth/user`)
            .set('x-api-key', 'api-key-test')
            .set('Content-Type', 'application/json');

        response.status.should.equal(401);
        response.body.should.have.property('errors').and.be.an('array');
        response.body.errors[0].status.should.equal(401);
        response.body.errors[0].detail.should.equal('Not authenticated');
    });

    it('Creating an user while logged in as a USER should return 403 Forbidden', async () => {
        const token: string = mockValidJWT({ role: 'USER' });
        mockValidateRequestWithApiKeyAndUserToken({ token });

        const response: request.Response = await requester
            .post(`/auth/user`)
            .set('Content-Type', 'application/json')
            .set('x-api-key', 'api-key-test')
            .set('Authorization', `Bearer ${token}`);

        response.status.should.equal(403);
        response.body.should.have.property('errors').and.be.an('array');
        response.body.errors[0].status.should.equal(403);
        response.body.errors[0].detail.should.equal('Not authorized');
    });

    it('Creating an ADMIN user while logged in as a MANAGER should return 403 Forbidden', async () => {
        const token: string = mockValidJWT({ role: 'MANAGER' });
        mockValidateRequestWithApiKeyAndUserToken({ token });

        const response: request.Response = await requester
            .post(`/auth/user`)
            .set('Content-Type', 'application/json')
            .set('x-api-key', 'api-key-test')
            .set('Authorization', `Bearer ${token}`)
            .send({ role: 'ADMIN' });

        response.status.should.equal(403);
        response.body.should.have.property('errors').and.be.an('array');
        response.body.errors[0].status.should.equal(403);
        response.body.errors[0].detail.should.equal('Forbidden');
    });

    it('Creating an user while logged in as a MANAGER not providing apps should return 400 Bad Request', async () => {
        const token: string = mockValidJWT({ role: 'MANAGER' });
        mockValidateRequestWithApiKeyAndUserToken({ token });

        const response: request.Response = await requester
            .post(`/auth/user`)
            .set('Content-Type', 'application/json')
            .set('x-api-key', 'api-key-test')
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
        mockValidateRequestWithApiKeyAndUserToken({ token });

        const response: request.Response = await requester
            .post(`/auth/user`)
            .set('Content-Type', 'application/json')
            .set('x-api-key', 'api-key-test')
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
        mockValidateRequestWithApiKeyAndUserToken({ token });

        const response: request.Response = await requester
            .post(`/auth/user`)
            .set('Content-Type', 'application/json')
            .set('x-api-key', 'api-key-test')
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

    it('Creating an user with valid data while being logged in as a MANAGER should return 200 OK and the created user data', async () => {
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
        mockValidateRequestWithApiKeyAndUserToken({ token });

        const response: request.Response = await requester
            .post(`/auth/user`)
            .set('Content-Type', 'application/json')
            .set('x-api-key', 'api-key-test')
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

    it('Creating an user with valid data while being logged in as an ADMIN should return 200 OK and the created user data', async () => {
        const apps: string[] = ['rw'];
        const token: string = mockValidJWT({ role: 'ADMIN', extraUserData: { apps } });
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
        mockValidateRequestWithApiKeyAndUserToken({ token });

        const response: request.Response = await requester
            .post(`/auth/user`)
            .set('Content-Type', 'application/json')
            .set('x-api-key', 'api-key-test')
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

    describe('with associated applications', () => {
        describe('MANAGER role', () => {
            it('Creating a user while being logged in as MANAGER and associating an application that\'s associated with the current user should be successful', async () => {
                const testApplication: HydratedDocument<IApplication> = await createApplication();

                const apps: string[] = ['rw'];
                const requestUser: OktaUser = getMockOktaUser({ role: 'MANAGER' });
                const token: string = mockValidJWT({
                    id: requestUser.profile.legacyId,
                    email: requestUser.profile.email,
                    role: requestUser.profile.role,
                    extraUserData: { apps: requestUser.profile.apps },
                });


                const newUser: OktaUser = getMockOktaUser();

                await new ApplicationUserModel({
                    userId: requestUser.profile.legacyId,
                    application: testApplication
                }).save();

                mockGetUserById(requestUser);
                mockOktaCreateUser(newUser, {
                    email: newUser.profile.email,
                    name: 'Test User',
                    role: newUser.profile.role,
                    photo: newUser.profile.photo,
                    apps,
                    provider: OktaOAuthProvider.LOCAL,
                });
                mockOktaSendActivationEmail(newUser);
                mockValidateRequestWithApiKeyAndUserToken({ token });

                const response: request.Response = await requester
                    .post(`/auth/user`)
                    .set('Content-Type', 'application/json')
                    .set('Authorization', `Bearer ${token}`)
                    .set('x-api-key', 'api-key-test')
                    .send({
                        role: newUser.profile.role,
                        extraUserData: { apps },
                        email: newUser.profile.email,
                        photo: newUser.profile.photo,
                        name: 'Test User',
                        applications: [testApplication.id],
                    });

                response.status.should.equal(200);
                response.body.should.be.an('object');
                response.body.should.have.property('id').and.eql(newUser.profile.legacyId);
                response.body.should.have.property('email').and.eql(newUser.profile.email);
                response.body.should.have.property('name').and.eql(newUser.profile.displayName);
                response.body.should.have.property('role').and.eql(newUser.profile.role);
                response.body.should.have.property('extraUserData').and.eql({ apps });
                response.body.should.have.property('photo').and.eql(newUser.profile.photo);

                await assertConnection({ application: testApplication, user: newUser })
                await assertNoConnection({ application: testApplication, user: requestUser })
            });

            it('Creating a user while being logged in as MANAGER and associating an application that\'s associated with a different user should fail', async () => {
                const testApplication: HydratedDocument<IApplication> = await createApplication();

                const apps: string[] = ['rw'];
                const requestUser: OktaUser = getMockOktaUser({ role: 'MANAGER' });
                const token: string = mockValidJWT({
                    id: requestUser.profile.legacyId,
                    email: requestUser.profile.email,
                    role: requestUser.profile.role,
                    extraUserData: { apps: requestUser.profile.apps },
                });

                const appUser: OktaUser = getMockOktaUser();
                const newUser: OktaUser = getMockOktaUser();

                await new ApplicationUserModel({
                    userId: appUser.profile.legacyId,
                    application: testApplication
                }).save();

                mockGetUserById(appUser);
                mockValidateRequestWithApiKeyAndUserToken({ token });

                const response: request.Response = await requester
                    .post(`/auth/user`)
                    .set('Content-Type', 'application/json')
                    .set('Authorization', `Bearer ${token}`)
                    .set('x-api-key', 'api-key-test')
                    .send({
                        role: newUser.profile.role,
                        extraUserData: { apps },
                        email: newUser.profile.email,
                        photo: newUser.profile.photo,
                        name: 'Test User',
                        applications: [testApplication.id],
                    });

                response.status.should.equal(403);
                response.body.should.have.property('errors').and.be.an('array');
                response.body.errors[0].status.should.equal(403);
                response.body.errors[0].detail.should.equal(`You don't have permissions to associate this/these application(s)`);

                await assertConnection({ application: testApplication, user: appUser })
                await assertNoConnection({ application: testApplication, user: requestUser })
            });

            it('Creating a user while being logged in as MANAGER and associating an application that\'s associated with an organization I am member of should fail', async () => {
                const apps: string[] = ['rw'];
                const requestUser: OktaUser = getMockOktaUser({ role: 'MANAGER' });
                const token: string = mockValidJWT({
                    id: requestUser.profile.legacyId,
                    email: requestUser.profile.email,
                    role: requestUser.profile.role,
                    extraUserData: { apps: requestUser.profile.apps },
                });

                const testApplication: HydratedDocument<IApplication> = await createApplication();
                const testOrganization: HydratedDocument<IOrganization> = await createOrganization();

                const newUser: OktaUser = getMockOktaUser();

                await new OrganizationUserModel({
                    organization: testOrganization.id,
                    userId: requestUser.profile.legacyId,
                    role: ORGANIZATION_ROLES.ORG_MEMBER
                }).save();
                await new OrganizationApplicationModel({
                    organization: testOrganization.id,
                    application: testApplication.id
                }).save();

                mockValidateRequestWithApiKeyAndUserToken({ token });

                const response: request.Response = await requester
                    .post(`/auth/user`)
                    .set('Content-Type', 'application/json')
                    .set('Authorization', `Bearer ${token}`)
                    .set('x-api-key', 'api-key-test')
                    .send({
                        role: newUser.profile.role,
                        extraUserData: { apps },
                        email: newUser.profile.email,
                        photo: newUser.profile.photo,
                        name: 'Test User',
                        applications: [testApplication.id],
                    });

                response.status.should.equal(403);
                response.body.should.have.property('errors').and.be.an('array').and.length(1);
                response.body.errors[0].should.have.property('status').and.equal(403);
                response.body.errors[0].detail.should.equal(`You don't have permissions to associate this/these application(s)`);

                await assertConnection({ application: testApplication, organization: testOrganization })
            });

            it('Creating a user while being logged in as MANAGER and associating an application that\'s associated with an organization I am admin of should be successful', async () => {
                const apps: string[] = ['rw'];
                const requestUser: OktaUser = getMockOktaUser({ role: 'MANAGER' });
                const token: string = mockValidJWT({
                    id: requestUser.profile.legacyId,
                    email: requestUser.profile.email,
                    role: requestUser.profile.role,
                    extraUserData: { apps: requestUser.profile.apps },
                });

                const testApplication: HydratedDocument<IApplication> = await createApplication();
                const testOrganization: HydratedDocument<IOrganization> = await createOrganization();

                const newUser: OktaUser = getMockOktaUser();

                await new OrganizationUserModel({
                    organization: testOrganization.id,
                    userId: requestUser.profile.legacyId,
                    role: ORGANIZATION_ROLES.ORG_ADMIN
                }).save();
                await new OrganizationApplicationModel({
                    organization: testOrganization.id,
                    application: testApplication.id
                }).save();

                mockOktaCreateUser(newUser, {
                    email: newUser.profile.email,
                    name: 'Test User',
                    role: newUser.profile.role,
                    photo: newUser.profile.photo,
                    apps,
                    provider: OktaOAuthProvider.LOCAL,
                });
                mockOktaSendActivationEmail(newUser);
                mockValidateRequestWithApiKeyAndUserToken({ token });

                const response: request.Response = await requester
                    .post(`/auth/user`)
                    .set('Content-Type', 'application/json')
                    .set('Authorization', `Bearer ${token}`)
                    .set('x-api-key', 'api-key-test')
                    .send({
                        role: newUser.profile.role,
                        extraUserData: { apps },
                        email: newUser.profile.email,
                        photo: newUser.profile.photo,
                        name: 'Test User',
                        applications: [testApplication.id],
                    });

                response.status.should.equal(200);
                response.body.should.be.an('object');
                response.body.should.have.property('id').and.eql(newUser.profile.legacyId);
                response.body.should.have.property('email').and.eql(newUser.profile.email);
                response.body.should.have.property('name').and.eql(newUser.profile.displayName);
                response.body.should.have.property('role').and.eql(newUser.profile.role);
                response.body.should.have.property('extraUserData').and.eql({ apps });
                response.body.should.have.property('photo').and.eql(newUser.profile.photo);

                await assertConnection({ application: testApplication, user: newUser })
                await assertNoConnection({ application: testApplication, organization: testOrganization })
            });
        })

        describe('ADMIN role', () => {
            it('Creating a user while being logged in as ADMIN and associating an application that\'s associated with the current user should be successful', async () => {
                const testApplication: HydratedDocument<IApplication> = await createApplication();

                const apps: string[] = ['rw'];
                const requestUser: OktaUser = getMockOktaUser({ role: 'ADMIN' });
                const token: string = mockValidJWT({
                    id: requestUser.profile.legacyId,
                    email: requestUser.profile.email,
                    role: requestUser.profile.role,
                    extraUserData: { apps: requestUser.profile.apps },
                });

                const newUser: OktaUser = getMockOktaUser();

                await new ApplicationUserModel({
                    userId: requestUser.profile.legacyId,
                    application: testApplication
                }).save();

                mockOktaCreateUser(newUser, {
                    email: newUser.profile.email,
                    name: 'Test User',
                    role: newUser.profile.role,
                    photo: newUser.profile.photo,
                    apps,
                    provider: OktaOAuthProvider.LOCAL,
                });
                mockOktaSendActivationEmail(newUser);
                mockValidateRequestWithApiKeyAndUserToken({ token });

                const response: request.Response = await requester
                    .post(`/auth/user`)
                    .set('Content-Type', 'application/json')
                    .set('Authorization', `Bearer ${token}`)
                    .set('x-api-key', 'api-key-test')
                    .send({
                        role: newUser.profile.role,
                        extraUserData: { apps },
                        email: newUser.profile.email,
                        photo: newUser.profile.photo,
                        name: 'Test User',
                        applications: [testApplication.id],
                    });

                response.status.should.equal(200);
                response.body.should.be.an('object');
                response.body.should.have.property('id').and.eql(newUser.profile.legacyId);
                response.body.should.have.property('email').and.eql(newUser.profile.email);
                response.body.should.have.property('name').and.eql(newUser.profile.displayName);
                response.body.should.have.property('role').and.eql(newUser.profile.role);
                response.body.should.have.property('extraUserData').and.eql({ apps });
                response.body.should.have.property('photo').and.eql(newUser.profile.photo);

                await assertConnection({ application: testApplication, user: newUser })
                await assertNoConnection({ application: testApplication, user: requestUser })
            });

            it('Creating a user while being logged in as ADMIN and associating an application that\'s associated with a different user should be successful', async () => {
                const testApplication: HydratedDocument<IApplication> = await createApplication();

                const apps: string[] = ['rw'];
                const requestUser: OktaUser = getMockOktaUser({ role: 'ADMIN' });
                const token: string = mockValidJWT({
                    id: requestUser.profile.legacyId,
                    email: requestUser.profile.email,
                    role: requestUser.profile.role,
                    extraUserData: { apps: requestUser.profile.apps },
                });

                const appUser: OktaUser = getMockOktaUser();
                const newUser: OktaUser = getMockOktaUser();

                await new ApplicationUserModel({
                    userId: appUser.profile.legacyId,
                    application: testApplication
                }).save();

                mockOktaCreateUser(newUser, {
                    email: newUser.profile.email,
                    name: 'Test User',
                    role: newUser.profile.role,
                    photo: newUser.profile.photo,
                    apps,
                    provider: OktaOAuthProvider.LOCAL,
                });
                mockOktaSendActivationEmail(newUser);
                mockValidateRequestWithApiKeyAndUserToken({ token });

                const response: request.Response = await requester
                    .post(`/auth/user`)
                    .set('Content-Type', 'application/json')
                    .set('x-api-key', 'api-key-test')
                    .set('Authorization', `Bearer ${token}`)
                    .send({
                        role: newUser.profile.role,
                        extraUserData: { apps },
                        email: newUser.profile.email,
                        photo: newUser.profile.photo,
                        name: 'Test User',
                        applications: [testApplication.id],
                    });

                response.status.should.equal(200);
                response.body.should.be.an('object');
                response.body.should.have.property('id').and.eql(newUser.profile.legacyId);
                response.body.should.have.property('email').and.eql(newUser.profile.email);
                response.body.should.have.property('name').and.eql(newUser.profile.displayName);
                response.body.should.have.property('role').and.eql(newUser.profile.role);
                response.body.should.have.property('extraUserData').and.eql({ apps });
                response.body.should.have.property('photo').and.eql(newUser.profile.photo);

                await assertConnection({ application: testApplication, user: newUser })
                await assertNoConnection({ application: testApplication, user: requestUser })
            });

            it('Creating a user while being logged in as ADMIN and associating an application that\'s associated with an organization I am member of should be successful', async () => {
                const apps: string[] = ['rw'];
                const requestUser: OktaUser = getMockOktaUser({ role: 'ADMIN' });
                const token: string = mockValidJWT({
                    id: requestUser.profile.legacyId,
                    email: requestUser.profile.email,
                    role: requestUser.profile.role,
                    extraUserData: { apps: requestUser.profile.apps },
                });

                const testApplication: HydratedDocument<IApplication> = await createApplication();
                const testOrganization: HydratedDocument<IOrganization> = await createOrganization();

                const newUser: OktaUser = getMockOktaUser();

                await new OrganizationUserModel({
                    organization: testOrganization.id,
                    userId: requestUser.profile.legacyId,
                    role: ORGANIZATION_ROLES.ORG_MEMBER
                }).save();
                await new OrganizationApplicationModel({
                    organization: testOrganization.id,
                    application: testApplication.id
                }).save();

                mockOktaCreateUser(newUser, {
                    email: newUser.profile.email,
                    name: 'Test User',
                    role: newUser.profile.role,
                    photo: newUser.profile.photo,
                    apps,
                    provider: OktaOAuthProvider.LOCAL,
                });
                mockOktaSendActivationEmail(newUser);
                mockValidateRequestWithApiKeyAndUserToken({ token });

                const response: request.Response = await requester
                    .post(`/auth/user`)
                    .set('Content-Type', 'application/json')
                    .set('Authorization', `Bearer ${token}`)
                    .set('x-api-key', 'api-key-test')
                    .send({
                        role: newUser.profile.role,
                        extraUserData: { apps },
                        email: newUser.profile.email,
                        photo: newUser.profile.photo,
                        name: 'Test User',
                        applications: [testApplication.id],
                    });

                response.status.should.equal(200);
                response.body.should.be.an('object');
                response.body.should.have.property('id').and.eql(newUser.profile.legacyId);
                response.body.should.have.property('email').and.eql(newUser.profile.email);
                response.body.should.have.property('name').and.eql(newUser.profile.displayName);
                response.body.should.have.property('role').and.eql(newUser.profile.role);
                response.body.should.have.property('extraUserData').and.eql({ apps });
                response.body.should.have.property('photo').and.eql(newUser.profile.photo);

                await assertNoConnection({ application: testApplication, organization: testOrganization })
                await assertConnection({ application: testApplication, user: newUser })
            });

            it('Creating a user while being logged in as ADMIN and associating an application that\'s associated with an organization I am admin of should be successful', async () => {
                const apps: string[] = ['rw'];
                const requestUser: OktaUser = getMockOktaUser({ role: 'ADMIN' });
                const token: string = mockValidJWT({
                    id: requestUser.profile.legacyId,
                    email: requestUser.profile.email,
                    role: requestUser.profile.role,
                    extraUserData: { apps: requestUser.profile.apps },
                });

                const testApplication: HydratedDocument<IApplication> = await createApplication();
                const testOrganization: HydratedDocument<IOrganization> = await createOrganization();

                const newUser: OktaUser = getMockOktaUser();

                await new OrganizationUserModel({
                    organization: testOrganization.id,
                    userId: requestUser.profile.legacyId,
                    role: ORGANIZATION_ROLES.ORG_ADMIN
                }).save();
                await new OrganizationApplicationModel({
                    organization: testOrganization.id,
                    application: testApplication.id
                }).save();

                mockOktaCreateUser(newUser, {
                    email: newUser.profile.email,
                    name: 'Test User',
                    role: newUser.profile.role,
                    photo: newUser.profile.photo,
                    apps,
                    provider: OktaOAuthProvider.LOCAL,
                });
                mockOktaSendActivationEmail(newUser);
                mockValidateRequestWithApiKeyAndUserToken({ token });

                const response: request.Response = await requester
                    .post(`/auth/user`)
                    .set('Content-Type', 'application/json')
                    .set('x-api-key', 'api-key-test')
                    .set('Authorization', `Bearer ${token}`)
                    .send({
                        role: newUser.profile.role,
                        extraUserData: { apps },
                        email: newUser.profile.email,
                        photo: newUser.profile.photo,
                        name: 'Test User',
                        applications: [testApplication.id],
                    });

                response.status.should.equal(200);
                response.body.should.be.an('object');
                response.body.should.have.property('id').and.eql(newUser.profile.legacyId);
                response.body.should.have.property('email').and.eql(newUser.profile.email);
                response.body.should.have.property('name').and.eql(newUser.profile.displayName);
                response.body.should.have.property('role').and.eql(newUser.profile.role);
                response.body.should.have.property('extraUserData').and.eql({ apps });
                response.body.should.have.property('photo').and.eql(newUser.profile.photo);

                await assertConnection({ application: testApplication, user: newUser })
                await assertNoConnection({ application: testApplication, organization: testOrganization })
            });
        })
    })

    describe('with associated organizations', () => {
        describe('MANAGER role', () => {
            it('Creating a user while being logged in as MANAGER and associating with ORG_MEMBER with an organization that the current user is a member of should fail', async () => {
                const testOrganization: HydratedDocument<IOrganization> = await createOrganization();

                const apps: string[] = ['rw'];
                const requestUser: OktaUser = getMockOktaUser({ role: 'MANAGER' });
                const token: string = mockValidJWT({
                    id: requestUser.profile.legacyId,
                    email: requestUser.profile.email,
                    role: requestUser.profile.role,
                    extraUserData: { apps: requestUser.profile.apps },
                });


                const newUser: OktaUser = getMockOktaUser();

                await new OrganizationUserModel({
                    userId: requestUser.profile.legacyId,
                    organization: testOrganization,
                    role: ORGANIZATION_ROLES.ORG_MEMBER
                }).save();
                mockValidateRequestWithApiKeyAndUserToken({ token });

                const response: request.Response = await requester
                    .post(`/auth/user`)
                    .set('Content-Type', 'application/json')
                    .set('Authorization', `Bearer ${token}`)
                    .set('x-api-key', 'api-key-test')
                    .send({
                        role: newUser.profile.role,
                        extraUserData: { apps },
                        email: newUser.profile.email,
                        photo: newUser.profile.photo,
                        name: 'Test User',
                        organizations: [{ id: testOrganization.id, role: ORGANIZATION_ROLES.ORG_MEMBER }],
                    });

                response.status.should.equal(403);
                response.body.should.have.property('errors').and.be.an('array');
                response.body.errors[0].status.should.equal(403);
                response.body.errors[0].detail.should.equal('You don\'t have permissions to associate this/these organization(s)');
            });

            it('Creating a user while being logged in as MANAGER and associating with ORG_ADMIN with an organization that the current user is a member of should fail', async () => {
                const testOrganization: HydratedDocument<IOrganization> = await createOrganization();

                const apps: string[] = ['rw'];
                const requestUser: OktaUser = getMockOktaUser({ role: 'MANAGER' });
                const token: string = mockValidJWT({
                    id: requestUser.profile.legacyId,
                    email: requestUser.profile.email,
                    role: requestUser.profile.role,
                    extraUserData: { apps: requestUser.profile.apps },
                });

                const newUser: OktaUser = getMockOktaUser();

                await new OrganizationUserModel({
                    userId: requestUser.profile.legacyId,
                    organization: testOrganization,
                    role: ORGANIZATION_ROLES.ORG_MEMBER
                }).save();
                mockValidateRequestWithApiKeyAndUserToken({ token });

                const response: request.Response = await requester
                    .post(`/auth/user`)
                    .set('Content-Type', 'application/json')
                    .set('Authorization', `Bearer ${token}`)
                    .set('x-api-key', 'api-key-test')
                    .send({
                        role: newUser.profile.role,
                        extraUserData: { apps },
                        email: newUser.profile.email,
                        photo: newUser.profile.photo,
                        name: 'Test User',
                        organizations: [{ id: testOrganization.id, role: ORGANIZATION_ROLES.ORG_ADMIN }],
                    });

                response.status.should.equal(400);
                response.body.should.have.property('errors').and.be.an('array');
                response.body.errors[0].status.should.equal(400);
                response.body.errors[0].detail.should.equal('"organizations[0].role" must be [ORG_MEMBER]');

                await assertNoConnection({ organization: testOrganization, user: newUser })
                await assertConnection({
                    organization: testOrganization,
                    user: requestUser,
                    role: ORGANIZATION_ROLES.ORG_MEMBER
                })
            });

            it('Creating a user while being logged in as MANAGER and associating with ORG_MEMBER with an organization that the current user is an admin of should succeed', async () => {
                const testOrganization: HydratedDocument<IOrganization> = await createOrganization();

                const apps: string[] = ['rw'];
                const requestUser: OktaUser = getMockOktaUser({ role: 'MANAGER' });
                const token: string = mockValidJWT({
                    id: requestUser.profile.legacyId,
                    email: requestUser.profile.email,
                    role: requestUser.profile.role,
                    extraUserData: { apps: requestUser.profile.apps },
                });

                const newUser: OktaUser = getMockOktaUser();

                await new OrganizationUserModel({
                    userId: requestUser.profile.legacyId,
                    organization: testOrganization,
                    role: ORGANIZATION_ROLES.ORG_ADMIN
                }).save();

                mockOktaCreateUser(newUser, {
                    email: newUser.profile.email,
                    name: 'Test User',
                    role: newUser.profile.role,
                    photo: newUser.profile.photo,
                    apps,
                    provider: OktaOAuthProvider.LOCAL,
                });
                mockOktaSendActivationEmail(newUser);
                mockValidateRequestWithApiKeyAndUserToken({ token });

                const response: request.Response = await requester
                    .post(`/auth/user`)
                    .set('Content-Type', 'application/json')
                    .set('Authorization', `Bearer ${token}`)
                    .set('x-api-key', 'api-key-test')
                    .send({
                        role: newUser.profile.role,
                        extraUserData: { apps },
                        email: newUser.profile.email,
                        photo: newUser.profile.photo,
                        name: 'Test User',
                        organizations: [{ id: testOrganization.id, role: ORGANIZATION_ROLES.ORG_MEMBER }],
                    });

                response.status.should.equal(200);
                response.body.should.be.an('object');
                response.body.should.have.property('id').and.eql(newUser.profile.legacyId);
                response.body.should.have.property('email').and.eql(newUser.profile.email);
                response.body.should.have.property('name').and.eql(newUser.profile.displayName);
                response.body.should.have.property('role').and.eql(newUser.profile.role);
                response.body.should.have.property('extraUserData').and.eql({ apps });
                response.body.should.have.property('photo').and.eql(newUser.profile.photo);

                await assertConnection({
                    organization: testOrganization,
                    user: newUser,
                    role: ORGANIZATION_ROLES.ORG_MEMBER
                })
                await assertConnection({
                    organization: testOrganization,
                    user: requestUser,
                    role: ORGANIZATION_ROLES.ORG_ADMIN
                })
            });

            it('Creating a user while being logged in as MANAGER and associating with ORG_ADMIN with an organization that the current user is an admin of should fail', async () => {
                const testOrganization: HydratedDocument<IOrganization> = await createOrganization();

                const apps: string[] = ['rw'];
                const requestUser: OktaUser = getMockOktaUser({ role: 'MANAGER' });
                const token: string = mockValidJWT({
                    id: requestUser.profile.legacyId,
                    email: requestUser.profile.email,
                    role: requestUser.profile.role,
                    extraUserData: { apps: requestUser.profile.apps },
                });

                const newUser: OktaUser = getMockOktaUser();

                await new OrganizationUserModel({
                    userId: requestUser.profile.legacyId,
                    organization: testOrganization,
                    role: ORGANIZATION_ROLES.ORG_ADMIN
                }).save();
                mockValidateRequestWithApiKeyAndUserToken({ token });

                const response: request.Response = await requester
                    .post(`/auth/user`)
                    .set('Content-Type', 'application/json')
                    .set('Authorization', `Bearer ${token}`)
                    .set('x-api-key', 'api-key-test')
                    .send({
                        role: newUser.profile.role,
                        extraUserData: { apps },
                        email: newUser.profile.email,
                        photo: newUser.profile.photo,
                        name: 'Test User',
                        organizations: [{ id: testOrganization.id, role: ORGANIZATION_ROLES.ORG_ADMIN }],
                    });

                response.status.should.equal(400);
                response.body.should.have.property('errors').and.be.an('array');
                response.body.errors[0].status.should.equal(400);
                response.body.errors[0].detail.should.equal('"organizations[0].role" must be [ORG_MEMBER]');

                await assertNoConnection({ organization: testOrganization, user: newUser })
                await assertConnection({
                    organization: testOrganization,
                    user: requestUser,
                    role: ORGANIZATION_ROLES.ORG_ADMIN
                })
            });

            it('Creating a user while being logged in as MANAGER and associating an organization that\'s not associated with the current user should fail', async () => {
                const testOrganization: HydratedDocument<IOrganization> = await createOrganization();

                const apps: string[] = ['rw'];
                const requestUser: OktaUser = getMockOktaUser({ role: 'MANAGER' });
                const token: string = mockValidJWT({
                    id: requestUser.profile.legacyId,
                    email: requestUser.profile.email,
                    role: requestUser.profile.role,
                    extraUserData: { apps: requestUser.profile.apps },
                });

                const appUser: OktaUser = getMockOktaUser();
                const newUser: OktaUser = getMockOktaUser();

                await new OrganizationUserModel({
                    userId: appUser.profile.legacyId,
                    organization: testOrganization,
                    role: ORGANIZATION_ROLES.ORG_ADMIN
                }).save();
                mockValidateRequestWithApiKeyAndUserToken({ token });

                const response: request.Response = await requester
                    .post(`/auth/user`)
                    .set('Content-Type', 'application/json')
                    .set('Authorization', `Bearer ${token}`)
                    .set('x-api-key', 'api-key-test')
                    .send({
                        role: newUser.profile.role,
                        extraUserData: { apps },
                        email: newUser.profile.email,
                        photo: newUser.profile.photo,
                        name: 'Test User',
                        organizations: [{ id: testOrganization.id, role: ORGANIZATION_ROLES.ORG_MEMBER }],
                    });

                response.status.should.equal(403);
                response.body.should.have.property('errors').and.be.an('array');
                response.body.errors[0].status.should.equal(403);
                response.body.errors[0].detail.should.equal(`You don't have permissions to associate this/these organization(s)`);

                await assertConnection({ organization: testOrganization, user: appUser })
                await assertNoConnection({ organization: testOrganization, user: requestUser })
            });
        })

        describe('ADMIN role', () => {
            it('Creating a user while being logged in as ADMIN and associating with ORG_MEMBER with an organization that the current user is a member of should succeed', async () => {
                const testOrganization: HydratedDocument<IOrganization> = await createOrganization();

                const apps: string[] = ['rw'];
                const requestUser: OktaUser = getMockOktaUser({ role: 'ADMIN' });
                const token: string = mockValidJWT({
                    id: requestUser.profile.legacyId,
                    email: requestUser.profile.email,
                    role: requestUser.profile.role,
                    extraUserData: { apps: requestUser.profile.apps },
                });

                const newUser: OktaUser = getMockOktaUser();

                await new OrganizationUserModel({
                    userId: requestUser.profile.legacyId,
                    organization: testOrganization,
                    role: ORGANIZATION_ROLES.ORG_MEMBER
                }).save();

                mockOktaCreateUser(newUser, {
                    email: newUser.profile.email,
                    name: 'Test User',
                    role: newUser.profile.role,
                    photo: newUser.profile.photo,
                    apps,
                    provider: OktaOAuthProvider.LOCAL,
                });
                mockOktaSendActivationEmail(newUser);
                mockValidateRequestWithApiKeyAndUserToken({ token });

                const response: request.Response = await requester
                    .post(`/auth/user`)
                    .set('Content-Type', 'application/json')
                    .set('Authorization', `Bearer ${token}`)
                    .set('x-api-key', 'api-key-test')
                    .send({
                        role: newUser.profile.role,
                        extraUserData: { apps },
                        email: newUser.profile.email,
                        photo: newUser.profile.photo,
                        name: 'Test User',
                        organizations: [{ id: testOrganization.id, role: ORGANIZATION_ROLES.ORG_MEMBER }],
                    });

                response.status.should.equal(200);
                response.body.should.be.an('object');
                response.body.should.have.property('id').and.eql(newUser.profile.legacyId);
                response.body.should.have.property('email').and.eql(newUser.profile.email);
                response.body.should.have.property('name').and.eql(newUser.profile.displayName);
                response.body.should.have.property('role').and.eql(newUser.profile.role);
                response.body.should.have.property('extraUserData').and.eql({ apps });
                response.body.should.have.property('photo').and.eql(newUser.profile.photo);

                await assertConnection({
                    organization: testOrganization,
                    user: newUser,
                    role: ORGANIZATION_ROLES.ORG_MEMBER
                })
                await assertConnection({
                    organization: testOrganization,
                    user: requestUser,
                    role: ORGANIZATION_ROLES.ORG_MEMBER
                })
            });

            it('Creating a user while being logged in as ADMIN and associating with ORG_ADMIN with an organization that the current user is a member of should succeed', async () => {
                const testOrganization: HydratedDocument<IOrganization> = await createOrganization();

                const apps: string[] = ['rw'];
                const requestUser: OktaUser = getMockOktaUser({ role: 'ADMIN' });
                const token: string = mockValidJWT({
                    id: requestUser.profile.legacyId,
                    email: requestUser.profile.email,
                    role: requestUser.profile.role,
                    extraUserData: { apps: requestUser.profile.apps },
                });

                const newUser: OktaUser = getMockOktaUser();

                await new OrganizationUserModel({
                    userId: requestUser.profile.legacyId,
                    organization: testOrganization,
                    role: ORGANIZATION_ROLES.ORG_MEMBER
                }).save();
                mockValidateRequestWithApiKeyAndUserToken({ token });

                const response: request.Response = await requester
                    .post(`/auth/user`)
                    .set('Content-Type', 'application/json')
                    .set('Authorization', `Bearer ${token}`)
                    .set('x-api-key', 'api-key-test')
                    .send({
                        role: newUser.profile.role,
                        extraUserData: { apps },
                        email: newUser.profile.email,
                        photo: newUser.profile.photo,
                        name: 'Test User',
                        organizations: [{ id: testOrganization.id, role: ORGANIZATION_ROLES.ORG_ADMIN }],
                    });

                response.status.should.equal(400);
                response.body.should.have.property('errors').and.be.an('array');
                response.body.errors[0].status.should.equal(400);
                response.body.errors[0].detail.should.equal('"organizations[0].role" must be [ORG_MEMBER]');

                await assertNoConnection({ organization: testOrganization, user: newUser })
                await assertConnection({
                    organization: testOrganization,
                    user: requestUser,
                    role: ORGANIZATION_ROLES.ORG_MEMBER
                })
            });

            it('Creating a user while being logged in as ADMIN and associating with ORG_MEMBER with an organization that the current user is an admin of should succeed', async () => {
                const testOrganization: HydratedDocument<IOrganization> = await createOrganization();

                const apps: string[] = ['rw'];
                const requestUser: OktaUser = getMockOktaUser({ role: 'ADMIN' });
                const token: string = mockValidJWT({
                    id: requestUser.profile.legacyId,
                    email: requestUser.profile.email,
                    role: requestUser.profile.role,
                    extraUserData: { apps: requestUser.profile.apps },
                });

                const newUser: OktaUser = getMockOktaUser();

                await new OrganizationUserModel({
                    userId: requestUser.profile.legacyId,
                    organization: testOrganization,
                    role: ORGANIZATION_ROLES.ORG_ADMIN
                }).save();

                mockOktaCreateUser(newUser, {
                    email: newUser.profile.email,
                    name: 'Test User',
                    role: newUser.profile.role,
                    photo: newUser.profile.photo,
                    apps,
                    provider: OktaOAuthProvider.LOCAL,
                });
                mockOktaSendActivationEmail(newUser);
                mockValidateRequestWithApiKeyAndUserToken({ token });

                const response: request.Response = await requester
                    .post(`/auth/user`)
                    .set('Content-Type', 'application/json')
                    .set('Authorization', `Bearer ${token}`)
                    .set('x-api-key', 'api-key-test')
                    .send({
                        role: newUser.profile.role,
                        extraUserData: { apps },
                        email: newUser.profile.email,
                        photo: newUser.profile.photo,
                        name: 'Test User',
                        organizations: [{ id: testOrganization.id, role: ORGANIZATION_ROLES.ORG_MEMBER }],
                    });

                response.status.should.equal(200);
                response.body.should.be.an('object');
                response.body.should.have.property('id').and.eql(newUser.profile.legacyId);
                response.body.should.have.property('email').and.eql(newUser.profile.email);
                response.body.should.have.property('name').and.eql(newUser.profile.displayName);
                response.body.should.have.property('role').and.eql(newUser.profile.role);
                response.body.should.have.property('extraUserData').and.eql({ apps });
                response.body.should.have.property('photo').and.eql(newUser.profile.photo);

                await assertConnection({
                    organization: testOrganization,
                    user: newUser,
                    role: ORGANIZATION_ROLES.ORG_MEMBER
                })
                await assertConnection({
                    organization: testOrganization,
                    user: requestUser,
                    role: ORGANIZATION_ROLES.ORG_ADMIN
                })
            });

            it('Creating a user while being logged in as ADMIN and associating with ORG_ADMIN with an organization that the current user is an admin of should fail', async () => {
                const testOrganization: HydratedDocument<IOrganization> = await createOrganization();

                const apps: string[] = ['rw'];
                const requestUser: OktaUser = getMockOktaUser({ role: 'ADMIN' });
                const token: string = mockValidJWT({
                    id: requestUser.profile.legacyId,
                    email: requestUser.profile.email,
                    role: requestUser.profile.role,
                    extraUserData: { apps: requestUser.profile.apps },
                });

                const newUser: OktaUser = getMockOktaUser();

                await new OrganizationUserModel({
                    userId: requestUser.profile.legacyId,
                    organization: testOrganization,
                    role: ORGANIZATION_ROLES.ORG_ADMIN
                }).save();
                mockValidateRequestWithApiKeyAndUserToken({ token });

                const response: request.Response = await requester
                    .post(`/auth/user`)
                    .set('Content-Type', 'application/json')
                    .set('Authorization', `Bearer ${token}`)
                    .set('x-api-key', 'api-key-test')
                    .send({
                        role: newUser.profile.role,
                        extraUserData: { apps },
                        email: newUser.profile.email,
                        photo: newUser.profile.photo,
                        name: 'Test User',
                        organizations: [{ id: testOrganization.id, role: ORGANIZATION_ROLES.ORG_ADMIN }],
                    });

                response.status.should.equal(400);
                response.body.should.have.property('errors').and.be.an('array');
                response.body.errors[0].status.should.equal(400);
                response.body.errors[0].detail.should.equal('"organizations[0].role" must be [ORG_MEMBER]');

                await assertNoConnection({ organization: testOrganization, user: newUser })
                await assertConnection({
                    organization: testOrganization,
                    user: requestUser,
                    role: ORGANIZATION_ROLES.ORG_ADMIN
                })
            });

            it('Creating a user while being logged in as ADMIN and associating an organization that\'s not associated with the current user should succeed', async () => {
                const testOrganization: HydratedDocument<IOrganization> = await createOrganization();

                const apps: string[] = ['rw'];
                const requestUser: OktaUser = getMockOktaUser({ role: 'ADMIN' });
                const token: string = mockValidJWT({
                    id: requestUser.profile.legacyId,
                    email: requestUser.profile.email,
                    role: requestUser.profile.role,
                    extraUserData: { apps: requestUser.profile.apps },
                });

                const appUser: OktaUser = getMockOktaUser();
                const newUser: OktaUser = getMockOktaUser();

                await new OrganizationUserModel({
                    userId: appUser.profile.legacyId,
                    organization: testOrganization,
                    role: ORGANIZATION_ROLES.ORG_ADMIN
                }).save();

                mockOktaCreateUser(newUser, {
                    email: newUser.profile.email,
                    name: 'Test User',
                    role: newUser.profile.role,
                    photo: newUser.profile.photo,
                    apps,
                    provider: OktaOAuthProvider.LOCAL,
                });
                mockOktaSendActivationEmail(newUser);
                mockValidateRequestWithApiKeyAndUserToken({ token });

                const response: request.Response = await requester
                    .post(`/auth/user`)
                    .set('Content-Type', 'application/json')
                    .set('Authorization', `Bearer ${token}`)
                    .set('x-api-key', 'api-key-test')
                    .send({
                        role: newUser.profile.role,
                        extraUserData: { apps },
                        email: newUser.profile.email,
                        photo: newUser.profile.photo,
                        name: 'Test User',
                        organizations: [{ id: testOrganization.id, role: ORGANIZATION_ROLES.ORG_MEMBER }],
                    });

                response.status.should.equal(200);
                response.body.should.be.an('object');
                response.body.should.have.property('id').and.eql(newUser.profile.legacyId);
                response.body.should.have.property('email').and.eql(newUser.profile.email);
                response.body.should.have.property('name').and.eql(newUser.profile.displayName);
                response.body.should.have.property('role').and.eql(newUser.profile.role);
                response.body.should.have.property('extraUserData').and.eql({ apps });
                response.body.should.have.property('photo').and.eql(newUser.profile.photo);

                await assertConnection({ organization: testOrganization, user: appUser })
                await assertConnection({ organization: testOrganization, user: newUser })
                await assertNoConnection({ organization: testOrganization, user: requestUser })
            });
        })
    })


    after(async () => {
        await closeTestAgent();
    });

    afterEach(async () => {
        await OrganizationModel.deleteMany({}).exec();
        await OrganizationUserModel.deleteMany({}).exec();
        await OrganizationApplicationModel.deleteMany({}).exec();
        await ApplicationModel.deleteMany({}).exec();
        await ApplicationUserModel.deleteMany({}).exec();

        if (!nock.isDone()) {
            throw new Error(`Not all nock interceptors were used: ${nock.pendingMocks()}`);
        }
    });
});
