import nock from 'nock';
import chai, { expect } from 'chai';
import OrganizationModel, { IOrganization } from 'models/organization';
import { getTestAgent } from '../utils/test-server';
import { assertConnection, assertNoConnection, createApplication, createOrganization } from '../utils/helpers';
import chaiDateTime from 'chai-datetime';
import request from 'superagent';
import mongoose, { HydratedDocument } from 'mongoose';
import { getMockOktaUser, mockGetUserById, mockValidJWT } from '../okta/okta.mocks';
import ApplicationModel, { IApplication } from "models/application";
import OrganizationApplicationModel from "models/organization-application";
import OrganizationUserModel from "models/organization-user";
import ApplicationUserModel from "models/application-user";
import { OktaUser } from "services/okta.interfaces";

chai.should();
chai.use(chaiDateTime);

let requester: ChaiHttp.Agent;

nock.disableNetConnect();
nock.enableNetConnect(process.env.HOST_IP);

describe('Delete organization tests', () => {

    before(async () => {
        if (process.env.NODE_ENV !== 'test') {
            throw Error(`Running the test suite with NODE_ENV ${process.env.NODE_ENV} may result in permanent data loss. Please use NODE_ENV=test.`);
        }

        requester = await getTestAgent();
    });

    beforeEach(async () => {
        await OrganizationModel.deleteMany({}).exec();
    });

    it('Delete a organization while not being logged in should return a 401 \'Not authenticated\' error', async () => {
        const organization: HydratedDocument<IOrganization> = await createOrganization();

        const response: request.Response = await requester
            .delete(`/api/v1/organization/${organization._id.toString()}`);

        response.status.should.equal(401);
        response.body.should.have.property('errors').and.be.an('array').and.length(1);
        response.body.errors[0].should.have.property('status').and.equal(401);
        response.body.errors[0].should.have.property('detail').and.equal('Not authenticated');
    });

    it('Delete a organization while being logged in as USER user should return a 403 \'Not authorized\' error', async () => {
        const token: string = mockValidJWT({ role: 'USER' });

        const organization: HydratedDocument<IOrganization> = await createOrganization();

        const response: request.Response = await requester
            .delete(`/api/v1/organization/${organization._id.toString()}`)
            .set('Authorization', `Bearer ${token}`)
            .send({});

        response.status.should.equal(403);
        response.body.should.have.property('errors').and.be.an('array').and.length(1);
        response.body.errors[0].should.have.property('status').and.equal(403);
        response.body.errors[0].should.have.property('detail').and.equal('Not authorized');
    });

    it('Delete a organization while being logged in as MANAGER user should return a 403 \'Not authorized\' error', async () => {
        const token: string = mockValidJWT({ role: 'MANAGER' });

        const organization: HydratedDocument<IOrganization> = await createOrganization();

        const response: request.Response = await requester
            .delete(`/api/v1/organization/${organization._id.toString()}`)
            .set('Authorization', `Bearer ${token}`)
            .send({});

        response.status.should.equal(403);
        response.body.should.have.property('errors').and.be.an('array').and.length(1);
        response.body.errors[0].should.have.property('status').and.equal(403);
        response.body.errors[0].should.have.property('detail').and.equal('Not authorized');
    });

    it('Delete a organization that does not exist while being logged in as ADMIN user should return a 404 \'Organization not found\' error', async () => {
        const token: string = mockValidJWT({ role: 'ADMIN' });

        const response: request.Response = await requester
            .patch(`/api/v1/organization/${new mongoose.Types.ObjectId().toString()}`)
            .set('Authorization', `Bearer ${token}`)
            .send({});

        response.status.should.equal(404);
        response.body.should.have.property('errors').and.be.an('array').and.length(1);
        response.body.errors[0].should.have.property('status').and.equal(404);
        response.body.errors[0].should.have.property('detail').and.equal('Organization not found');
    });

    it('Delete a organization while being logged in with that user should return a 200 and the user data (happy case)', async () => {
        const token: string = mockValidJWT({ role: 'ADMIN' });

        const organization: HydratedDocument<IOrganization> = await createOrganization();

        const response: request.Response = await requester
            .delete(`/api/v1/organization/${organization._id.toString()}`)
            .set('Authorization', `Bearer ${token}`)
            .send({});

        response.status.should.equal(200);

        const responseOrganization: Record<string, any> = response.body.data;
        const databaseOrganization: IOrganization = await OrganizationModel.findById(responseOrganization.id);
        chai.expect(databaseOrganization).to.be.null;

        responseOrganization.should.have.property('type').and.equal('organizations');
        responseOrganization.should.have.property('id').and.equal(organization._id.toString());
        responseOrganization.should.have.property('attributes').and.be.an('object');
        response.body.data.attributes.should.have.property('name').and.equal(organization.name);
        response.body.data.attributes.should.have.property('applications').and.eql([]);
        response.body.data.attributes.should.have.property('createdAt');
        new Date(response.body.data.attributes.createdAt).should.equalDate(organization.createdAt);
        response.body.data.attributes.should.have.property('updatedAt');
        new Date(response.body.data.attributes.updatedAt).should.equalDate(organization.updatedAt);
    });

    describe('while being logged in as an organization ORG_ADMIN', () => {
        it('Delete a organization should return a 403 \'Forbidden\' error', async () => {
            const testUser: OktaUser = getMockOktaUser({ role: 'USER' });
            const token: string = mockValidJWT({
                id: testUser.profile.legacyId,
                email: testUser.profile.email,
                role: testUser.profile.role,
                extraUserData: { apps: testUser.profile.apps },
            });

            const organization: HydratedDocument<IOrganization> = await createOrganization();

            const response: request.Response = await requester
                .delete(`/api/v1/organization/${organization._id.toString()}`)
                .set('Authorization', `Bearer ${token}`)
                .send({});

            response.status.should.equal(403);
            response.body.should.have.property('errors').and.be.an('array').and.length(1);
            response.body.errors[0].should.have.property('status').and.equal(403);
            response.body.errors[0].should.have.property('detail').and.equal('Not authorized');
        });
    });

    describe('with associated applications', () => {
        it('Delete a organization with associated application should fail', async () => {
            const token: string = mockValidJWT({ role: 'ADMIN' });
            const testApplication: IApplication = await createApplication();
            const testOrganization: HydratedDocument<IOrganization> = await createOrganization();

            await new OrganizationApplicationModel({
                organization: testOrganization,
                application: testApplication
            }).save();

            const response: request.Response = await requester
                .delete(`/api/v1/organization/${testOrganization._id.toString()}`)
                .set('Authorization', `Bearer ${token}`)
                .send({});

            response.status.should.equal(400);
            response.body.should.have.property('errors').and.be.an('array').and.length(1);
            response.body.errors[0].should.have.property('status').and.equal(400);
            response.body.errors[0].should.have.property('detail').and.equal('Organizations with associated applications cannot be deleted');

            await assertConnection({ organization: testOrganization, application: testApplication });
        });
    })

    describe('with associated users', () => {
        it('Delete a organization with associated user should be successful', async () => {
            const token: string = mockValidJWT({ role: 'ADMIN' });
            const testUser: OktaUser = getMockOktaUser({ role: 'ADMIN' });
            const testOrganization: HydratedDocument<IOrganization> = await createOrganization();

            mockGetUserById(testUser);

            await new OrganizationUserModel({
                organization: testOrganization,
                userId: testUser.profile.legacyId,
                role: 'ADMIN'
            }).save();

            const response: request.Response = await requester
                .delete(`/api/v1/organization/${testOrganization._id.toString()}`)
                .set('Authorization', `Bearer ${token}`)
                .send({});

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

            await assertNoConnection({ organization: testOrganization, application: null });
            await assertNoConnection({ organization: testOrganization, user: null });
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
