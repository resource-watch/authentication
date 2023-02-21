import nock from 'nock';
import chai, { expect } from 'chai';
import ApplicationModel, { IApplication } from 'models/application';
import chaiDateTime from 'chai-datetime';
import { getTestAgent } from '../utils/test-server';
import { assertConnection, assertNoConnection, createApplication, createOrganization } from '../utils/helpers';
import request from 'superagent';
import { getMockOktaUser, mockGetUserById, mockValidJWT } from '../okta/okta.mocks';
import mongoose, { HydratedDocument } from 'mongoose';
import {
    mockCreateAWSAPIGatewayAPIKey,
    mockDeleteAWSAPIGatewayAPIKey,
    mockUpdateAWSAPIGatewayAPIKey
} from "./aws.mocks";
import OrganizationModel, { IOrganization } from "models/organization";
import OrganizationApplicationModel, { IOrganizationApplication } from "models/organization-application";
import OrganizationUserModel from "models/organization-user";
import ApplicationUserModel from "models/application-user";
import { OktaUser } from "services/okta.interfaces";

chai.should();
chai.use(chaiDateTime);

let requester: ChaiHttp.Agent;

nock.disableNetConnect();
nock.enableNetConnect(process.env.HOST_IP);

describe('Update application tests', () => {

    before(async () => {
        if (process.env.NODE_ENV !== 'test') {
            throw Error(`Running the test suite with NODE_ENV ${process.env.NODE_ENV} may result in permanent data loss. Please use NODE_ENV=test.`);
        }

        requester = await getTestAgent();
    });

    beforeEach(async () => {
        await ApplicationModel.deleteMany({}).exec();
    });

    it('Update a application while not being logged in should return a 401 \'Unauthorized\' error', async () => {
        const application: HydratedDocument<IApplication> = await createApplication();

        const response: request.Response = await requester
            .patch(`/api/v1/application/${application._id.toString()}`)
            .send({});

        response.status.should.equal(401);
        response.body.should.have.property('errors').and.be.an('array').and.length(1);
        response.body.errors[0].should.have.property('status').and.equal(401);
        response.body.errors[0].should.have.property('detail').and.equal('Not authenticated');
    });

    it('Update a application while being logged in as USER should return a 403 \'Forbidden\' error', async () => {
        const token: string = mockValidJWT({ role: 'USER' });

        const application: HydratedDocument<IApplication> = await createApplication();

        const response: request.Response = await requester
            .patch(`/api/v1/application/${application._id.toString()}`)
            .set('Authorization', `Bearer ${token}`)
            .send({});

        response.status.should.equal(403);
        response.body.should.have.property('errors').and.be.an('array').and.length(1);
        response.body.errors[0].should.have.property('status').and.equal(403);
        response.body.errors[0].should.have.property('detail').and.equal('Not authorized');
    });

    it('Update a application that does not exist while being logged in as ADMIN user should return a 404 \'Application not found\' error', async () => {
        const token: string = mockValidJWT({ role: 'ADMIN' });

        const response: request.Response = await requester
            .patch(`/api/v1/application/${new mongoose.Types.ObjectId().toString()}`)
            .set('Authorization', `Bearer ${token}`)
            .send({});

        response.status.should.equal(404);
        response.body.should.have.property('errors').and.be.an('array').and.length(1);
        response.body.errors[0].should.have.property('status').and.equal(404);
        response.body.errors[0].should.have.property('detail').and.equal('Application not found');
    });

    it('Update a application while being logged in as ADMIN should return a 200 and the user data (happy case - no user data provided)', async () => {
        const token: string = mockValidJWT({ role: 'ADMIN' });

        const application: HydratedDocument<IApplication> = await createApplication();

        const response: request.Response = await requester
            .patch(`/api/v1/application/${application._id.toString()}`)
            .set('Authorization', `Bearer ${token}`)
            .send({});

        response.status.should.equal(200);
        response.body.should.have.property('data').and.be.an('object');

        const responseApplication: Record<string, any> = response.body.data;

        responseApplication.should.have.property('type').and.equal('applications');
        response.body.data.should.have.property('id').and.equal(application._id.toString());
        response.body.data.should.have.property('attributes').and.be.an('object');
        response.body.data.attributes.should.have.property('name').and.equal(application.name);
        response.body.data.attributes.should.have.property('apiKeyValue').and.equal(application.apiKeyValue);
        response.body.data.attributes.should.have.property('createdAt');
        new Date(response.body.data.attributes.createdAt).should.equalDate(application.createdAt);
        response.body.data.attributes.should.have.property('updatedAt');
        new Date(response.body.data.attributes.updatedAt).should.equalDate(application.updatedAt);
    });

    it('Update a application while being logged in should return a 200 and the updated user data (happy case)', async () => {
        const token: string = mockValidJWT({ role: 'ADMIN' });

        const application: HydratedDocument<IApplication> = await createApplication();

        mockUpdateAWSAPIGatewayAPIKey(application.apiKeyId, 'new application name');

        const response: request.Response = await requester
            .patch(`/api/v1/application/${application._id.toString()}`)
            .set('Authorization', `Bearer ${token}`)
            .send({
                name: 'new application name',
            });

        response.status.should.equal(200);

        const databaseApplication: IApplication = await ApplicationModel.findById(response.body.data.id);

        response.body.should.have.property('data').and.be.an('object');
        response.body.data.should.have.property('type').and.equal('applications');
        response.body.data.should.have.property('id').and.equal(databaseApplication._id.toString());
        response.body.data.should.have.property('attributes').and.be.an('object');
        response.body.data.attributes.should.have.property('name').and.equal(databaseApplication.name).and.equal('new application name');
        response.body.data.attributes.should.have.property('apiKeyValue').and.equal(databaseApplication.apiKeyValue).and.equal(application.apiKeyValue);
        response.body.data.attributes.should.have.property('createdAt');
        new Date(response.body.data.attributes.createdAt).should.equalDate(databaseApplication.createdAt);
        response.body.data.attributes.should.have.property('updatedAt');
        new Date(response.body.data.attributes.updatedAt).should.equalDate(databaseApplication.updatedAt);
    });

    it('Update a application while being logged in should return a 200 and the updated user data (happy case, regen api key)', async () => {
        const token: string = mockValidJWT({ role: 'ADMIN' });

        const application: HydratedDocument<IApplication> = await createApplication();

        mockDeleteAWSAPIGatewayAPIKey(application.apiKeyId);
        mockCreateAWSAPIGatewayAPIKey({ name: 'new application name' })

        const response: request.Response = await requester
            .patch(`/api/v1/application/${application._id.toString()}`)
            .set('Authorization', `Bearer ${token}`)
            .send({
                name: 'new application name',
                regenApiKey: true
            });

        response.status.should.equal(200);

        const databaseApplication: IApplication = await ApplicationModel.findById(response.body.data.id);

        response.body.should.have.property('data').and.be.an('object');
        response.body.data.should.have.property('type').and.equal('applications');
        response.body.data.should.have.property('id').and.equal(databaseApplication._id.toString());
        response.body.data.should.have.property('attributes').and.be.an('object');
        response.body.data.attributes.should.have.property('name').and.equal(databaseApplication.name).and.equal('new application name');
        response.body.data.attributes.should.have.property('apiKeyValue').and.equal(databaseApplication.apiKeyValue).and.not.equal(application.apiKeyValue);
        response.body.data.attributes.should.have.property('createdAt');
        new Date(response.body.data.attributes.createdAt).should.equalDate(databaseApplication.createdAt);
        response.body.data.attributes.should.have.property('updatedAt');
        new Date(response.body.data.attributes.updatedAt).should.equalDate(databaseApplication.updatedAt);
    });

    describe('with associated organization', () => {
        it('Update an application without setting organization should be successful and not modify the associated organizations', async () => {
            const token: string = mockValidJWT({ role: 'ADMIN' });
            const testOrganization: IOrganization = await createOrganization();
            const application: HydratedDocument<IApplication> = await createApplication();

            await new OrganizationApplicationModel({
                organization: testOrganization._id.toString(),
                application: application._id.toString()
            }).save();

            mockDeleteAWSAPIGatewayAPIKey(application.apiKeyId);
            mockCreateAWSAPIGatewayAPIKey({ name: 'new application name' })

            const response: request.Response = await requester
                .patch(`/api/v1/application/${application._id.toString()}`)
                .set('Authorization', `Bearer ${token}`)
                .send({
                    name: 'new application name',
                    regenApiKey: true,
                });

            response.status.should.equal(200);

            const databaseApplication: IApplication = await ApplicationModel.findById(response.body.data.id);

            response.body.data.should.have.property('type').and.equal('applications');
            response.body.data.should.have.property('id').and.equal(databaseApplication._id.toString());
            response.body.data.should.have.property('attributes').and.be.an('object');
            response.body.data.attributes.should.have.property('name').and.equal(databaseApplication.name);
            response.body.data.attributes.should.have.property('apiKeyValue').and.equal(databaseApplication.apiKeyValue).and.not.equal(application.apiKeyValue);
            response.body.data.attributes.should.have.property('organization').and.eql({
                id: testOrganization.id,
                name: testOrganization.name,
            });
            response.body.data.attributes.should.have.property('createdAt');
            new Date(response.body.data.attributes.createdAt).should.equalDate(databaseApplication.createdAt);
            response.body.data.attributes.should.have.property('updatedAt');
            new Date(response.body.data.attributes.updatedAt).should.equalDate(databaseApplication.updatedAt);

            await assertConnection({ organization: testOrganization, application });
        });

        it('Update an application and setting organization should be successful', async () => {
            const token: string = mockValidJWT({ role: 'ADMIN' });
            const testOrganization: IOrganization = await createOrganization();

            const application: HydratedDocument<IApplication> = await createApplication();

            mockDeleteAWSAPIGatewayAPIKey(application.apiKeyId);
            mockCreateAWSAPIGatewayAPIKey({ name: 'new application name' })

            const response: request.Response = await requester
                .patch(`/api/v1/application/${application._id.toString()}`)
                .set('Authorization', `Bearer ${token}`)
                .send({
                    name: 'new application name',
                    regenApiKey: true,
                    organization: testOrganization.id
                });

            response.status.should.equal(200);

            const databaseApplication: IApplication = await ApplicationModel.findById(response.body.data.id);

            response.body.data.should.have.property('type').and.equal('applications');
            response.body.data.should.have.property('id').and.equal(databaseApplication._id.toString());
            response.body.data.should.have.property('attributes').and.be.an('object');
            response.body.data.attributes.should.have.property('name').and.equal(databaseApplication.name);
            response.body.data.attributes.should.have.property('apiKeyValue').and.equal(databaseApplication.apiKeyValue).and.not.equal(application.apiKeyValue);
            response.body.data.attributes.should.have.property('organization').and.eql({
                id: testOrganization.id,
                name: testOrganization.name,
            });
            response.body.data.attributes.should.have.property('createdAt');
            new Date(response.body.data.attributes.createdAt).should.equalDate(databaseApplication.createdAt);
            response.body.data.attributes.should.have.property('updatedAt');
            new Date(response.body.data.attributes.updatedAt).should.equalDate(databaseApplication.updatedAt);

            await assertConnection({ organization: testOrganization, application });
        });

        it('Update an application and setting organization should remove association with user and be successful', async () => {
            const user: OktaUser = getMockOktaUser({ role: 'ADMIN' });
            const token: string = mockValidJWT({
                id: user.profile.legacyId,
                email: user.profile.email,
                role: user.profile.role,
                extraUserData: { apps: user.profile.apps },
            });

            const testOrganization: IOrganization = await createOrganization();
            const testApplication: HydratedDocument<IApplication> = await createApplication();

            await new ApplicationUserModel({
                userId: user.profile.legacyId,
                application: testApplication._id.toString()
            }).save();

            mockDeleteAWSAPIGatewayAPIKey(testApplication.apiKeyId);
            mockCreateAWSAPIGatewayAPIKey({ name: 'new application name' })

            const response: request.Response = await requester
                .patch(`/api/v1/application/${testApplication._id.toString()}`)
                .set('Authorization', `Bearer ${token}`)
                .send({
                    name: 'new application name',
                    regenApiKey: true,
                    organization: testOrganization.id
                });

            response.status.should.equal(200);

            const databaseApplication: IApplication = await ApplicationModel.findById(response.body.data.id);

            response.body.data.should.have.property('type').and.equal('applications');
            response.body.data.should.have.property('id').and.equal(databaseApplication._id.toString());
            response.body.data.should.have.property('attributes').and.be.an('object');
            response.body.data.attributes.should.have.property('name').and.equal(databaseApplication.name);
            response.body.data.attributes.should.have.property('apiKeyValue').and.equal(databaseApplication.apiKeyValue).and.not.equal(testApplication.apiKeyValue);
            response.body.data.attributes.should.have.property('organization').and.eql({
                id: testOrganization.id,
                name: testOrganization.name,
            });
            response.body.data.attributes.should.have.property('createdAt');
            new Date(response.body.data.attributes.createdAt).should.equalDate(databaseApplication.createdAt);
            response.body.data.attributes.should.have.property('updatedAt');
            new Date(response.body.data.attributes.updatedAt).should.equalDate(databaseApplication.updatedAt);

            await assertConnection({ organization: testOrganization, application: testApplication });
            await assertNoConnection({ user, application: testApplication });
        });

        it('Update an application and removing organization should be successful', async () => {
            const token: string = mockValidJWT({ role: 'ADMIN' });
            const testOrganization: IOrganization = await createOrganization();
            const testApplication: IApplication = await createApplication();

            await new OrganizationApplicationModel({
                organization: testOrganization._id.toString(),
                application: testApplication._id.toString()
            }).save();

            mockDeleteAWSAPIGatewayAPIKey(testApplication.apiKeyId);
            mockCreateAWSAPIGatewayAPIKey({ name: 'new application name' })

            const response: request.Response = await requester
                .patch(`/api/v1/application/${testApplication._id.toString()}`)
                .set('Authorization', `Bearer ${token}`)
                .send({
                    name: 'new application name',
                    regenApiKey: true,
                    organization: null
                });

            response.status.should.equal(200);

            const databaseApplication: IApplication = await ApplicationModel.findById(response.body.data.id);

            response.body.data.should.have.property('type').and.equal('applications');
            response.body.data.should.have.property('id').and.equal(databaseApplication._id.toString());
            response.body.data.should.have.property('attributes').and.be.an('object');
            response.body.data.attributes.should.have.property('name').and.equal(databaseApplication.name).and.equal('new application name');
            response.body.data.attributes.should.have.property('apiKeyValue').and.equal(databaseApplication.apiKeyValue).and.not.equal(testApplication.apiKeyValue);
            response.body.data.attributes.should.have.property('organization').and.eql(null);
            response.body.data.attributes.should.have.property('createdAt');
            new Date(response.body.data.attributes.createdAt).should.equalDate(databaseApplication.createdAt);
            response.body.data.attributes.should.have.property('updatedAt');
            new Date(response.body.data.attributes.updatedAt).should.equalDate(databaseApplication.updatedAt);

            const databaseOrganizationApplication: IOrganizationApplication = await OrganizationApplicationModel.findOne({ application: response.body.data.id });
            expect(databaseOrganizationApplication).to.equal(null);
        });

        it('Update an application and overwriting existing organization should be successful', async () => {
            const token: string = mockValidJWT({ role: 'ADMIN' });
            const testOrganizationOne: IOrganization = await createOrganization();
            const testOrganizationTwo: IOrganization = await createOrganization();
            const testApplication: HydratedDocument<IApplication> = await createApplication();

            await new OrganizationApplicationModel({
                organization: testOrganizationOne._id.toString(),
                application: testApplication._id.toString()
            }).save();

            mockDeleteAWSAPIGatewayAPIKey(testApplication.apiKeyId);
            mockCreateAWSAPIGatewayAPIKey({ name: 'new application name' })

            const response: request.Response = await requester
                .patch(`/api/v1/application/${testApplication._id.toString()}`)
                .set('Authorization', `Bearer ${token}`)
                .send({
                    name: 'new application name',
                    regenApiKey: true,
                    organization: testOrganizationTwo.id
                });

            response.status.should.equal(200);

            const databaseApplication: IApplication = await ApplicationModel.findById(response.body.data.id);

            response.body.data.should.have.property('type').and.equal('applications');
            response.body.data.should.have.property('id').and.equal(databaseApplication._id.toString());
            response.body.data.should.have.property('attributes').and.be.an('object');
            response.body.data.attributes.should.have.property('name').and.equal(databaseApplication.name);
            response.body.data.attributes.should.have.property('apiKeyValue').and.equal(databaseApplication.apiKeyValue).and.not.equal(testApplication.apiKeyValue);
            response.body.data.attributes.should.have.property('organization').and.eql(
                {
                    id: testOrganizationTwo.id,
                    name: testOrganizationTwo.name,
                }
            );
            response.body.data.attributes.should.have.property('createdAt');
            new Date(response.body.data.attributes.createdAt).should.equalDate(databaseApplication.createdAt);
            response.body.data.attributes.should.have.property('updatedAt');
            new Date(response.body.data.attributes.updatedAt).should.equalDate(databaseApplication.updatedAt);

            const databaseOrganizationApplicationOne: IOrganizationApplication = await OrganizationApplicationModel.findOne({ organization: testOrganizationOne._id.toString() });
            expect(databaseOrganizationApplicationOne).to.equal(null);

            const databaseOrganizationApplicationTwo: IOrganizationApplication = await OrganizationApplicationModel.findOne({ organization: testOrganizationTwo._id.toString() });
            databaseOrganizationApplicationTwo.application._id.toString().should.equal(response.body.data.id);
        });
    })

    describe('with associated user', () => {
        it('Update an application without setting user should be successful and not modify the associated users', async () => {
            const user: OktaUser = getMockOktaUser({ role: 'ADMIN' });
            const token: string = mockValidJWT({
                id: user.profile.legacyId,
                email: user.profile.email,
                role: user.profile.role,
                extraUserData: { apps: user.profile.apps },
            });

            mockGetUserById(user);

            const application: HydratedDocument<IApplication> = await createApplication();

            await new ApplicationUserModel({
                userId: user.profile.legacyId,
                application: application._id.toString()
            }).save();

            mockDeleteAWSAPIGatewayAPIKey(application.apiKeyId);
            mockCreateAWSAPIGatewayAPIKey({ name: 'new application name' })

            const response: request.Response = await requester
                .patch(`/api/v1/application/${application._id.toString()}`)
                .set('Authorization', `Bearer ${token}`)
                .send({
                    name: 'new application name',
                    regenApiKey: true,
                });

            response.status.should.equal(200);

            const databaseApplication: IApplication = await ApplicationModel.findById(response.body.data.id);

            response.body.data.should.have.property('type').and.equal('applications');
            response.body.data.should.have.property('id').and.equal(databaseApplication._id.toString());
            response.body.data.should.have.property('attributes').and.be.an('object');
            response.body.data.attributes.should.have.property('name').and.equal(databaseApplication.name);
            response.body.data.attributes.should.have.property('apiKeyValue').and.equal(databaseApplication.apiKeyValue).and.not.equal(application.apiKeyValue);
            response.body.data.attributes.should.have.property('user').and.eql({
                id: user.profile.legacyId,
                name: user.profile.displayName
            });
            response.body.data.attributes.should.have.property('createdAt');
            new Date(response.body.data.attributes.createdAt).should.equalDate(databaseApplication.createdAt);
            response.body.data.attributes.should.have.property('updatedAt');
            new Date(response.body.data.attributes.updatedAt).should.equalDate(databaseApplication.updatedAt);

            await assertConnection({ userId: response.body.data.attributes.user.id, application })
        });

        it('Update an application and setting user should be successful', async () => {
            const user: OktaUser = getMockOktaUser({ role: 'ADMIN' });
            const token: string = mockValidJWT({
                id: user.profile.legacyId,
                email: user.profile.email,
                role: user.profile.role,
                extraUserData: { apps: user.profile.apps },
            });

            mockGetUserById(user, 2);

            const application: HydratedDocument<IApplication> = await createApplication();

            mockDeleteAWSAPIGatewayAPIKey(application.apiKeyId);
            mockCreateAWSAPIGatewayAPIKey({ name: 'new application name' })

            const response: request.Response = await requester
                .patch(`/api/v1/application/${application._id.toString()}`)
                .set('Authorization', `Bearer ${token}`)
                .send({
                    name: 'new application name',
                    regenApiKey: true,
                    user: user.profile.legacyId
                });

            response.status.should.equal(200);

            const databaseApplication: IApplication = await ApplicationModel.findById(response.body.data.id);

            response.body.data.should.have.property('type').and.equal('applications');
            response.body.data.should.have.property('id').and.equal(databaseApplication._id.toString());
            response.body.data.should.have.property('attributes').and.be.an('object');
            response.body.data.attributes.should.have.property('name').and.equal(databaseApplication.name);
            response.body.data.attributes.should.have.property('apiKeyValue').and.equal(databaseApplication.apiKeyValue).and.not.equal(application.apiKeyValue);
            response.body.data.attributes.should.have.property('user').and.eql({
                id: user.profile.legacyId,
                name: user.profile.displayName
            });
            response.body.data.attributes.should.have.property('createdAt');
            new Date(response.body.data.attributes.createdAt).should.equalDate(databaseApplication.createdAt);
            response.body.data.attributes.should.have.property('updatedAt');
            new Date(response.body.data.attributes.updatedAt).should.equalDate(databaseApplication.updatedAt);

            await assertConnection({ user: user, application });
        });

        it('Update an application and setting user should remove association with organization and be successful', async () => {
            const user: OktaUser = getMockOktaUser({ role: 'ADMIN' });
            const token: string = mockValidJWT({
                id: user.profile.legacyId,
                email: user.profile.email,
                role: user.profile.role,
                extraUserData: { apps: user.profile.apps },
            });

            mockGetUserById(user, 2);

            const testApplication: IApplication = await createApplication();
            const testOrganization: IOrganization = await createOrganization();

            await new OrganizationApplicationModel({
                testOrganization: testOrganization,
                application: testApplication._id.toString()
            }).save();

            mockDeleteAWSAPIGatewayAPIKey(testApplication.apiKeyId);
            mockCreateAWSAPIGatewayAPIKey({ name: 'new application name' })

            const response: request.Response = await requester
                .patch(`/api/v1/application/${testApplication._id.toString()}`)
                .set('Authorization', `Bearer ${token}`)
                .send({
                    name: 'new application name',
                    regenApiKey: true,
                    user: user.profile.legacyId
                });

            response.status.should.equal(200);

            const databaseApplication: IApplication = await ApplicationModel.findById(response.body.data.id);

            response.body.data.should.have.property('type').and.equal('applications');
            response.body.data.should.have.property('id').and.equal(databaseApplication._id.toString());
            response.body.data.should.have.property('attributes').and.be.an('object');
            response.body.data.attributes.should.have.property('name').and.equal(databaseApplication.name);
            response.body.data.attributes.should.have.property('apiKeyValue').and.equal(databaseApplication.apiKeyValue).and.not.equal(testApplication.apiKeyValue);
            response.body.data.attributes.should.have.property('user').and.eql({
                id: user.profile.legacyId,
                name: user.profile.displayName
            });
            response.body.data.attributes.should.have.property('createdAt');
            new Date(response.body.data.attributes.createdAt).should.equalDate(databaseApplication.createdAt);
            response.body.data.attributes.should.have.property('updatedAt');
            new Date(response.body.data.attributes.updatedAt).should.equalDate(databaseApplication.updatedAt);

            await assertConnection({ user, application: testApplication });
            await assertNoConnection({ organization: testOrganization, application: testApplication });
        });

        it('Update an application and removing user should be successful', async () => {
            const user: OktaUser = getMockOktaUser({ role: 'ADMIN' });
            const token: string = mockValidJWT({
                id: user.profile.legacyId,
                email: user.profile.email,
                role: user.profile.role,
                extraUserData: { apps: user.profile.apps },
            });

            const testApplication: IApplication = await createApplication();

            await new ApplicationUserModel({
                userId: user.profile.legacyId,
                application: testApplication._id.toString()
            }).save();

            mockDeleteAWSAPIGatewayAPIKey(testApplication.apiKeyId);
            mockCreateAWSAPIGatewayAPIKey({ name: 'new application name' })

            const response: request.Response = await requester
                .patch(`/api/v1/application/${testApplication._id.toString()}`)
                .set('Authorization', `Bearer ${token}`)
                .send({
                    name: 'new application name',
                    regenApiKey: true,
                    user: null
                });

            response.status.should.equal(200);

            const databaseApplication: IApplication = await ApplicationModel.findById(response.body.data.id);

            response.body.data.should.have.property('type').and.equal('applications');
            response.body.data.should.have.property('id').and.equal(databaseApplication._id.toString());
            response.body.data.should.have.property('attributes').and.be.an('object');
            response.body.data.attributes.should.have.property('name').and.equal(databaseApplication.name).and.equal('new application name');
            response.body.data.attributes.should.have.property('apiKeyValue').and.equal(databaseApplication.apiKeyValue).and.not.equal(testApplication.apiKeyValue);
            response.body.data.attributes.should.have.property('user').and.eql(null);
            response.body.data.attributes.should.have.property('createdAt');
            new Date(response.body.data.attributes.createdAt).should.equalDate(databaseApplication.createdAt);
            response.body.data.attributes.should.have.property('updatedAt');
            new Date(response.body.data.attributes.updatedAt).should.equalDate(databaseApplication.updatedAt);

            await assertNoConnection({ user, application: testApplication });
        });

        it('Update an application and overwriting existing user should be successful', async () => {
            const userOne: OktaUser = getMockOktaUser({ role: 'ADMIN' });
            const userTwo: OktaUser = getMockOktaUser({ role: 'ADMIN' });
            const token: string = mockValidJWT({ role: 'ADMIN' });

            mockGetUserById(userTwo, 2);

            const testApplication: HydratedDocument<IApplication> = await createApplication();

            await new ApplicationUserModel({
                userId: userOne.profile.legacyId,
                application: testApplication._id.toString()
            }).save();

            mockDeleteAWSAPIGatewayAPIKey(testApplication.apiKeyId);
            mockCreateAWSAPIGatewayAPIKey({ name: 'new application name' })

            const response: request.Response = await requester
                .patch(`/api/v1/application/${testApplication._id.toString()}`)
                .set('Authorization', `Bearer ${token}`)
                .send({
                    name: 'new application name',
                    regenApiKey: true,
                    user: userTwo.profile.legacyId
                });

            response.status.should.equal(200);

            const databaseApplication: IApplication = await ApplicationModel.findById(response.body.data.id);

            response.body.data.should.have.property('type').and.equal('applications');
            response.body.data.should.have.property('id').and.equal(databaseApplication._id.toString());
            response.body.data.should.have.property('attributes').and.be.an('object');
            response.body.data.attributes.should.have.property('name').and.equal(databaseApplication.name);
            response.body.data.attributes.should.have.property('apiKeyValue').and.equal(databaseApplication.apiKeyValue).and.not.equal(testApplication.apiKeyValue);
            response.body.data.attributes.should.have.property('user').and.eql({
                id: userTwo.profile.legacyId,
                name: userTwo.profile.displayName,
            });
            response.body.data.attributes.should.have.property('createdAt');
            new Date(response.body.data.attributes.createdAt).should.equalDate(databaseApplication.createdAt);
            response.body.data.attributes.should.have.property('updatedAt');
            new Date(response.body.data.attributes.updatedAt).should.equalDate(databaseApplication.updatedAt);

            await assertConnection({ application: testApplication, user: userTwo })
            await assertNoConnection({ application: testApplication, user: userOne })
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
