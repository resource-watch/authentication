import nock from 'nock';
import chai, { expect } from 'chai';
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
import ApplicationUserModel, { IApplicationUser } from "models/application-user";
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

        mockGetUserById(userToBeUpdated, 2);
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
        response.body.data.should.have.property('createdAt');
        response.body.data.should.have.property('updatedAt');
    });

    it('Redis cache is cleared after a user is updated', async () => {
        const userToBeUpdated: OktaUser = getMockOktaUser();
        const token: string = mockValidJWT({ role: 'ADMIN' });

        mockGetUserById(userToBeUpdated, 2);
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
        it('Associating an application with an existing user should be successful', async () => {
            const userToBeUpdated: OktaUser = getMockOktaUser();
            const token: string = mockValidJWT({ role: 'ADMIN' });

            const testOrganization: IOrganization = await createOrganization();
            const testApplication: IApplication = await createApplication();

            await new OrganizationApplicationModel({
                organization: testOrganization,
                application: testApplication
            }).save();

            mockGetUserById(userToBeUpdated, 2);
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

        it('Removing the association between an application and an user should be successful', async () => {
            const testApplication: HydratedDocument<IApplication> = await createApplication();

            const userToBeUpdated: OktaUser = getMockOktaUser({ applications: [testApplication.id] });
            const token: string = mockValidJWT({ role: 'ADMIN' });

            await new ApplicationUserModel({ userId: userToBeUpdated.id, application: testApplication }).save();

            mockGetUserById(userToBeUpdated, 2);
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

        it('Associating an application that\'s associated with a different user with the current user should be successful', async () => {
            const testApplication: HydratedDocument<IApplication> = await createApplication();

            const originalOwnerUser: OktaUser = getMockOktaUser({ applications: [testApplication.id] });

            await new ApplicationUserModel({ userId: originalOwnerUser.id, application: testApplication }).save();

            const userToBeUpdated: OktaUser = getMockOktaUser();
            const token: string = mockValidJWT({ role: 'ADMIN' });

            await testApplication.save();

            mockGetUserById(userToBeUpdated, 2);
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
        });

        it('Replace a user\'s applications should be successful', async () => {
            const testApplicationOne: HydratedDocument<IApplication> = await createApplication();
            const testApplicationTwo: HydratedDocument<IApplication> = await createApplication();

            const userToBeUpdated: OktaUser = getMockOktaUser({ applications: [testApplicationOne.id] });

            await new ApplicationUserModel({ userId: userToBeUpdated.id, application: testApplicationOne }).save();

            const token: string = mockValidJWT({ role: 'ADMIN' });

            mockGetUserById(userToBeUpdated, 2);
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
    })

    describe('with associated organizations', () => {
        it('Associating an organization with an existing user should be successful', async () => {
            const userToBeUpdated: OktaUser = getMockOktaUser();
            const token: string = mockValidJWT({ role: 'ADMIN' });

            const testApplication: IApplication = await createApplication();
            const testOrganization: IOrganization = await createOrganization();

            await new OrganizationApplicationModel({ application: testApplication, organization: testOrganization });

            mockGetUserById(userToBeUpdated, 2);
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
                    organization: {
                        id: testOrganization.id,
                        role: 'ADMIN'
                    },
                });

            response.status.should.equal(200);
            response.body.data.should.have.property('name').and.equal('changed name');
            response.body.data.should.have.property('photo').and.equal('https://www.changed-photo.com');
            response.body.data.should.have.property('extraUserData').and.be.an('object').and.deep.eql({ apps: ['changed-apps'] });
            response.body.data.should.have.property('role').and.equal('MANAGER');
            response.body.data.should.have.property('id').and.equal(userToBeUpdated.profile.legacyId);
            response.body.data.should.have.property('email').and.equal(userToBeUpdated.profile.email);
            response.body.data.should.have.property('organization').and.eql({
                id: testOrganization.id,
                name: testOrganization.name,
                role: 'ADMIN'
            });
            response.body.data.should.have.property('createdAt');
            response.body.data.should.have.property('updatedAt');

            await assertConnection({ organization: testOrganization, user: userToBeUpdated, role: 'ADMIN' })
            await assertNoConnection({ organization: testOrganization, application: testApplication })
        });

        it('Removing the association between an organization and an user should be successful', async () => {
            const testOrganization: HydratedDocument<IOrganization> = await createOrganization();

            const userToBeUpdated: OktaUser = getMockOktaUser();
            const token: string = mockValidJWT({ role: 'ADMIN' });

            await new OrganizationUserModel({ userId: userToBeUpdated.id, organization: testOrganization });

            mockGetUserById(userToBeUpdated, 2);
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
                    organization: null,
                });

            response.status.should.equal(200);
            response.body.data.should.have.property('name').and.equal('changed name');
            response.body.data.should.have.property('photo').and.equal('https://www.changed-photo.com');
            response.body.data.should.have.property('extraUserData').and.be.an('object').and.deep.eql({ apps: ['changed-apps'] });
            response.body.data.should.have.property('role').and.equal('MANAGER');
            response.body.data.should.have.property('id').and.equal(userToBeUpdated.profile.legacyId);
            response.body.data.should.have.property('email').and.equal(userToBeUpdated.profile.email);
            response.body.data.should.have.property('organization').and.equal(null);
            response.body.data.should.have.property('createdAt');
            response.body.data.should.have.property('updatedAt');

            await assertNoConnection({ organization: testOrganization, user: userToBeUpdated })
        });
        //
        // it('Associating an organization that\'s associated with a different user with the current user should be successful', async () => {
        //     const testOrganization: HydratedDocument<IOrganization> = await createOrganization();
        //
        //     const originalOwnerUser: OktaUser = getMockOktaUser({ organizations: [testOrganization.id] });
        //
        //     testOrganization.userId = originalOwnerUser.profile.legacyId;
        //     await testOrganization.save();
        //
        //     const userToBeUpdated: OktaUser = getMockOktaUser();
        //     const token: string = mockValidJWT({ role: 'ADMIN' });
        //
        //     mockGetUserById(originalOwnerUser, 2);
        //     mockGetUserById(userToBeUpdated, 3);
        //     mockOktaUpdateUser(userToBeUpdated, {
        //         organizations: [],
        //     });
        //     mockOktaUpdateUser(userToBeUpdated, {
        //         displayName: 'changed name',
        //         photo: 'https://www.changed-photo.com',
        //         role: 'MANAGER',
        //         apps: ['changed-apps'],
        //         organizations: [testOrganization.id],
        //     });
        //     mockOktaUpdateUser(originalOwnerUser, {
        //         organizations: [],
        //     });
        //
        //     const response: request.Response = await requester
        //         .patch(`/auth/user/${userToBeUpdated.profile.legacyId}`)
        //         .set('Content-Type', 'application/json')
        //         .set('Authorization', `Bearer ${token}`)
        //         .send({
        //             email: 'changed-email@example.com',
        //             password: 'changedPassword',
        //             salt: 'changedSalt',
        //             extraUserData: {
        //                 apps: ['changed-apps'],
        //                 foo: 'bar'
        //             },
        //             _id: 'changed-id',
        //             userToken: 'changedToken',
        //             createdAt: '2000-01-01T00:00:00.000Z',
        //             updatedAt: '2000-01-01T00:00:00.000Z',
        //             role: 'MANAGER',
        //             provider: 'changedProvider',
        //             name: 'changed name',
        //             photo: 'https://www.changed-photo.com',
        //             organizations: [testOrganization.id],
        //         });
        //
        //     response.status.should.equal(200);
        //     response.body.data.should.have.property('name').and.equal('changed name');
        //     response.body.data.should.have.property('photo').and.equal('https://www.changed-photo.com');
        //     response.body.data.should.have.property('extraUserData').and.be.an('object').and.deep.eql({ apps: ['changed-apps'] });
        //     response.body.data.should.have.property('role').and.equal('MANAGER');
        //     response.body.data.should.have.property('id').and.equal(userToBeUpdated.profile.legacyId);
        //     response.body.data.should.have.property('email').and.equal(userToBeUpdated.profile.email);
        //     response.body.data.should.have.property('organizations').and.eql([testOrganization.id]);
        //     response.body.data.should.have.property('createdAt');
        //     response.body.data.should.have.property('updatedAt');
        //
        //     const databaseOrganization: IOrganization = await OrganizationModel.findById(testOrganization.id).populate('applications');
        //     expect(databaseOrganization.applications).to.equal(undefined);
        //     expect(databaseOrganization.userId).to.equal(userToBeUpdated.profile.legacyId);
        // });
        //
        // it('Replace a user\'s organizations should be successful', async () => {
        //     const testOrganizationOne: HydratedDocument<IOrganization> = await createOrganization();
        //     const testOrganizationTwo: HydratedDocument<IOrganization> = await createOrganization();
        //
        //     const userToBeUpdated: OktaUser = getMockOktaUser({ organizations: [testOrganizationOne.id] });
        //
        //     testOrganizationOne.userId = userToBeUpdated.profile.legacyId;
        //     await testOrganizationOne.save();
        //
        //     const token: string = mockValidJWT({ role: 'ADMIN' });
        //
        //     mockGetUserById(userToBeUpdated, 5);
        //     mockOktaUpdateUser(userToBeUpdated, {
        //         organizations: [],
        //     }, 2);
        //     mockOktaUpdateUser(userToBeUpdated, {
        //         displayName: 'changed name',
        //         photo: 'https://www.changed-photo.com',
        //         role: 'MANAGER',
        //         apps: ['changed-apps'],
        //         organizations: [testOrganizationTwo.id],
        //     });
        //
        //     const response: request.Response = await requester
        //         .patch(`/auth/user/${userToBeUpdated.profile.legacyId}`)
        //         .set('Content-Type', 'application/json')
        //         .set('Authorization', `Bearer ${token}`)
        //         .send({
        //             email: 'changed-email@example.com',
        //             password: 'changedPassword',
        //             salt: 'changedSalt',
        //             extraUserData: {
        //                 apps: ['changed-apps'],
        //                 foo: 'bar'
        //             },
        //             _id: 'changed-id',
        //             userToken: 'changedToken',
        //             createdAt: '2000-01-01T00:00:00.000Z',
        //             updatedAt: '2000-01-01T00:00:00.000Z',
        //             role: 'MANAGER',
        //             provider: 'changedProvider',
        //             name: 'changed name',
        //             photo: 'https://www.changed-photo.com',
        //             organizations: [testOrganizationTwo.id],
        //         });
        //
        //     response.status.should.equal(200);
        //     response.body.data.should.have.property('name').and.equal('changed name');
        //     response.body.data.should.have.property('photo').and.equal('https://www.changed-photo.com');
        //     response.body.data.should.have.property('extraUserData').and.be.an('object').and.deep.eql({ apps: ['changed-apps'] });
        //     response.body.data.should.have.property('role').and.equal('MANAGER');
        //     response.body.data.should.have.property('id').and.equal(userToBeUpdated.profile.legacyId);
        //     response.body.data.should.have.property('email').and.equal(userToBeUpdated.profile.email);
        //     response.body.data.should.have.property('organizations').and.eql([testOrganizationTwo.id]);
        //     response.body.data.should.have.property('createdAt');
        //     response.body.data.should.have.property('updatedAt');
        //
        //     const databaseOrganizationOne: IOrganization = await OrganizationModel.findById(testOrganizationOne.id).populate('applications');
        //     expect(databaseOrganizationOne.applications).to.equal(undefined);
        //     expect(databaseOrganizationOne.userId).to.equal(null);
        //
        //     const databaseOrganizationTwo: IOrganization = await OrganizationModel.findById(testOrganizationTwo.id).populate('applications');
        //     expect(databaseOrganizationTwo.applications).to.equal(undefined);
        //     expect(databaseOrganizationTwo.userId).to.equal(userToBeUpdated.profile.legacyId);
        // });
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
