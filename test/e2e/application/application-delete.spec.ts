import nock from 'nock';
import chai, { expect } from 'chai';
import ApplicationModel, { IApplication } from 'models/application';
import { getTestAgent } from '../utils/test-server';
import { createApplication, createOrganization } from '../utils/helpers';
import chaiDateTime from 'chai-datetime';
import request from 'superagent';
import mongoose, { HydratedDocument } from 'mongoose';
import { mockValidJWT } from '../okta/okta.mocks';
import { mockDeleteAWSAPIGatewayAPIKey } from "./aws.mocks";
import OrganizationModel, { IOrganization } from "../../../src/models/organization";
import OrganizationApplicationModel, { IOrganizationApplication } from "../../../src/models/organization-application";
import OrganizationUserModel, { OrganizationUser } from "../../../src/models/organization-user";
import ApplicationUserModel from "../../../src/models/application-user";

chai.should();
chai.use(chaiDateTime);

let requester: ChaiHttp.Agent;

nock.disableNetConnect();
nock.enableNetConnect(process.env.HOST_IP);

describe('Delete application tests', () => {

    before(async () => {
        if (process.env.NODE_ENV !== 'test') {
            throw Error(`Running the test suite with NODE_ENV ${process.env.NODE_ENV} may result in permanent data loss. Please use NODE_ENV=test.`);
        }

        requester = await getTestAgent();
    });

    beforeEach(async () => {
        await ApplicationModel.deleteMany({}).exec();
    });

    it('Delete a application while not being logged in should return a 401 \'Unauthorized\' error', async () => {
        const application: HydratedDocument<IApplication> = await createApplication();

        const response: request.Response = await requester
            .delete(`/api/v1/application/${application._id.toString()}`);

        response.status.should.equal(401);
        response.body.should.have.property('errors').and.be.an('array').and.length(1);
        response.body.errors[0].should.have.property('status').and.equal(401);
        response.body.errors[0].should.have.property('detail').and.equal('Not authenticated');
    });

    it('Delete a application while being logged in as USER user should return a 403 \'Forbidden\' error', async () => {
        const token: string = mockValidJWT({ role: 'USER' });

        const application: HydratedDocument<IApplication> = await createApplication();

        const response: request.Response = await requester
            .delete(`/api/v1/application/${application._id.toString()}`)
            .set('Authorization', `Bearer ${token}`)
            .send({});

        response.status.should.equal(403);
        response.body.should.have.property('errors').and.be.an('array').and.length(1);
        response.body.errors[0].should.have.property('status').and.equal(403);
        response.body.errors[0].should.have.property('detail').and.equal('Not authorized');
    });

    it('Delete a application that does not exist while being logged in as ADMIN user should return a 404 \'Application not found\' error', async () => {
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

    it('Delete a application while being logged in with that user should return a 200 and the user data (happy case)', async () => {
        const token: string = mockValidJWT({ role: 'ADMIN' });

        const application: HydratedDocument<IApplication> = await createApplication();

        mockDeleteAWSAPIGatewayAPIKey(application.apiKeyId);

        const response: request.Response = await requester
            .delete(`/api/v1/application/${application._id.toString()}`)
            .set('Authorization', `Bearer ${token}`)
            .send({});

        response.status.should.equal(200);

        const responseApplication: Record<string, any> = response.body.data;
        const databaseApplication: IApplication = await ApplicationModel.findById(responseApplication.id);
        chai.expect(databaseApplication).to.be.null;

        responseApplication.should.have.property('type').and.equal('applications');
        responseApplication.should.have.property('id').and.equal(application._id.toString());
        responseApplication.should.have.property('attributes').and.be.an('object');
        response.body.data.attributes.should.have.property('name').and.equal(application.name);
        response.body.data.attributes.should.have.property('apiKeyValue').and.equal(application.apiKeyValue);
        response.body.data.attributes.should.have.property('createdAt');
        new Date(response.body.data.attributes.createdAt).should.equalDate(application.createdAt);
        response.body.data.attributes.should.have.property('updatedAt');
        new Date(response.body.data.attributes.updatedAt).should.equalDate(application.updatedAt);
    });

    describe('with associated organizations', () => {
        it('Delete a application with associated organization should be successful', async () => {
            const token: string = mockValidJWT({ role: 'ADMIN' });
            const testOrganization: IOrganization = await createOrganization();
            const testApplication: IApplication = await createApplication();

            await new OrganizationApplicationModel({
                application: testApplication,
                organization: testOrganization
            }).save();

            mockDeleteAWSAPIGatewayAPIKey(testApplication.apiKeyId);

            const response: request.Response = await requester
                .delete(`/api/v1/application/${testApplication._id.toString()}`)
                .set('Authorization', `Bearer ${token}`)
                .send({});

            response.status.should.equal(200);

            response.body.data.should.have.property('type').and.equal('applications');
            response.body.data.should.have.property('id').and.equal(testApplication._id.toString());
            response.body.data.should.have.property('attributes').and.be.an('object');
            response.body.data.attributes.should.have.property('name').and.equal(testApplication.name);
            response.body.data.attributes.should.have.property('organization').and.eql({
                id: testOrganization.id,
                name: testOrganization.name,
            });
            response.body.data.attributes.should.have.property('createdAt');
            new Date(response.body.data.attributes.createdAt).should.equalDate(testApplication.createdAt);
            response.body.data.attributes.should.have.property('updatedAt');
            new Date(response.body.data.attributes.updatedAt).should.equalDate(testApplication.updatedAt);

            const databaseOrganizationApplication: IOrganizationApplication[] = await OrganizationApplicationModel.findOne({ organization: testOrganization._id.toString() });
            expect(databaseOrganizationApplication).to.equal(null);
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
