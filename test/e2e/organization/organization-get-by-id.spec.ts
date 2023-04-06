import nock from 'nock';
import chai from 'chai';
import mongoose, { HydratedDocument } from 'mongoose';
import OrganizationModel, { IOrganization } from 'models/organization';
import chaiDateTime from 'chai-datetime';
import { getTestAgent } from '../utils/test-server';
import { assertConnection, createApplication, createOrganization } from '../utils/helpers';
import request from 'superagent';
import { getMockOktaUser, mockGetUserById, mockValidJWT } from '../okta/okta.mocks';
import ApplicationModel, { IApplication } from "models/application";
import OrganizationApplicationModel from "models/organization-application";
import OrganizationUserModel from "models/organization-user";
import ApplicationUserModel from "models/application-user";
import { describe } from "mocha";
import { OktaUser } from "services/okta.interfaces";

chai.should();
chai.use(chaiDateTime);

let requester: ChaiHttp.Agent;

nock.disableNetConnect();
nock.enableNetConnect(process.env.HOST_IP);

describe('Get organization by id tests', () => {

    before(async () => {
        if (process.env.NODE_ENV !== 'test') {
            throw Error(`Running the test suite with NODE_ENV ${process.env.NODE_ENV} may result in permanent data loss. Please use NODE_ENV=test.`);
        }

        requester = await getTestAgent();
    });

    beforeEach(async () => {
        await OrganizationModel.deleteMany({}).exec();
    });

    it('Get organization by id without being authenticated should return a 401 \'Unauthorized\' error', async () => {
        const organization: HydratedDocument<IOrganization> = await createOrganization();

        const response: request.Response = await requester
            .get(`/api/v1/organization/${organization._id.toString()}`);

        response.status.should.equal(401);
        response.body.should.have.property('errors').and.be.an('array').and.length(1);
        response.body.errors[0].should.have.property('status').and.equal(401);
        response.body.errors[0].should.have.property('detail').and.equal('Not authenticated');
    });

    it('Get organization by id while being authenticated as user with USER role that does not belong to the organization should return a 403 \'Forbidden\' error', async () => {
        const token: string = mockValidJWT({ role: 'USER' });

        const organization: HydratedDocument<IOrganization> = await createOrganization();

        const response: request.Response = await requester
            .get(`/api/v1/organization/${organization._id.toString()}`)
            .set('Authorization', `Bearer ${token}`);

        response.status.should.equal(403);
        response.body.should.have.property('errors').and.be.an('array').and.length(1);
        response.body.errors[0].should.have.property('status').and.equal(403);
        response.body.errors[0].should.have.property('detail').and.equal('Not authorized');
    });

    it('Get organization by id while being authenticated as user with MANAGER role that does not belong to the organization should return a 403 \'Forbidden\' error', async () => {
        const token: string = mockValidJWT({ role: 'MANAGER' });

        const organization: HydratedDocument<IOrganization> = await createOrganization();

        const response: request.Response = await requester
            .get(`/api/v1/organization/${organization._id.toString()}`)
            .set('Authorization', `Bearer ${token}`);

        response.status.should.equal(403);
        response.body.should.have.property('errors').and.be.an('array').and.length(1);
        response.body.errors[0].should.have.property('status').and.equal(403);
        response.body.errors[0].should.have.property('detail').and.equal('Not authorized');
    });

    it('Get organization by id while being authenticated as an ADMIN user should return a 200 and the user data (happy case)', async () => {
        const token: string = mockValidJWT({ role: 'ADMIN' });

        const organization: HydratedDocument<IOrganization> = await createOrganization();

        const response: request.Response = await requester
            .get(`/api/v1/organization/${organization._id.toString()}`)
            .set('Authorization', `Bearer ${token}`);

        response.status.should.equal(200);
        response.body.should.have.property('data').and.be.an('object');
        response.body.data.should.have.property('type').and.equal('organizations');
        response.body.data.should.have.property('id').and.equal(organization._id.toString());
        response.body.data.should.have.property('attributes').and.be.an('object');
        response.body.data.attributes.should.have.property('name').and.equal(organization.name);
        response.body.data.attributes.should.have.property('applications').and.eql([]);
        response.body.data.attributes.should.have.property('createdAt');
        new Date(response.body.data.attributes.createdAt).should.equalDate(organization.createdAt);
        response.body.data.attributes.should.have.property('updatedAt');
        new Date(response.body.data.attributes.updatedAt).should.equalDate(organization.updatedAt);

    });

    it('Get organization by id for an invalid id should return a 404 \'User not found\' error', async () => {
        const token: string = mockValidJWT({ role: 'ADMIN' });

        const response: request.Response = await requester
            .get(`/api/v1/organization/1234`)
            .set('Authorization', `Bearer ${token}`);

        response.status.should.equal(404);
        response.body.should.have.property('errors').and.be.an('array').and.length(1);
        response.body.errors[0].should.have.property('status').and.equal(404);
        response.body.errors[0].should.have.property('detail').and.equal('Organization not found');
    });

    it('Get organization by id for an valid id that does not exist on the database should return a 404 \'User not found\' error', async () => {
        const token: string = mockValidJWT({ role: 'ADMIN' });

        const response: request.Response = await requester
            .get(`/api/v1/organization/${new mongoose.Types.ObjectId()}`)
            .set('Authorization', `Bearer ${token}`);

        response.status.should.equal(404);
        response.body.should.have.property('errors').and.be.an('array').and.length(1);
        response.body.errors[0].should.have.property('status').and.equal(404);
        response.body.errors[0].should.have.property('detail').and.equal('Organization not found');
    });

    describe('while being logged in as an organization ORG_ADMIN', () => {
        it('Get organization by id should be successful', async () => {
            const testUser: OktaUser = getMockOktaUser({ role: 'USER' });
            const token: string = mockValidJWT({
                id: testUser.profile.legacyId,
                email: testUser.profile.email,
                role: testUser.profile.role,
                extraUserData: { apps: testUser.profile.apps },
            });
            mockGetUserById(testUser);

            const organization: HydratedDocument<IOrganization> = await createOrganization();

            await new OrganizationUserModel({
                organization,
                userId: testUser.profile.legacyId,
                role: 'ORG_ADMIN'
            }).save();

            const response: request.Response = await requester
                .get(`/api/v1/organization/${organization._id.toString()}`)
                .set('Authorization', `Bearer ${token}`);

            response.status.should.equal(200);

            const databaseOrganization: IOrganization = await OrganizationModel.findById(response.body.data.id);

            response.body.data.should.have.property('type').and.equal('organizations');
            response.body.data.should.have.property('id').and.equal(databaseOrganization._id.toString());
            response.body.data.should.have.property('attributes').and.be.an('object');
            response.body.data.attributes.should.have.property('name').and.equal(databaseOrganization.name);
            response.body.data.attributes.should.have.property('applications').and.eql([]);
            response.body.data.attributes.should.have.property('createdAt');
            new Date(response.body.data.attributes.createdAt).should.equalDate(databaseOrganization.createdAt);
            response.body.data.attributes.should.have.property('updatedAt');
            new Date(response.body.data.attributes.updatedAt).should.equalDate(databaseOrganization.updatedAt);
        });
    });

    describe('with associated applications', () => {
        it('Get organization by id with associated application should be successful', async () => {
            const token: string = mockValidJWT({ role: 'ADMIN' });
            const testApplication: IApplication = await createApplication();

            const testOrganization: HydratedDocument<IOrganization> = await createOrganization();
            await new OrganizationApplicationModel({ organization: testOrganization, application: testApplication }).save()

            const response: request.Response = await requester
                .get(`/api/v1/organization/${testOrganization._id.toString()}`)
                .set('Authorization', `Bearer ${token}`);

            response.status.should.equal(200);

            const databaseOrganization: IOrganization = await OrganizationModel.findById(response.body.data.id);

            response.body.data.should.have.property('type').and.equal('organizations');
            response.body.data.should.have.property('id').and.equal(databaseOrganization._id.toString());
            response.body.data.should.have.property('attributes').and.be.an('object');
            response.body.data.attributes.should.have.property('name').and.equal(databaseOrganization.name);
            response.body.data.attributes.should.have.property('applications').and.eql([{
                id: testApplication.id,
                name: testApplication.name,
            }]);
            response.body.data.attributes.should.have.property('createdAt');
            new Date(response.body.data.attributes.createdAt).should.equalDate(databaseOrganization.createdAt);
            response.body.data.attributes.should.have.property('updatedAt');
            new Date(response.body.data.attributes.updatedAt).should.equalDate(databaseOrganization.updatedAt);
        });
    })

    describe('with associated users', () => {
        it('Get organization by id with associated users should be successful', async () => {
            const token: string = mockValidJWT({ role: 'ADMIN' });
            const testUser: OktaUser = getMockOktaUser({ role: 'ADMIN' });
            const testOrganization: IOrganization = await createOrganization();

            mockGetUserById(testUser);

            await new OrganizationUserModel({
                organization: testOrganization,
                userId: testUser.profile.legacyId,
                role: 'ADMIN'
            }).save();

            const response: request.Response = await requester
                .get(`/api/v1/organization/${testOrganization._id.toString()}`)
                .set('Authorization', `Bearer ${token}`);

            response.status.should.equal(200);
            response.body.data.should.have.property('type').and.equal('organizations');
            response.body.data.should.have.property('id').and.equal(testOrganization._id.toString());
            response.body.data.should.have.property('attributes').and.be.an('object');
            response.body.data.attributes.should.have.property('name').and.equal(testOrganization.name);
            response.body.data.attributes.should.have.property('users').and.eql([{
                id: testUser.profile.legacyId,
                name: testUser.profile.displayName,
                role: 'ADMIN'
            }]);
            response.body.data.attributes.should.have.property('createdAt');
            new Date(response.body.data.attributes.createdAt).should.equalDate(testOrganization.createdAt);
            response.body.data.attributes.should.have.property('updatedAt');
            new Date(response.body.data.attributes.updatedAt).should.equalDate(testOrganization.updatedAt);

            await assertConnection({ organization: testOrganization, userId: testUser.profile.legacyId });
        });
    })

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
