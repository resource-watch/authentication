import nock from 'nock';
import chai from 'chai';
import chaiDateTime from 'chai-datetime';

import { closeTestAgent, getTestAgent } from '../utils/test-server';
import type request from 'superagent';
import { OktaUser } from 'services/okta.interfaces';
import {
    getMockOktaUser,
    mockGetUserById,
    mockGetUserByIdNotFound,
    mockOktaUpdateUser,
    mockValidJWT
} from './okta.mocks';
import CacheService from 'services/cache.service';
import Should = Chai.Should;
import ApplicationModel, { IApplication } from "models/application";
import { assertConnection, assertNoConnection, createApplication, createOrganization } from "../utils/helpers";
import OrganizationModel, { IOrganization } from "models/organization";
import { HydratedDocument } from "mongoose";
import OrganizationUserModel from "models/organization-user";
import ApplicationUserModel from "models/application-user";
import OrganizationApplicationModel from "models/organization-application";

const should: Should = chai.should();
chai.use(chaiDateTime);

let requester: ChaiHttp.Agent;

nock.disableNetConnect();
nock.enableNetConnect(process.env.HOST_IP);

describe('[OKTA] Auth endpoints tests - Update user by id', () => {

    before(async () => {
        if (process.env.NODE_ENV !== 'test') {
            throw Error(`Running the test suite with NODE_ENV ${process.env.NODE_ENV} may result in permanent data loss. Please use NODE_ENV=test.`);
        }

        requester = await getTestAgent();
    });

    it('Updating a user while not logged in should return a 401', async () => {
        const response: request.Response = await requester
            .patch(`/auth/user/1`)
            .set('Content-Type', 'application/json');

        response.status.should.equal(401);
        response.body.should.have.property('errors').and.be.an('array');
        response.body.errors[0].status.should.equal(401);
        response.body.errors[0].detail.should.equal('Not authenticated');
    });

    it('Updating a user while logged in as USER should return a 403', async () => {
        const user: OktaUser = getMockOktaUser({ role: 'USER' });
        const token: string = mockValidJWT({
            id: user.profile.legacyId,
            email: user.profile.email,
            role: user.profile.role,
            extraUserData: { apps: user.profile.apps },
        });

        const response: request.Response = await requester
            .patch(`/auth/user/1`)
            .set('Content-Type', 'application/json')
            .set('Authorization', `Bearer ${token}`);

        response.status.should.equal(403);
        response.body.should.have.property('errors').and.be.an('array');
        response.body.errors[0].status.should.equal(403);
        response.body.errors[0].detail.should.equal('Not authorized');
    });

    it('Updating a user while logged in as MANAGER should return a 403', async () => {
        const user: OktaUser = getMockOktaUser({ role: 'MANAGER' });
        const token: string = mockValidJWT({
            id: user.profile.legacyId,
            email: user.profile.email,
            role: user.profile.role,
            extraUserData: { apps: user.profile.apps },
        });

        const response: request.Response = await requester
            .patch(`/auth/user/1`)
            .set('Content-Type', 'application/json')
            .set('Authorization', `Bearer ${token}`);

        response.status.should.equal(403);
        response.body.should.have.property('errors').and.be.an('array');
        response.body.errors[0].status.should.equal(403);
        response.body.errors[0].detail.should.equal('Not authorized');
    });

    it('Updating a user with an id that does not match an existing user should return a 404', async () => {
        const token: string = mockValidJWT({ role: 'ADMIN' });
        mockGetUserByIdNotFound('1234');

        const response: request.Response = await requester
            .patch(`/auth/user/1234`)
            .set('Content-Type', 'application/json')
            .set('Authorization', `Bearer ${token}`);

        response.status.should.equal(404);
        response.body.should.have.property('errors').and.be.an('array');
        response.body.errors[0].status.should.equal(404);
        response.body.errors[0].detail.should.equal('User not found');
    });

    it('Updating an existing user should return a 200 and the updated user data', async () => {
        const userToBeUpdated: OktaUser = getMockOktaUser();
        const token: string = mockValidJWT({ role: 'ADMIN' });

        mockGetUserById(userToBeUpdated);
        mockOktaUpdateUser(userToBeUpdated, {
            displayName: 'changed name',
            photo: 'http://www.changed-photo.com',
            role: 'MANAGER',
            apps: ['changed-apps'],
        });

        const response: request.Response = await requester
            .patch(`/auth/user/${userToBeUpdated.profile.legacyId}`)
            .set('Content-Type', 'application/json')
            .set('Authorization', `Bearer ${token}`)
            .send({
                email: 'changed-email@example.com',
                password: 'changedPassword',
                salt: 'changedSalt',
                extraUserData: {
                    apps: ['changed-apps'],
                    foo: 'bar'
                },
                _id: 'changed-id',
                userToken: 'changedToken',
                createdAt: '2000-01-01T00:00:00.000Z',
                updatedAt: '2000-01-01T00:00:00.000Z',
                role: 'MANAGER',
                provider: 'changedProvider',
                name: 'changed name',
                photo: 'http://www.changed-photo.com'
            });

        response.status.should.equal(200);
        response.body.data.should.have.property('name').and.equal('changed name');
        response.body.data.should.have.property('photo').and.equal('http://www.changed-photo.com');
        response.body.data.should.have.property('extraUserData').and.be.an('object').and.deep.eql({ apps: ['changed-apps'] });
        response.body.data.should.have.property('role').and.equal('MANAGER');
        response.body.data.should.have.property('id').and.equal(userToBeUpdated.profile.legacyId);
        response.body.data.should.have.property('email').and.equal(userToBeUpdated.profile.email);
        response.body.data.should.have.property('applications').and.eql([]);
        response.body.data.should.have.property('organizations').and.eql([]);
        response.body.data.should.have.property('createdAt');
        response.body.data.should.have.property('updatedAt');
    });

    it('Redis cache is cleared after a user is updated', async () => {
        const userToBeUpdated: OktaUser = getMockOktaUser();
        const token: string = mockValidJWT({ role: 'ADMIN' });

        mockGetUserById(userToBeUpdated);
        mockOktaUpdateUser(userToBeUpdated, { displayName: 'changed name' });

        // Assert value does not exist in cache before
        const value: OktaUser = await CacheService.get(`okta-user-${userToBeUpdated.profile.legacyId}`);
        should.not.exist(value);

        // Store it in cache
        await CacheService.set(`okta-user-${userToBeUpdated.profile.legacyId}`, userToBeUpdated);
        const value2: OktaUser = await CacheService.get(`okta-user-${userToBeUpdated.profile.legacyId}`);
        should.exist(value2);

        const response: request.Response = await requester
            .patch(`/auth/user/${userToBeUpdated.profile.legacyId}`)
            .set('Content-Type', 'application/json')
            .set('Authorization', `Bearer ${token}`)
            .send({ name: 'changed name' });

        response.status.should.equal(200);

        // Assert value does not exist in cache after
        const value3: OktaUser = await CacheService.get(`okta-user-${userToBeUpdated.profile.legacyId}`);
        should.not.exist(value3);
    });

    describe('with associated applications', () => {
        it('Updating an user and associating an application with an existing user should be successful', async () => {
            const userToBeUpdated: OktaUser = getMockOktaUser();
            const token: string = mockValidJWT({ role: 'ADMIN' });

            const testOrganization: IOrganization = await createOrganization();
            const testApplication: IApplication = await createApplication();

            await new OrganizationApplicationModel({
                organization: testOrganization,
                application: testApplication
            }).save();

            mockGetUserById(userToBeUpdated);
            mockOktaUpdateUser(userToBeUpdated, {
                displayName: 'changed name',
                photo: 'https://www.changed-photo.com',
                role: 'MANAGER',
                apps: ['changed-apps']
            });

            const response: request.Response = await requester
                .patch(`/auth/user/${userToBeUpdated.profile.legacyId}`)
                .set('Content-Type', 'application/json')
                .set('Authorization', `Bearer ${token}`)
                .send({
                    email: 'changed-email@example.com',
                    password: 'changedPassword',
                    salt: 'changedSalt',
                    extraUserData: {
                        apps: ['changed-apps'],
                        foo: 'bar'
                    },
                    _id: 'changed-id',
                    userToken: 'changedToken',
                    createdAt: '2000-01-01T00:00:00.000Z',
                    updatedAt: '2000-01-01T00:00:00.000Z',
                    role: 'MANAGER',
                    provider: 'changedProvider',
                    name: 'changed name',
                    photo: 'https://www.changed-photo.com',
                    applications: [testApplication.id],
                });

            response.status.should.equal(200);
            response.body.data.should.have.property('name').and.equal('changed name');
            response.body.data.should.have.property('photo').and.equal('https://www.changed-photo.com');
            response.body.data.should.have.property('extraUserData').and.be.an('object').and.deep.eql({ apps: ['changed-apps'] });
            response.body.data.should.have.property('role').and.equal('MANAGER');
            response.body.data.should.have.property('id').and.equal(userToBeUpdated.profile.legacyId);
            response.body.data.should.have.property('email').and.equal(userToBeUpdated.profile.email);
            response.body.data.should.have.property('applications').and.eql([{
                id: testApplication.id,
                name: testApplication.name,
            }]);
            response.body.data.should.have.property('createdAt');
            response.body.data.should.have.property('updatedAt');

            await assertNoConnection({
                application: testApplication,
                organization: testOrganization
            });
            await assertNoConnection({ user: userToBeUpdated, organization: testOrganization });
            await assertConnection({ application: testApplication, user: userToBeUpdated });
        });

        it('Update an user and associating an application that\'s associated with a different user with the current user should be successful', async () => {
            const testApplication: HydratedDocument<IApplication> = await createApplication();

            const originalOwnerUser: OktaUser = getMockOktaUser();

            await new ApplicationUserModel({ userId: originalOwnerUser.id, application: testApplication }).save();

            const userToBeUpdated: OktaUser = getMockOktaUser();
            const token: string = mockValidJWT({ role: 'ADMIN' });

            mockGetUserById(userToBeUpdated);
            mockOktaUpdateUser(userToBeUpdated, {
                displayName: 'changed name',
                photo: 'https://www.changed-photo.com',
                role: 'MANAGER',
                apps: ['changed-apps'],
            });

            const response: request.Response = await requester
                .patch(`/auth/user/${userToBeUpdated.profile.legacyId}`)
                .set('Content-Type', 'application/json')
                .set('Authorization', `Bearer ${token}`)
                .send({
                    email: 'changed-email@example.com',
                    password: 'changedPassword',
                    salt: 'changedSalt',
                    extraUserData: {
                        apps: ['changed-apps'],
                        foo: 'bar'
                    },
                    _id: 'changed-id',
                    userToken: 'changedToken',
                    createdAt: '2000-01-01T00:00:00.000Z',
                    updatedAt: '2000-01-01T00:00:00.000Z',
                    role: 'MANAGER',
                    provider: 'changedProvider',
                    name: 'changed name',
                    photo: 'https://www.changed-photo.com',
                    applications: [testApplication.id],
                });

            response.status.should.equal(200);
            response.body.data.should.have.property('name').and.equal('changed name');
            response.body.data.should.have.property('photo').and.equal('https://www.changed-photo.com');
            response.body.data.should.have.property('extraUserData').and.be.an('object').and.deep.eql({ apps: ['changed-apps'] });
            response.body.data.should.have.property('role').and.equal('MANAGER');
            response.body.data.should.have.property('id').and.equal(userToBeUpdated.profile.legacyId);
            response.body.data.should.have.property('email').and.equal(userToBeUpdated.profile.email);
            response.body.data.should.have.property('applications').and.eql([{
                id: testApplication.id,
                name: testApplication.name
            }]);
            response.body.data.should.have.property('createdAt');
            response.body.data.should.have.property('updatedAt');

            await assertConnection({ application: testApplication, user: userToBeUpdated })
            await assertNoConnection({ application: testApplication, user: originalOwnerUser })
        });

        it('Update an user and associating an application that\'s associated with an organization user should be successful and remove association with organization', async () => {
            const testApplication: IApplication = await createApplication();
            const testOrganization: IOrganization = await createOrganization();

            const originalOwnerUser: OktaUser = getMockOktaUser();

            await new OrganizationApplicationModel({
                userId: originalOwnerUser.id,
                organization: testOrganization
            }).save();

            const userToBeUpdated: OktaUser = getMockOktaUser();
            const token: string = mockValidJWT({ role: 'ADMIN' });

            mockGetUserById(userToBeUpdated);
            mockOktaUpdateUser(userToBeUpdated, {
                displayName: 'changed name',
                photo: 'https://www.changed-photo.com',
                role: 'MANAGER',
                apps: ['changed-apps'],
            });

            const response: request.Response = await requester
                .patch(`/auth/user/${userToBeUpdated.profile.legacyId}`)
                .set('Content-Type', 'application/json')
                .set('Authorization', `Bearer ${token}`)
                .send({
                    email: 'changed-email@example.com',
                    password: 'changedPassword',
                    salt: 'changedSalt',
                    extraUserData: {
                        apps: ['changed-apps'],
                        foo: 'bar'
                    },
                    _id: 'changed-id',
                    userToken: 'changedToken',
                    createdAt: '2000-01-01T00:00:00.000Z',
                    updatedAt: '2000-01-01T00:00:00.000Z',
                    role: 'MANAGER',
                    provider: 'changedProvider',
                    name: 'changed name',
                    photo: 'https://www.changed-photo.com',
                    applications: [testApplication.id],
                });

            response.status.should.equal(200);
            response.body.data.should.have.property('name').and.equal('changed name');
            response.body.data.should.have.property('photo').and.equal('https://www.changed-photo.com');
            response.body.data.should.have.property('extraUserData').and.be.an('object').and.deep.eql({ apps: ['changed-apps'] });
            response.body.data.should.have.property('role').and.equal('MANAGER');
            response.body.data.should.have.property('id').and.equal(userToBeUpdated.profile.legacyId);
            response.body.data.should.have.property('email').and.equal(userToBeUpdated.profile.email);
            response.body.data.should.have.property('applications').and.eql([{
                id: testApplication.id,
                name: testApplication.name
            }]);
            response.body.data.should.have.property('createdAt');
            response.body.data.should.have.property('updatedAt');

            await assertConnection({ application: testApplication, user: userToBeUpdated })
            await assertNoConnection({ organization: testOrganization, user: originalOwnerUser })
        });

        it('Update an user and overwriting existing applications should be successful', async () => {
            const testApplicationOne: HydratedDocument<IApplication> = await createApplication();
            const testApplicationTwo: HydratedDocument<IApplication> = await createApplication();

            const userToBeUpdated: OktaUser = getMockOktaUser({ applications: [testApplicationOne.id] });

            await new ApplicationUserModel({ userId: userToBeUpdated.id, application: testApplicationOne }).save();

            const token: string = mockValidJWT({ role: 'ADMIN' });

            mockGetUserById(userToBeUpdated);
            mockOktaUpdateUser(userToBeUpdated, {
                displayName: 'changed name',
                photo: 'https://www.changed-photo.com',
                role: 'MANAGER',
                apps: ['changed-apps'],
            });

            const response: request.Response = await requester
                .patch(`/auth/user/${userToBeUpdated.profile.legacyId}`)
                .set('Content-Type', 'application/json')
                .set('Authorization', `Bearer ${token}`)
                .send({
                    email: 'changed-email@example.com',
                    password: 'changedPassword',
                    salt: 'changedSalt',
                    extraUserData: {
                        apps: ['changed-apps'],
                        foo: 'bar'
                    },
                    _id: 'changed-id',
                    userToken: 'changedToken',
                    createdAt: '2000-01-01T00:00:00.000Z',
                    updatedAt: '2000-01-01T00:00:00.000Z',
                    role: 'MANAGER',
                    provider: 'changedProvider',
                    name: 'changed name',
                    photo: 'https://www.changed-photo.com',
                    applications: [testApplicationTwo.id],
                });

            response.status.should.equal(200);
            response.body.data.should.have.property('name').and.equal('changed name');
            response.body.data.should.have.property('photo').and.equal('https://www.changed-photo.com');
            response.body.data.should.have.property('extraUserData').and.be.an('object').and.deep.eql({ apps: ['changed-apps'] });
            response.body.data.should.have.property('role').and.equal('MANAGER');
            response.body.data.should.have.property('id').and.equal(userToBeUpdated.profile.legacyId);
            response.body.data.should.have.property('email').and.equal(userToBeUpdated.profile.email);
            response.body.data.should.have.property('applications').and.eql([{
                id: testApplicationTwo.id,
                name: testApplicationTwo.name,
            }]);
            response.body.data.should.have.property('createdAt');
            response.body.data.should.have.property('updatedAt');

            await assertNoConnection({ application: testApplicationOne, user: userToBeUpdated })
            await assertConnection({ application: testApplicationTwo, user: userToBeUpdated })
        });

        it('Update an user and removing applications should be successful', async () => {
            const testApplication: HydratedDocument<IApplication> = await createApplication();

            const userToBeUpdated: OktaUser = getMockOktaUser();
            const token: string = mockValidJWT({ role: 'ADMIN' });

            await new ApplicationUserModel({ userId: userToBeUpdated.id, application: testApplication }).save();

            mockGetUserById(userToBeUpdated);
            mockOktaUpdateUser(userToBeUpdated, {
                displayName: 'changed name',
                photo: 'https://www.changed-photo.com',
                role: 'MANAGER',
                apps: ['changed-apps'],
            });

            const response: request.Response = await requester
                .patch(`/auth/user/${userToBeUpdated.profile.legacyId}`)
                .set('Content-Type', 'application/json')
                .set('Authorization', `Bearer ${token}`)
                .send({
                    email: 'changed-email@example.com',
                    password: 'changedPassword',
                    salt: 'changedSalt',
                    extraUserData: {
                        apps: ['changed-apps'],
                        foo: 'bar'
                    },
                    _id: 'changed-id',
                    userToken: 'changedToken',
                    createdAt: '2000-01-01T00:00:00.000Z',
                    updatedAt: '2000-01-01T00:00:00.000Z',
                    role: 'MANAGER',
                    provider: 'changedProvider',
                    name: 'changed name',
                    photo: 'https://www.changed-photo.com',
                    applications: [],
                });

            response.status.should.equal(200);
            response.body.data.should.have.property('name').and.equal('changed name');
            response.body.data.should.have.property('photo').and.equal('https://www.changed-photo.com');
            response.body.data.should.have.property('extraUserData').and.be.an('object').and.deep.eql({ apps: ['changed-apps'] });
            response.body.data.should.have.property('role').and.equal('MANAGER');
            response.body.data.should.have.property('id').and.equal(userToBeUpdated.profile.legacyId);
            response.body.data.should.have.property('email').and.equal(userToBeUpdated.profile.email);
            response.body.data.should.have.property('applications').and.eql([]);
            response.body.data.should.have.property('createdAt');
            response.body.data.should.have.property('updatedAt');

            await assertNoConnection({ application: testApplication, user: null });
        });
    })

    describe('with associated organizations', () => {
        it('Updating an user and associating an organization with an existing user should be successful', async () => {
            const userToBeUpdated: OktaUser = getMockOktaUser();
            const token: string = mockValidJWT({ role: 'ADMIN' });

            const testApplication: IApplication = await createApplication();
            const testOrganization: IOrganization = await createOrganization();

            await new OrganizationApplicationModel({
                application: testApplication,
                organization: testOrganization
            }).save();

            mockGetUserById(userToBeUpdated);
            mockOktaUpdateUser(userToBeUpdated, {
                displayName: 'changed name',
                photo: 'https://www.changed-photo.com',
                role: 'MANAGER',
                apps: ['changed-apps']
            });

            const response: request.Response = await requester
                .patch(`/auth/user/${userToBeUpdated.profile.legacyId}`)
                .set('Content-Type', 'application/json')
                .set('Authorization', `Bearer ${token}`)
                .send({
                    email: 'changed-email@example.com',
                    password: 'changedPassword',
                    salt: 'changedSalt',
                    extraUserData: {
                        apps: ['changed-apps'],
                        foo: 'bar'
                    },
                    _id: 'changed-id',
                    userToken: 'changedToken',
                    createdAt: '2000-01-01T00:00:00.000Z',
                    updatedAt: '2000-01-01T00:00:00.000Z',
                    role: 'MANAGER',
                    provider: 'changedProvider',
                    name: 'changed name',
                    photo: 'https://www.changed-photo.com',
                    organizations: [{
                        id: testOrganization.id,
                        role: 'ORG_ADMIN'
                    }],
                });

            response.status.should.equal(200);
            response.body.data.should.have.property('name').and.equal('changed name');
            response.body.data.should.have.property('photo').and.equal('https://www.changed-photo.com');
            response.body.data.should.have.property('extraUserData').and.be.an('object').and.deep.eql({ apps: ['changed-apps'] });
            response.body.data.should.have.property('role').and.equal('MANAGER');
            response.body.data.should.have.property('id').and.equal(userToBeUpdated.profile.legacyId);
            response.body.data.should.have.property('email').and.equal(userToBeUpdated.profile.email);
            response.body.data.should.have.property('organizations').and.eql([{
                id: testOrganization.id,
                name: testOrganization.name,
                role: 'ORG_ADMIN'
            }]);
            response.body.data.should.have.property('createdAt');
            response.body.data.should.have.property('updatedAt');

            await assertConnection({ organization: testOrganization, application: testApplication });
            await assertNoConnection({ user: userToBeUpdated, application: testApplication });
            await assertConnection({ organization: testOrganization, user: userToBeUpdated });
        });

        it('Update an user and associating an organization that\'s associated with a different user should be successful and not remove previous user association', async () => {
            const testOrganization: HydratedDocument<IOrganization> = await createOrganization();

            const originalUser: OktaUser = getMockOktaUser({ organizations: [testOrganization.id] });

            await new OrganizationUserModel({
                userId: originalUser.profile.legacyId,
                organization: testOrganization,
                role: 'ORG_ADMIN'
            }).save();

            const userToBeUpdated: OktaUser = getMockOktaUser();
            const token: string = mockValidJWT({ role: 'ADMIN' });

            mockGetUserById(userToBeUpdated);
            mockOktaUpdateUser(userToBeUpdated, {
                displayName: 'changed name',
                photo: 'https://www.changed-photo.com',
                role: 'MANAGER',
                apps: ['changed-apps'],
            });

            const response: request.Response = await requester
                .patch(`/auth/user/${userToBeUpdated.profile.legacyId}`)
                .set('Content-Type', 'application/json')
                .set('Authorization', `Bearer ${token}`)
                .send({
                    email: 'changed-email@example.com',
                    password: 'changedPassword',
                    salt: 'changedSalt',
                    extraUserData: {
                        apps: ['changed-apps'],
                        foo: 'bar'
                    },
                    _id: 'changed-id',
                    userToken: 'changedToken',
                    createdAt: '2000-01-01T00:00:00.000Z',
                    updatedAt: '2000-01-01T00:00:00.000Z',
                    role: 'MANAGER',
                    provider: 'changedProvider',
                    name: 'changed name',
                    photo: 'https://www.changed-photo.com',
                    organizations: [{ id: testOrganization.id, role: 'ORG_ADMIN' }],
                });

            response.status.should.equal(200);
            response.body.data.should.have.property('name').and.equal('changed name');
            response.body.data.should.have.property('photo').and.equal('https://www.changed-photo.com');
            response.body.data.should.have.property('extraUserData').and.be.an('object').and.deep.eql({ apps: ['changed-apps'] });
            response.body.data.should.have.property('role').and.equal('MANAGER');
            response.body.data.should.have.property('id').and.equal(userToBeUpdated.profile.legacyId);
            response.body.data.should.have.property('email').and.equal(userToBeUpdated.profile.email);
            response.body.data.should.have.property('organizations').and.eql([{
                id: testOrganization.id,
                name: testOrganization.name,
                role: 'ORG_ADMIN'
            }]);
            response.body.data.should.have.property('createdAt');
            response.body.data.should.have.property('updatedAt');

            await assertConnection({ organization: testOrganization, user: userToBeUpdated })
            await assertConnection({ organization: testOrganization, user: originalUser })
        });

        it('Update an user and associating an organization that\'s associated with an application user should be successful and not remove association with application', async () => {
            const testOrganization: IOrganization = await createOrganization();
            const testOrganizationApplication: IApplication = await createApplication();
            const testUserApplication: IApplication = await createApplication();

            const originalOwnerUser: OktaUser = getMockOktaUser({ organizations: [testOrganization.id] });

            const userToBeUpdated: OktaUser = getMockOktaUser();
            const token: string = mockValidJWT({ role: 'ADMIN' });

            await new OrganizationApplicationModel({
                organization: testOrganization,
                application: testOrganizationApplication
            }).save();

            await new ApplicationUserModel({
                userId: userToBeUpdated.profile.legacyId,
                application: testUserApplication
            }).save();

            mockGetUserById(userToBeUpdated);
            mockOktaUpdateUser(userToBeUpdated, {
                displayName: 'changed name',
                photo: 'https://www.changed-photo.com',
                role: 'MANAGER',
                apps: ['changed-apps'],
            });

            const response: request.Response = await requester
                .patch(`/auth/user/${userToBeUpdated.profile.legacyId}`)
                .set('Content-Type', 'application/json')
                .set('Authorization', `Bearer ${token}`)
                .send({
                    email: 'changed-email@example.com',
                    password: 'changedPassword',
                    salt: 'changedSalt',
                    extraUserData: {
                        apps: ['changed-apps'],
                        foo: 'bar'
                    },
                    _id: 'changed-id',
                    userToken: 'changedToken',
                    createdAt: '2000-01-01T00:00:00.000Z',
                    updatedAt: '2000-01-01T00:00:00.000Z',
                    role: 'MANAGER',
                    provider: 'changedProvider',
                    name: 'changed name',
                    photo: 'https://www.changed-photo.com',
                    organizations: [{ id: testOrganization.id, role: 'ORG_ADMIN' }],
                });

            response.status.should.equal(200);
            response.body.data.should.have.property('name').and.equal('changed name');
            response.body.data.should.have.property('photo').and.equal('https://www.changed-photo.com');
            response.body.data.should.have.property('extraUserData').and.be.an('object').and.deep.eql({ apps: ['changed-apps'] });
            response.body.data.should.have.property('role').and.equal('MANAGER');
            response.body.data.should.have.property('id').and.equal(userToBeUpdated.profile.legacyId);
            response.body.data.should.have.property('email').and.equal(userToBeUpdated.profile.email);
            response.body.data.should.have.property('organizations').and.eql([{
                id: testOrganization.id,
                name: testOrganization.name,
                role: 'ORG_ADMIN'
            }]);
            response.body.data.should.have.property('createdAt');
            response.body.data.should.have.property('updatedAt');

            await assertConnection({ organization: testOrganization, user: userToBeUpdated })
            await assertConnection({ application: testUserApplication, user: userToBeUpdated })
            await assertNoConnection({ application: testOrganizationApplication, user: originalOwnerUser })
        });

        it('Update an user and overwriting existing organizations should be successful', async () => {
            const testOrganizationOne: HydratedDocument<IOrganization> = await createOrganization();
            const testOrganizationTwo: HydratedDocument<IOrganization> = await createOrganization();

            const userToBeUpdated: OktaUser = getMockOktaUser({ organizations: [testOrganizationOne.id] });

            await new OrganizationUserModel({
                userId: userToBeUpdated.id,
                organization: testOrganizationOne,
                role: 'ADMIN'
            }).save();

            const token: string = mockValidJWT({ role: 'ADMIN' });

            mockGetUserById(userToBeUpdated);
            mockOktaUpdateUser(userToBeUpdated, {
                displayName: 'changed name',
                photo: 'https://www.changed-photo.com',
                role: 'MANAGER',
                apps: ['changed-apps'],
            });

            const response: request.Response = await requester
                .patch(`/auth/user/${userToBeUpdated.profile.legacyId}`)
                .set('Content-Type', 'application/json')
                .set('Authorization', `Bearer ${token}`)
                .send({
                    email: 'changed-email@example.com',
                    password: 'changedPassword',
                    salt: 'changedSalt',
                    extraUserData: {
                        apps: ['changed-apps'],
                        foo: 'bar'
                    },
                    _id: 'changed-id',
                    userToken: 'changedToken',
                    createdAt: '2000-01-01T00:00:00.000Z',
                    updatedAt: '2000-01-01T00:00:00.000Z',
                    role: 'MANAGER',
                    provider: 'changedProvider',
                    name: 'changed name',
                    photo: 'https://www.changed-photo.com',
                    organizations: [{ id: testOrganizationTwo.id, role: 'ORG_ADMIN' }],
                });

            response.status.should.equal(200);
            response.body.data.should.have.property('name').and.equal('changed name');
            response.body.data.should.have.property('photo').and.equal('https://www.changed-photo.com');
            response.body.data.should.have.property('extraUserData').and.be.an('object').and.deep.eql({ apps: ['changed-apps'] });
            response.body.data.should.have.property('role').and.equal('MANAGER');
            response.body.data.should.have.property('id').and.equal(userToBeUpdated.profile.legacyId);
            response.body.data.should.have.property('email').and.equal(userToBeUpdated.profile.email);
            response.body.data.should.have.property('organizations').and.eql([{
                id: testOrganizationTwo.id,
                name: testOrganizationTwo.name,
                role: 'ORG_ADMIN'
            }]);
            response.body.data.should.have.property('createdAt');
            response.body.data.should.have.property('updatedAt');

            await assertNoConnection({ organization: testOrganizationOne, user: userToBeUpdated })
            await assertConnection({ organization: testOrganizationTwo, user: userToBeUpdated })
        });

        it('Update an user and removing organizations should be successful', async () => {
            const testOrganization: HydratedDocument<IOrganization> = await createOrganization();

            const userToBeUpdated: OktaUser = getMockOktaUser({ organizations: [testOrganization.id] });
            const token: string = mockValidJWT({ role: 'ADMIN' });

            await new OrganizationUserModel({
                userId: userToBeUpdated.id,
                organization: testOrganization,
                role: 'ADMIN'
            }).save();

            mockGetUserById(userToBeUpdated);
            mockOktaUpdateUser(userToBeUpdated, {
                displayName: 'changed name',
                photo: 'https://www.changed-photo.com',
                role: 'MANAGER',
                apps: ['changed-apps'],
            });

            const response: request.Response = await requester
                .patch(`/auth/user/${userToBeUpdated.profile.legacyId}`)
                .set('Content-Type', 'application/json')
                .set('Authorization', `Bearer ${token}`)
                .send({
                    email: 'changed-email@example.com',
                    password: 'changedPassword',
                    salt: 'changedSalt',
                    extraUserData: {
                        apps: ['changed-apps'],
                        foo: 'bar'
                    },
                    _id: 'changed-id',
                    userToken: 'changedToken',
                    createdAt: '2000-01-01T00:00:00.000Z',
                    updatedAt: '2000-01-01T00:00:00.000Z',
                    role: 'MANAGER',
                    provider: 'changedProvider',
                    name: 'changed name',
                    photo: 'https://www.changed-photo.com',
                    organizations: [],
                });

            response.status.should.equal(200);
            response.body.data.should.have.property('name').and.equal('changed name');
            response.body.data.should.have.property('photo').and.equal('https://www.changed-photo.com');
            response.body.data.should.have.property('extraUserData').and.be.an('object').and.deep.eql({ apps: ['changed-apps'] });
            response.body.data.should.have.property('role').and.equal('MANAGER');
            response.body.data.should.have.property('id').and.equal(userToBeUpdated.profile.legacyId);
            response.body.data.should.have.property('email').and.equal(userToBeUpdated.profile.email);
            response.body.data.should.have.property('organizations').and.eql([]);
            response.body.data.should.have.property('createdAt');
            response.body.data.should.have.property('updatedAt');

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
})
;
