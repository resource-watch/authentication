import nock from 'nock';
import chai from 'chai';
import type request from 'superagent';
import { OktaUser } from 'services/okta.interfaces';
import { closeTestAgent, getTestAgent } from '../utils/test-server';
import {
    getMockOktaUser, mockGetUserById,
    mockGetUserByIdNotFound, mockGetUserByOktaId,
    mockOktaDeleteUser,
    mockValidJWT,
    mockMicroserviceJWT,
} from './okta.mocks';
import CacheService from 'services/cache.service';
import Should = Chai.Should;
import config from 'config';
import DeletionModel, { IDeletion } from 'models/deletion';
import { mockDeleteResourcesCalls } from "../utils/mocks";
import OrganizationModel, { IOrganization } from "models/organization";
import { assertNoConnection, createApplication, createOrganization } from "../utils/helpers";
import ApplicationModel, { IApplication } from "models/application";
import OrganizationApplicationModel from "models/organization-application";
import ApplicationUserModel from "models/application-user";
import OrganizationUserModel from "models/organization-user";

const should: Should = chai.should();

let requester: ChaiHttp.Agent;

nock.disableNetConnect();
nock.enableNetConnect(process.env.HOST_IP);

describe('[OKTA] User management endpoints tests - Delete user', () => {

    before(async () => {
        if (process.env.NODE_ENV !== 'test') {
            throw Error(`Running the test suite with NODE_ENV ${process.env.NODE_ENV} may result in permanent data loss. Please use NODE_ENV=test.`);
        }

        requester = await getTestAgent();
    });

    it('Deleting a user while not logged in should return 401 Unauthorized', async () => {
        const response: request.Response = await requester
            .delete(`/auth/user/123`)
            .set('Content-Type', 'application/json');

        response.status.should.equal(401);
        response.body.should.have.property('errors').and.be.an('array');
        response.body.errors[0].status.should.equal(401);
        response.body.errors[0].detail.should.equal('Not authenticated');
    });

    it('Deleting a user while logged in as a USER should return 403 Forbidden', async () => {
        const token: string = mockValidJWT({ role: 'USER' });
        const response: request.Response = await requester
            .delete(`/auth/user/123`)
            .set('Content-Type', 'application/json')
            .set('Authorization', `Bearer ${token}`);

        response.status.should.equal(403);
        response.body.should.have.property('errors').and.be.an('array');
        response.body.errors[0].status.should.equal(403);
        response.body.errors[0].detail.should.equal('Not authorized');
    });

    it('Deleting a user while logged in as a MANAGER should return 403 Forbidden', async () => {
        const token: string = mockValidJWT({ role: 'MANAGER' });
        const response: request.Response = await requester
            .delete(`/auth/user/123`)
            .set('Content-Type', 'application/json')
            .set('Authorization', `Bearer ${token}`);

        response.status.should.equal(403);
        response.body.should.have.property('errors').and.be.an('array');
        response.body.errors[0].status.should.equal(403);
        response.body.errors[0].detail.should.equal('Not authorized');
    });

    it('Deleting a non-existing user while logged in as an ADMIN should return 404 Not Found', async () => {
        const token: string = mockValidJWT({ role: 'ADMIN' });
        mockGetUserByIdNotFound('123');

        const response: request.Response = await requester
            .delete(`/auth/user/123`)
            .set('Content-Type', 'application/json')
            .set('Authorization', `Bearer ${token}`);

        response.status.should.equal(404);
        response.body.should.have.property('errors').and.be.an('array');
        response.body.errors[0].status.should.equal(404);
        response.body.errors[0].detail.should.equal('User not found');
    });

    it('Deleting a existing user while logged in as an ADMIN should return 200 OK with the deleted user data', async () => {
        const token: string = mockValidJWT({ role: 'ADMIN' });
        const user: OktaUser = getMockOktaUser();

        mockGetUserById(user, 2);
        mockOktaDeleteUser(user);
        mockGetUserByOktaId(user.id, user, 1);
        mockOktaDeleteUser(user);
        mockDeleteResourcesCalls(user.profile.legacyId);

        const response: request.Response = await requester
            .delete(`/auth/user/${user.profile.legacyId}`)
            .set('Content-Type', 'application/json')
            .set('Authorization', `Bearer ${token}`);

        response.status.should.equal(200);
        response.body.should.be.an('object');
        response.body.data.should.have.property('id').and.eql(user.profile.legacyId);

        const databaseDeletion: IDeletion = await DeletionModel.findOne({ userId: user.profile.legacyId });
        chai.expect(databaseDeletion).to.not.be.null;
        databaseDeletion.should.have.property('datasetsDeleted').and.equal(true)
        databaseDeletion.should.have.property('layersDeleted').and.equal(true)
        databaseDeletion.should.have.property('widgetsDeleted').and.equal(true)
        databaseDeletion.should.have.property('userAccountDeleted').and.equal(true)
        databaseDeletion.should.have.property('userDataDeleted').and.equal(true)
        databaseDeletion.should.have.property('collectionsDeleted').and.equal(true)
        databaseDeletion.should.have.property('favouritesDeleted').and.equal(true)
        databaseDeletion.should.have.property('areasDeleted').and.equal(true)
        databaseDeletion.should.have.property('storiesDeleted').and.equal(true)
        databaseDeletion.should.have.property('subscriptionsDeleted').and.equal(true)
        databaseDeletion.should.have.property('dashboardsDeleted').and.equal(true)
        databaseDeletion.should.have.property('profilesDeleted').and.equal(true)
        databaseDeletion.should.have.property('topicsDeleted').and.equal(true)
        databaseDeletion.should.have.property('status').and.equal('done')
    });

    it('Deleting a existing user while logged in as a MICROSERVICE should return 200 OK with the deleted user data', async () => {
        const token: string = mockMicroserviceJWT();
        const user: OktaUser = getMockOktaUser();

        mockGetUserById(user, 2);
        mockOktaDeleteUser(user);
        mockGetUserByOktaId(user.id, user, 1);
        mockOktaDeleteUser(user);
        mockDeleteResourcesCalls(user.profile.legacyId);

        const response: request.Response = await requester
            .delete(`/auth/user/${user.profile.legacyId}`)
            .set('Content-Type', 'application/json')
            .set('Authorization', `Bearer ${token}`);

        response.status.should.equal(200);
        response.body.should.be.an('object');
        response.body.data.should.have.property('id').and.eql(user.profile.legacyId);

        const databaseDeletion: IDeletion = await DeletionModel.findOne({ userId: user.profile.legacyId });
        chai.expect(databaseDeletion).to.not.be.null;
    });

    it('Deleting an existing user with USER role while logged as that user should return 200 OK with the deleted user data', async () => {
        const user: OktaUser = getMockOktaUser();
        const token: string = mockValidJWT({ role: 'USER', id: user.profile.legacyId });

        mockGetUserById(user, 2);
        mockOktaDeleteUser(user);
        mockGetUserByOktaId(user.id, user, 1);
        mockOktaDeleteUser(user);
        mockDeleteResourcesCalls(user.profile.legacyId);

        const response: request.Response = await requester
            .delete(`/auth/user/${user.profile.legacyId}`)
            .set('Content-Type', 'application/json')
            .set('Authorization', `Bearer ${token}`);

        response.status.should.equal(200);
        response.body.should.be.an('object');
        response.body.data.should.have.property('id').and.eql(user.profile.legacyId);

        const databaseDeletion: IDeletion = await DeletionModel.findOne({ userId: user.profile.legacyId });
        chai.expect(databaseDeletion).to.not.be.null;
    });

    it('Deleting a deactivated user while logged in as an ADMIN should return 200 OK with the deleted user data', async () => {
        const token: string = mockValidJWT({ role: 'ADMIN' });
        const user: OktaUser = getMockOktaUser();

        mockGetUserById(user, 2);
        mockOktaDeleteUser(user);
        mockDeleteResourcesCalls(user.profile.legacyId);

        nock(config.get('okta.url'))
            .get(`/api/v1/users/${user.id}`)
            .reply(404, {
                errorCode: 'E0000007',
                errorSummary: `Not found: Resource not found: ${user.id} (User)`,
                errorLink: 'E0000007',
                errorId: 'oaesbELdOmpRsax4UknivKcfg',
                errorCauses: []
            });

        const response: request.Response = await requester
            .delete(`/auth/user/${user.profile.legacyId}`)
            .set('Content-Type', 'application/json')
            .set('Authorization', `Bearer ${token}`);

        response.status.should.equal(200);
        response.body.should.be.an('object');
        response.body.data.should.have.property('id').and.eql(user.profile.legacyId);

        const databaseDeletion: IDeletion = await DeletionModel.findOne({ userId: user.profile.legacyId });
        chai.expect(databaseDeletion).to.not.be.null;
    });

    it('Redis cache is cleared after a user is deleted', async () => {
        const token: string = mockValidJWT({ role: 'ADMIN' });
        const user: OktaUser = getMockOktaUser();
        mockGetUserById(user, 2);
        mockOktaDeleteUser(user);
        mockGetUserByOktaId(user.id, user, 1);
        mockOktaDeleteUser(user);
        mockDeleteResourcesCalls(user.profile.legacyId);

        // Assert value does not exist in cache before
        const value: OktaUser = await CacheService.get(`okta-user-${user.profile.legacyId}`);
        should.not.exist(value);

        // Store it in cache
        await CacheService.set(`okta-user-${user.profile.legacyId}`, user);
        const value2: OktaUser = await CacheService.get(`okta-user-${user.profile.legacyId}`);
        should.exist(value2);

        const response: request.Response = await requester
            .delete(`/auth/user/${user.profile.legacyId}`)
            .set('Content-Type', 'application/json')
            .set('Authorization', `Bearer ${token}`);

        response.status.should.equal(200);
        response.body.should.be.an('object');
        response.body.data.should.have.property('id').and.eql(user.profile.legacyId);

        // Assert value does not exist in cache after
        const value3: OktaUser = await CacheService.get(`okta-user-${user.profile.legacyId}`);
        should.not.exist(value3);
    });

    describe('with associated applications', () => {
        it('Deleting an user with associated applications should be successful and delete the association', async () => {
            const user: OktaUser = getMockOktaUser();
            const token: string = mockValidJWT({ role: 'ADMIN' });

            const testApplication: IApplication = await createApplication();

            await new ApplicationUserModel({
                userId: user.profile.legacyId,
                application: testApplication
            }).save();

            mockGetUserById(user, 2);
            mockOktaDeleteUser(user);
            mockGetUserByOktaId(user.id, user, 1);
            mockOktaDeleteUser(user);

            const response: request.Response = await requester
                .delete(`/auth/user/${user.profile.legacyId}`)
                .set('Content-Type', 'application/json')
                .set('Authorization', `Bearer ${token}`);

            response.status.should.equal(200);
            response.body.data.should.have.property('name').and.equal(user.profile.displayName);
            response.body.data.should.have.property('photo').and.equal(user.profile.photo);
            response.body.data.should.have.property('extraUserData').and.be.an('object').and.deep.eql({ apps: user.profile.apps });
            response.body.data.should.have.property('role').and.equal(user.profile.role);
            response.body.data.should.have.property('id').and.equal(user.profile.legacyId);
            response.body.data.should.have.property('email').and.equal(user.profile.email);
            response.body.data.should.have.property('applications').and.eql([{
                id: testApplication.id,
                name: testApplication.name,
            }]);
            response.body.data.should.have.property('createdAt');
            response.body.data.should.have.property('updatedAt');

            await assertNoConnection({ userId: user.profile.legacyId, application: null });
        });
    })

    describe('with associated organizations', () => {
        it('Deleting an user with associated organizations should be successful and delete the association', async () => {
            const user: OktaUser = getMockOktaUser();
            const token: string = mockValidJWT({ role: 'ADMIN' });

            const testOrganization: IOrganization = await createOrganization();

            await new OrganizationUserModel({
                userId: user.profile.legacyId,
                organization: testOrganization,
                role: 'ORG_ADMIN'
            }).save();

            mockGetUserById(user, 2);
            mockOktaDeleteUser(user);
            mockGetUserByOktaId(user.id, user, 1);
            mockOktaDeleteUser(user);

            const response: request.Response = await requester
                .delete(`/auth/user/${user.profile.legacyId}`)
                .set('Content-Type', 'application/json')
                .set('Authorization', `Bearer ${token}`);

            response.status.should.equal(200);
            response.body.data.should.have.property('name').and.equal(user.profile.displayName);
            response.body.data.should.have.property('photo').and.equal(user.profile.photo);
            response.body.data.should.have.property('extraUserData').and.be.an('object').and.deep.eql({ apps: user.profile.apps });
            response.body.data.should.have.property('role').and.equal(user.profile.role);
            response.body.data.should.have.property('id').and.equal(user.profile.legacyId);
            response.body.data.should.have.property('email').and.equal(user.profile.email);
            response.body.data.should.have.property('organizations').and.eql([{
                id: testOrganization.id,
                name: testOrganization.name,
                role: 'ORG_ADMIN'
            }]);
            response.body.data.should.have.property('createdAt');
            response.body.data.should.have.property('updatedAt');

            await assertNoConnection({ userId: user.profile.legacyId, organization: null });
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

        await DeletionModel.deleteMany({}).exec();
    });
});
