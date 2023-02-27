import nock from 'nock';
import chai from 'chai';
import chaiDateTime from 'chai-datetime';
import type request from 'superagent';

import { OktaOAuthProvider, OktaUser } from 'services/okta.interfaces';
import { closeTestAgent, getTestAgent } from '../utils/test-server';
import {
    getMockOktaUser,
    mockOktaCreateUser,
    mockOktaFailedSignUp,
    mockOktaSendActivationEmail,
    mockValidJWT
} from './okta.mocks';
import OrganizationModel, { IOrganization } from "models/organization";
import { assertConnection, assertNoConnection, createApplication, createOrganization } from "../utils/helpers";
import ApplicationModel, { IApplication } from "models/application";
import OrganizationApplicationModel from "models/organization-application";
import { HydratedDocument } from "mongoose";
import ApplicationUserModel from "models/application-user";
import OrganizationUserModel from "models/organization-user";

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

    describe('with associated applications', () => {
        it('Create an user and associating an application with an existing user should be successful', async () => {
            const apps: string[] = ['rw'];
            const token: string = mockValidJWT({ role: 'MANAGER', extraUserData: { apps } });
            const user: OktaUser = getMockOktaUser({ apps });

            const testOrganization: IOrganization = await createOrganization();
            const testApplication: IApplication = await createApplication();

            await new OrganizationApplicationModel({
                organization: testOrganization,
                application: testApplication
            }).save();

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
                    applications: [testApplication.id],
                });

            response.status.should.equal(200);
            response.body.should.be.an('object');
            response.body.should.have.property('id').and.eql(user.profile.legacyId);
            response.body.should.have.property('email').and.eql(user.profile.email);
            response.body.should.have.property('name').and.eql(user.profile.displayName);
            response.body.should.have.property('role').and.eql(user.profile.role);
            response.body.should.have.property('extraUserData').and.eql({ apps });
            response.body.should.have.property('photo').and.eql(user.profile.photo);
            response.body.should.have.property('applications').and.eql([{
                id: testApplication.id,
                name: testApplication.name,
            }]);
            response.body.should.have.property('createdAt');
            response.body.should.have.property('updatedAt');

            await assertNoConnection({
                application: testApplication,
                organization: testOrganization
            });
            await assertNoConnection({ user: user, organization: testOrganization });
            await assertConnection({ application: testApplication, user: user });
        });

        it('Create an user and associating an application that\'s associated with a different user with the current user should be successful', async () => {
            const apps: string[] = ['rw'];
            const token: string = mockValidJWT({ role: 'MANAGER', extraUserData: { apps } });
            const user: OktaUser = getMockOktaUser({ apps });

            const testApplication: HydratedDocument<IApplication> = await createApplication();

            const originalOwnerUser: OktaUser = getMockOktaUser();

            await new ApplicationUserModel({ userId: originalOwnerUser.id, application: testApplication }).save();

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
                    applications: [testApplication.id],
                });

            response.status.should.equal(200);
            response.body.should.be.an('object');
            response.body.should.have.property('id').and.eql(user.profile.legacyId);
            response.body.should.have.property('email').and.eql(user.profile.email);
            response.body.should.have.property('name').and.eql(user.profile.displayName);
            response.body.should.have.property('role').and.eql(user.profile.role);
            response.body.should.have.property('extraUserData').and.eql({ apps });
            response.body.should.have.property('photo').and.eql(user.profile.photo);
            response.body.should.have.property('applications').and.eql([{
                id: testApplication.id,
                name: testApplication.name
            }]);
            response.body.should.have.property('createdAt');
            response.body.should.have.property('updatedAt');

            await assertConnection({ application: testApplication, user: user })
            await assertNoConnection({ application: testApplication, user: originalOwnerUser })
        });

        it('Create an user and associating an application that\'s associated with an organization user should be successful and remove association with organization', async () => {
            const testApplication: IApplication = await createApplication();
            const testOrganization: IOrganization = await createOrganization();

            const originalOwnerUser: OktaUser = getMockOktaUser();

            await new OrganizationApplicationModel({
                userId: originalOwnerUser.id,
                organization: testOrganization
            }).save();

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
                    applications: [testApplication.id],
                });

            response.status.should.equal(200);
            response.body.should.be.an('object');
            response.body.should.have.property('id').and.eql(user.profile.legacyId);
            response.body.should.have.property('email').and.eql(user.profile.email);
            response.body.should.have.property('name').and.eql(user.profile.displayName);
            response.body.should.have.property('role').and.eql(user.profile.role);
            response.body.should.have.property('extraUserData').and.eql({ apps });
            response.body.should.have.property('photo').and.eql(user.profile.photo);
            response.body.should.have.property('applications').and.eql([{
                id: testApplication.id,
                name: testApplication.name
            }]);
            response.body.should.have.property('createdAt');
            response.body.should.have.property('updatedAt');

            await assertConnection({ application: testApplication, user: user })
            await assertNoConnection({ organization: testOrganization, user: originalOwnerUser })
        });

        it('Create an user and overwriting existing applications should be successful', async () => {
            const testApplicationOne: HydratedDocument<IApplication> = await createApplication();
            const testApplicationTwo: HydratedDocument<IApplication> = await createApplication();

            const apps: string[] = ['rw'];
            const token: string = mockValidJWT({ role: 'MANAGER', extraUserData: { apps } });
            const user: OktaUser = getMockOktaUser({ apps });

            await new ApplicationUserModel({ userId: user.id, application: testApplicationOne }).save();

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
                    applications: [testApplicationTwo.id],
                });

            response.status.should.equal(200);
            response.body.should.be.an('object');
            response.body.should.have.property('id').and.eql(user.profile.legacyId);
            response.body.should.have.property('email').and.eql(user.profile.email);
            response.body.should.have.property('name').and.eql(user.profile.displayName);
            response.body.should.have.property('role').and.eql(user.profile.role);
            response.body.should.have.property('extraUserData').and.eql({ apps });
            response.body.should.have.property('photo').and.eql(user.profile.photo);
            response.body.should.have.property('applications').and.eql([{
                id: testApplicationTwo.id,
                name: testApplicationTwo.name,
            }]);
            response.body.should.have.property('createdAt');
            response.body.should.have.property('updatedAt');

            await assertNoConnection({ application: testApplicationOne, user: user })
            await assertConnection({ application: testApplicationTwo, user: user })
        });

        it('Create an user and removing applications should be successful', async () => {
            const testApplication: HydratedDocument<IApplication> = await createApplication();

            const apps: string[] = ['rw'];
            const token: string = mockValidJWT({ role: 'MANAGER', extraUserData: { apps } });
            const user: OktaUser = getMockOktaUser({ apps });

            await new ApplicationUserModel({ userId: user.id, application: testApplication }).save();

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
                    applications: [],
                });

            response.status.should.equal(200);
            response.body.should.be.an('object');
            response.body.should.have.property('id').and.eql(user.profile.legacyId);
            response.body.should.have.property('email').and.eql(user.profile.email);
            response.body.should.have.property('name').and.eql(user.profile.displayName);
            response.body.should.have.property('role').and.eql(user.profile.role);
            response.body.should.have.property('extraUserData').and.eql({ apps });
            response.body.should.have.property('photo').and.eql(user.profile.photo);
            response.body.should.have.property('applications').and.eql([]);
            response.body.should.have.property('createdAt');
            response.body.should.have.property('updatedAt');

            await assertNoConnection({ application: testApplication, user: null });
        });
    })

    describe('with associated organizations', () => {
        it('Create an user and associating an organization with an existing user should be successful', async () => {
            const apps: string[] = ['rw'];
            const token: string = mockValidJWT({ role: 'MANAGER', extraUserData: { apps } });
            const user: OktaUser = getMockOktaUser({ apps });

            const testApplication: IApplication = await createApplication();
            const testOrganization: IOrganization = await createOrganization();

            await new OrganizationApplicationModel({
                application: testApplication,
                organization: testOrganization
            }).save();

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
                    organizations: [{
                        id: testOrganization.id,
                        role: 'ORG_ADMIN'
                    }],
                });

            response.status.should.equal(200);
            response.body.should.be.an('object');
            response.body.should.have.property('id').and.eql(user.profile.legacyId);
            response.body.should.have.property('email').and.eql(user.profile.email);
            response.body.should.have.property('name').and.eql(user.profile.displayName);
            response.body.should.have.property('role').and.eql(user.profile.role);
            response.body.should.have.property('extraUserData').and.eql({ apps });
            response.body.should.have.property('photo').and.eql(user.profile.photo);
            response.body.should.have.property('organizations').and.eql([{
                id: testOrganization.id,
                name: testOrganization.name,
                role: 'ORG_ADMIN'
            }]);
            response.body.should.have.property('createdAt');
            response.body.should.have.property('updatedAt');

            await assertConnection({ organization: testOrganization, application: testApplication });
            await assertNoConnection({ user: user, application: testApplication });
            await assertConnection({ organization: testOrganization, user: user });
        });

        it('Create an user and associating an organization that\'s associated with a different user should be successful and not remove previous user association', async () => {
            const testOrganization: HydratedDocument<IOrganization> = await createOrganization();

            const originalUser: OktaUser = getMockOktaUser({ organizations: [testOrganization.id] });

            await new OrganizationUserModel({
                userId: originalUser.profile.legacyId,
                organization: testOrganization,
                role: 'ORG_ADMIN'
            }).save();

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
                    organizations: [{ id: testOrganization.id, role: 'ORG_ADMIN' }],
                });

            response.status.should.equal(200);
            response.body.should.be.an('object');
            response.body.should.have.property('id').and.eql(user.profile.legacyId);
            response.body.should.have.property('email').and.eql(user.profile.email);
            response.body.should.have.property('name').and.eql(user.profile.displayName);
            response.body.should.have.property('role').and.eql(user.profile.role);
            response.body.should.have.property('extraUserData').and.eql({ apps });
            response.body.should.have.property('photo').and.eql(user.profile.photo);
            response.body.should.have.property('organizations').and.eql([{
                id: testOrganization.id,
                name: testOrganization.name,
                role: 'ORG_ADMIN'
            }]);
            response.body.should.have.property('createdAt');
            response.body.should.have.property('updatedAt');

            await assertConnection({ organization: testOrganization, user: user })
            await assertConnection({ organization: testOrganization, user: originalUser })
        });

        it('Create an user and associating an organization that\'s associated with an application user should be successful and not remove association with application', async () => {
            const testOrganization: IOrganization = await createOrganization();
            const testOrganizationApplication: IApplication = await createApplication();
            const testUserApplication: IApplication = await createApplication();

            const originalOwnerUser: OktaUser = getMockOktaUser({ organizations: [testOrganization.id] });

            const apps: string[] = ['rw'];
            const token: string = mockValidJWT({ role: 'MANAGER', extraUserData: { apps } });
            const user: OktaUser = getMockOktaUser({ apps });

            await new OrganizationApplicationModel({
                organization: testOrganization,
                application: testOrganizationApplication
            }).save();

            await new ApplicationUserModel({
                userId: user.profile.legacyId,
                application: testUserApplication
            }).save();

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
                    organizations: [{ id: testOrganization.id, role: 'ORG_ADMIN' }],
                });

            response.status.should.equal(200);
            response.body.should.be.an('object');
            response.body.should.have.property('id').and.eql(user.profile.legacyId);
            response.body.should.have.property('email').and.eql(user.profile.email);
            response.body.should.have.property('name').and.eql(user.profile.displayName);
            response.body.should.have.property('role').and.eql(user.profile.role);
            response.body.should.have.property('extraUserData').and.eql({ apps });
            response.body.should.have.property('photo').and.eql(user.profile.photo);
            response.body.should.have.property('organizations').and.eql([{
                id: testOrganization.id,
                name: testOrganization.name,
                role: 'ORG_ADMIN'
            }]);
            response.body.should.have.property('createdAt');
            response.body.should.have.property('updatedAt');

            await assertConnection({ organization: testOrganization, user: user })
            await assertConnection({ application: testUserApplication, user: user })
            await assertNoConnection({ application: testOrganizationApplication, user: originalOwnerUser })
        });

        it('Create an user and overwriting existing organizations should be successful', async () => {
            const testOrganizationOne: HydratedDocument<IOrganization> = await createOrganization();
            const testOrganizationTwo: HydratedDocument<IOrganization> = await createOrganization();

            const apps: string[] = ['rw'];
            const token: string = mockValidJWT({ role: 'MANAGER', extraUserData: { apps } });
            const user: OktaUser = getMockOktaUser({ apps });

            await new OrganizationUserModel({
                userId: user.id,
                organization: testOrganizationOne,
                role: 'ADMIN'
            }).save();

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
                    organizations: [{ id: testOrganizationTwo.id, role: 'ORG_ADMIN' }],
                });

            response.status.should.equal(200);
            response.body.should.be.an('object');
            response.body.should.have.property('id').and.eql(user.profile.legacyId);
            response.body.should.have.property('email').and.eql(user.profile.email);
            response.body.should.have.property('name').and.eql(user.profile.displayName);
            response.body.should.have.property('role').and.eql(user.profile.role);
            response.body.should.have.property('extraUserData').and.eql({ apps });
            response.body.should.have.property('photo').and.eql(user.profile.photo);
            response.body.should.have.property('organizations').and.eql([{
                id: testOrganizationTwo.id,
                name: testOrganizationTwo.name,
                role: 'ORG_ADMIN'
            }]);
            response.body.should.have.property('createdAt');
            response.body.should.have.property('updatedAt');

            await assertNoConnection({ organization: testOrganizationOne, user: user })
            await assertConnection({ organization: testOrganizationTwo, user: user })
        });

        it('Create an user and removing organizations should be successful', async () => {
            const testOrganization: HydratedDocument<IOrganization> = await createOrganization();

            const apps: string[] = ['rw'];
            const token: string = mockValidJWT({ role: 'MANAGER', extraUserData: { apps } });
            const user: OktaUser = getMockOktaUser({ apps });

            await new OrganizationUserModel({
                userId: user.id,
                organization: testOrganization,
                role: 'ADMIN'
            }).save();

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
                    organizations: [],
                });

            response.status.should.equal(200);
            response.body.should.be.an('object');
            response.body.should.have.property('id').and.eql(user.profile.legacyId);
            response.body.should.have.property('email').and.eql(user.profile.email);
            response.body.should.have.property('name').and.eql(user.profile.displayName);
            response.body.should.have.property('role').and.eql(user.profile.role);
            response.body.should.have.property('extraUserData').and.eql({ apps });
            response.body.should.have.property('photo').and.eql(user.profile.photo);
            response.body.should.have.property('organizations').and.eql([]);
            response.body.should.have.property('createdAt');
            response.body.should.have.property('updatedAt');

            await assertNoConnection({ organization: testOrganization, user: null });
        });
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
