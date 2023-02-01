import nock from 'nock';
import chai from 'chai';
import ApplicationModel, { IApplication } from 'models/application';
import chaiDateTime from 'chai-datetime';
import { getTestAgent } from '../utils/test-server';
import { createApplication, createOrganization } from '../utils/helpers';
import request from 'superagent';
import { mockValidJWT } from '../okta/okta.mocks';
import mongoose, { HydratedDocument } from 'mongoose';
import {
    mockCreateAWSAPIGatewayAPIKey,
    mockDeleteAWSAPIGatewayAPIKey,
    mockUpdateAWSAPIGatewayAPIKey
} from "./aws.mocks";
import OrganizationModel, { IOrganization } from "../../../src/models/organization";

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

            const application: HydratedDocument<IApplication> = await createApplication({
                organization: testOrganization.id
            });

            testOrganization.applications.push(application.id);
            await testOrganization.save();

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

            const databaseOrganization: IOrganization = await OrganizationModel.findById(response.body.data.attributes.organization.id).populate('applications');
            databaseOrganization.applications.map((application:IApplication) => application.id).should.eql([response.body.data.id]);
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

            const databaseOrganization: IOrganization = await OrganizationModel.findById(response.body.data.attributes.organization.id).populate('applications');
            databaseOrganization.applications.map((application:IApplication) => application.id).should.eql([response.body.data.id]);
        });

        it('Update an application and removing organization should be successful', async () => {
            const token: string = mockValidJWT({ role: 'ADMIN' });
            const testOrganization: IOrganization = await createOrganization();

            const application: HydratedDocument<IApplication> = await createApplication({
                organization: testOrganization.id
            });

            testOrganization.applications.push(application.id);
            await testOrganization.save();

            mockDeleteAWSAPIGatewayAPIKey(application.apiKeyId);
            mockCreateAWSAPIGatewayAPIKey({ name: 'new application name' })

            const response: request.Response = await requester
                .patch(`/api/v1/application/${application._id.toString()}`)
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
            response.body.data.attributes.should.have.property('name').and.equal(databaseApplication.name);
            response.body.data.attributes.should.have.property('apiKeyValue').and.equal(databaseApplication.apiKeyValue).and.not.equal(application.apiKeyValue);
            response.body.data.attributes.should.have.property('organization').and.eql(null);
            response.body.data.attributes.should.have.property('createdAt');
            new Date(response.body.data.attributes.createdAt).should.equalDate(databaseApplication.createdAt);
            response.body.data.attributes.should.have.property('updatedAt');
            new Date(response.body.data.attributes.updatedAt).should.equalDate(databaseApplication.updatedAt);

            const databaseOrganization: IOrganization = await OrganizationModel.findById(testOrganization.id).populate('applications');
            databaseOrganization.applications.map((application:IApplication) => application.id).should.eql([]);
        });

        it('Update an application and overwriting existing organization should be successful', async () => {
            const token: string = mockValidJWT({ role: 'ADMIN' });
            const testOrganizationOne: IOrganization = await createOrganization();
            const testOrganizationTwo: IOrganization = await createOrganization();

            const application: HydratedDocument<IApplication> = await createApplication({
                organization: testOrganizationOne.id
            });

            testOrganizationOne.applications.push(application.id);
            await testOrganizationOne.save();

            mockDeleteAWSAPIGatewayAPIKey(application.apiKeyId);
            mockCreateAWSAPIGatewayAPIKey({ name: 'new application name' })

            const response: request.Response = await requester
                .patch(`/api/v1/application/${application._id.toString()}`)
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
            response.body.data.attributes.should.have.property('apiKeyValue').and.equal(databaseApplication.apiKeyValue).and.not.equal(application.apiKeyValue);
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

            const databaseOrganizationOne: IOrganization = await OrganizationModel.findById(testOrganizationOne.id).populate('applications');
            databaseOrganizationOne.applications.map((application:IApplication) => application.id).should.eql([]);

            const databaseOrganizationTwo: IOrganization = await OrganizationModel.findById(testOrganizationTwo.id).populate('applications');
            databaseOrganizationTwo.applications.map((application:IApplication) => application.id).should.eql([response.body.data.id]);
        });
    })

    afterEach(async () => {
        await ApplicationModel.deleteMany({}).exec();
        await OrganizationModel.deleteMany({}).exec();

        if (!nock.isDone()) {
            throw new Error(`Not all nock interceptors were used: ${nock.pendingMocks()}`);
        }
    });
});
