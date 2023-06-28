import nock from 'nock';
import chai from 'chai';
import chaiDateTime from 'chai-datetime';
import { getTestAgent } from '../utils/test-server';
import request from 'superagent';
import { getMockOktaUser, mockGetUserById, mockInvalidJWT, mockValidJWT } from '../okta/okta.mocks';
import { describe } from "mocha";
import { TOKENS } from "../utils/test.constants";
import { OktaUser } from "services/okta.interfaces";
import application, { IApplication } from "models/application";
import { createApplication, createOrganization } from "../utils/helpers";
import ApplicationModel from "models/application";
import OrganizationModel, { IOrganization } from "models/organization";
import OrganizationApplicationModel from "models/organization-application";
import ApplicationUserModel from "models/application-user";
import OrganizationUserModel from "models/organization-user";
import { HydratedDocument } from "mongoose";

chai.should();
chai.use(chaiDateTime);

let requester: ChaiHttp.Agent;

nock.disableNetConnect();
nock.enableNetConnect(process.env.HOST_IP);

describe('Request validation tests', () => {

    before(async () => {
        if (process.env.NODE_ENV !== 'test') {
            throw Error(`Running the test suite with NODE_ENV ${process.env.NODE_ENV} may result in permanent data loss. Please use NODE_ENV=test.`);
        }

        requester = await getTestAgent();
    });

    beforeEach(async () => {
    });

    describe('is not accessible to non-MICROSERVICE users', () => {
        it('Request validation while not being logged in should return a 401 \'Unauthorized\' error', async () => {
            const response: request.Response = await requester
                .post(`/api/v1/request/validate`)
                .send({});

            response.status.should.equal(401);
            response.body.should.have.property('errors').and.be.an('array').and.length(1);
            response.body.errors[0].should.have.property('status', 401);
            response.body.errors[0].should.have.property('detail', 'Not authenticated');
        });

        it('Request validation while being logged in as USER should return a 403', async () => {
            const token: string = mockValidJWT({ role: 'USER' });

            const response: request.Response = await requester
                .post(`/api/v1/request/validate`)
                .set('Authorization', `Bearer ${token}`)
                .send({});

            response.status.should.equal(403);
            response.body.should.have.property('errors').and.be.an('array').and.length(1);
            response.body.errors[0].should.have.property('status').and.equal(403);
            response.body.errors[0].should.have.property('detail').and.equal('Not authorized');
        });

        it('Request validation while being logged in as MANAGER should return a 403', async () => {
            const token: string = mockValidJWT({ role: 'MANAGER' });

            const response: request.Response = await requester
                .post(`/api/v1/request/validate`)
                .set('Authorization', `Bearer ${token}`)
                .send({});

            response.status.should.equal(403);
            response.body.should.have.property('errors').and.be.an('array').and.length(1);
            response.body.errors[0].should.have.property('status').and.equal(403);
            response.body.errors[0].should.have.property('detail').and.equal('Not authorized');
        });

        it('Request validation while being logged in as ADMIN should return a 403', async () => {
            const token: string = mockValidJWT({ role: 'ADMIN' });

            const response: request.Response = await requester
                .post(`/api/v1/request/validate`)
                .set('Authorization', `Bearer ${token}`)
                .send({});

            response.status.should.equal(403);
            response.body.should.have.property('errors').and.be.an('array').and.length(1);
            response.body.errors[0].should.have.property('status').and.equal(403);
            response.body.errors[0].should.have.property('detail').and.equal('Not authorized');
        });
    })

    describe('body validation', () => {
        it('Request validation with body values other than "application" or "userToken" returns a 400 error', async () => {
            const microserviceToken: string = TOKENS.MICROSERVICE

            const response: request.Response = await requester
                .post(`/api/v1/request/validate`)
                .set('Authorization', `Bearer ${microserviceToken}`)
                .send({ "potato": "potato" });

            response.status.should.equal(400);
            response.body.should.have.property('errors').and.be.an('array').and.length(1);
            response.body.errors[0].should.have.property('status', 400);
            response.body.errors[0].should.have.property('detail', '"potato" is not allowed');
        });
    })

    it('Request validation with a valid apiKey and no userToken should return a 200 (happy case)', async () => {
        const microserviceToken: string = TOKENS.MICROSERVICE
        const testApplication: HydratedDocument<IApplication> = await createApplication();

        const response: request.Response = await requester
            .post(`/api/v1/request/validate`)
            .set('Authorization', `Bearer ${microserviceToken}`)
            .send({
                apiKey: testApplication.apiKeyValue
            });

        response.status.should.equal(200);

        response.body.should.have.property('application')
        const responseApplication = response.body.application.data;
        responseApplication.should.have.property('id').and.be.a('string');
        responseApplication.should.have.property('type').and.equal('applications');
        responseApplication.should.have.property('attributes').and.be.an('object');
        responseApplication.attributes.should.have.property('name').and.equal(testApplication.name);
        responseApplication.attributes.should.have.property('organization').and.equal(null);
        responseApplication.attributes.should.have.property('user').and.equal(null);
        responseApplication.attributes.should.have.property('apiKeyValue').and.equal(testApplication.apiKeyValue);
        responseApplication.attributes.should.have.property('createdAt');
        responseApplication.attributes.should.have.property('updatedAt');
    });

    it('Request validation with a valid userToken and no apiKey should return a 200 (happy case)', async () => {
        const microserviceToken: string = TOKENS.MICROSERVICE
        const testUser: OktaUser = getMockOktaUser({ role: 'ADMIN' });
        const token: string = mockValidJWT({
            id: testUser.profile.legacyId,
            email: testUser.profile.email,
            role: testUser.profile.role,
            extraUserData: { apps: testUser.profile.apps },
        });

        mockGetUserById(testUser);

        const response: request.Response = await requester
            .post(`/api/v1/request/validate`)
            .set('Authorization', `Bearer ${microserviceToken}`)
            .send({
                userToken: token
            });

        response.status.should.equal(200);

        response.body.should.have.property('user')
        const responseUser = response.body.user.data;
        responseUser.should.have.property('id').and.be.a('string');
        responseUser.should.have.property('_id').and.be.a('string');
        responseUser.should.have.property('extraUserData').and.be.an('object');
        responseUser.extraUserData.should.have.property('apps').and.be.an('array').and.deep.equal(testUser.profile.apps);
        responseUser.should.have.property('email').and.equal(testUser.profile.email);
        responseUser.should.have.property('role').and.equal(testUser.profile.role);
        responseUser.should.have.property('createdAt');
        responseUser.should.have.property('updatedAt');
    });

    it('Request validation with an invalid userToken field should return a 401 error', async () => {
        const microserviceToken: string = TOKENS.MICROSERVICE
        const testUser: OktaUser = getMockOktaUser({ role: 'ADMIN' });
        const token: string = mockInvalidJWT({
            id: testUser.profile.legacyId,
            email: testUser.profile.email,
            role: testUser.profile.role,
            extraUserData: { apps: testUser.profile.apps },
        });

        const response: request.Response = await requester
            .post(`/api/v1/request/validate`)
            .set('Authorization', `Bearer ${microserviceToken}`)
            .send({
                userToken: token
            });

        response.status.should.equal(401);
        response.body.should.have.property('errors').and.be.an('array').and.length(1);
        response.body.errors[0].should.have.property('status', 401);
        response.body.errors[0].should.have.property('detail', 'Invalid userToken');
    });

    it('Request validation with an invalid apiKey field should return a 404 error', async () => {
        const microserviceToken: string = TOKENS.MICROSERVICE

        const response: request.Response = await requester
            .post(`/api/v1/request/validate`)
            .set('Authorization', `Bearer ${microserviceToken}`)
            .send({
                apiKey: "invalidApiKey"
            });

        response.status.should.equal(404);
        response.body.should.have.property('errors').and.be.an('array').and.length(1);
        response.body.errors[0].should.have.property('status', 404);
        response.body.errors[0].should.have.property('detail', 'Application not found');
    });

    it('Request validation with valid userToken and apiKey should return a 200 with user and application data', async () => {
        const microserviceToken: string = TOKENS.MICROSERVICE
        const testUser: OktaUser = getMockOktaUser({ role: 'ADMIN' });
        const token: string = mockValidJWT({
            id: testUser.profile.legacyId,
            email: testUser.profile.email,
            role: testUser.profile.role,
            extraUserData: { apps: testUser.profile.apps },
        });
        mockGetUserById(testUser);

        const testApplication: IApplication = await createApplication();

        const response: request.Response = await requester
            .post(`/api/v1/request/validate`)
            .set('Authorization', `Bearer ${microserviceToken}`)
            .send({
                userToken: token,
                apiKey: testApplication.apiKeyValue
            });

        response.status.should.equal(200);

        response.body.should.have.property('user')

        const responseUser = response.body.user.data;
        responseUser.should.have.property('id').and.be.a('string');
        responseUser.should.have.property('_id').and.be.a('string');
        responseUser.should.have.property('extraUserData').and.be.an('object');
        responseUser.extraUserData.should.have.property('apps').and.be.an('array').and.deep.equal(testUser.profile.apps);
        responseUser.should.have.property('email').and.equal(testUser.profile.email);
        responseUser.should.have.property('role').and.equal(testUser.profile.role);
        responseUser.should.have.property('createdAt');
        responseUser.should.have.property('updatedAt');

        response.body.should.have.property('application')

        const responseApplication = response.body.application.data;
        responseApplication.should.have.property('id').and.equal(testApplication._id.toString());
        responseApplication.should.have.property('attributes').and.be.an('object');
        responseApplication.attributes.should.have.property('name').and.equal(testApplication.name);
        responseApplication.attributes.should.have.property('apiKeyValue').and.equal(testApplication.apiKeyValue);
        responseApplication.attributes.should.have.property('createdAt');
        new Date(responseApplication.attributes.createdAt).should.equalDate(testApplication.createdAt);
        responseApplication.attributes.should.have.property('updatedAt');
        new Date(responseApplication.attributes.updatedAt).should.equalDate(testApplication.updatedAt);
    });

    it('Request validation with valid userToken and apiKey should return a 200 with user and application data - including organization data', async () => {
        const microserviceToken: string = TOKENS.MICROSERVICE
        const testUser: OktaUser = getMockOktaUser({ role: 'ADMIN' });
        const token: string = mockValidJWT({
            id: testUser.profile.legacyId,
            email: testUser.profile.email,
            role: testUser.profile.role,
            extraUserData: { apps: testUser.profile.apps },
        });
        mockGetUserById(testUser);

        const testOrganization: IOrganization = await createOrganization();
        const testApplication: IApplication = await createApplication();

        await new OrganizationApplicationModel({
            application: testApplication,
            organization: testOrganization
        }).save();

        const response: request.Response = await requester
            .post(`/api/v1/request/validate`)
            .set('Authorization', `Bearer ${microserviceToken}`)
            .send({
                userToken: token,
                apiKey: testApplication.apiKeyValue
            });

        response.status.should.equal(200);

        response.body.should.have.property('user')

        const responseUser = response.body.user.data;
        responseUser.should.have.property('id').and.be.a('string');
        responseUser.should.have.property('_id').and.be.a('string');
        responseUser.should.have.property('extraUserData').and.be.an('object');
        responseUser.extraUserData.should.have.property('apps').and.be.an('array').and.deep.equal(testUser.profile.apps);
        responseUser.should.have.property('email').and.equal(testUser.profile.email);
        responseUser.should.have.property('role').and.equal(testUser.profile.role);
        responseUser.should.have.property('createdAt');
        responseUser.should.have.property('updatedAt');

        response.body.should.have.property('application')

        const responseApplication = response.body.application.data;
        responseApplication.should.have.property('id').and.equal(testApplication._id.toString());
        responseApplication.should.have.property('attributes').and.be.an('object');
        responseApplication.attributes.should.have.property('name').and.equal(testApplication.name);
        responseApplication.attributes.should.have.property('apiKeyValue').and.equal(testApplication.apiKeyValue);
        responseApplication.attributes.should.have.property('organization').and.eql({
            id: testOrganization.id,
            name: testOrganization.name,
        });
        responseApplication.attributes.should.have.property('createdAt');
        new Date(responseApplication.attributes.createdAt).should.equalDate(testApplication.createdAt);
        responseApplication.attributes.should.have.property('updatedAt');
        new Date(responseApplication.attributes.updatedAt).should.equalDate(testApplication.updatedAt);
    });

    it('Request validation with valid userToken and apiKey should return a 200 with user and application data - including user data', async () => {
        const microserviceToken: string = TOKENS.MICROSERVICE
        const testUser: OktaUser = getMockOktaUser({ role: 'ADMIN' });
        const applicationUser: OktaUser = getMockOktaUser({ role: 'USER' });
        const token: string = mockValidJWT({
            id: testUser.profile.legacyId,
            email: testUser.profile.email,
            role: testUser.profile.role,
            extraUserData: { apps: testUser.profile.apps },
        });
        mockGetUserById(testUser);
        mockGetUserById(applicationUser);

        const testApplication: IApplication = await createApplication();

        await new ApplicationUserModel({
            userId: applicationUser.profile.legacyId,
            application: testApplication._id.toString()
        }).save();

        const response: request.Response = await requester
            .post(`/api/v1/request/validate`)
            .set('Authorization', `Bearer ${microserviceToken}`)
            .send({
                userToken: token,
                apiKey: testApplication.apiKeyValue
            });

        response.status.should.equal(200);

        response.body.should.have.property('user')

        const responseUser = response.body.user.data;
        responseUser.should.have.property('id').and.be.a('string');
        responseUser.should.have.property('_id').and.be.a('string');
        responseUser.should.have.property('extraUserData').and.be.an('object');
        responseUser.extraUserData.should.have.property('apps').and.be.an('array').and.deep.equal(testUser.profile.apps);
        responseUser.should.have.property('email').and.equal(testUser.profile.email);
        responseUser.should.have.property('role').and.equal(testUser.profile.role);
        responseUser.should.have.property('createdAt');
        responseUser.should.have.property('updatedAt');

        response.body.should.have.property('application')

        const responseApplication = response.body.application.data;
        responseApplication.should.have.property('id').and.equal(testApplication._id.toString());
        responseApplication.should.have.property('attributes').and.be.an('object');
        responseApplication.attributes.should.have.property('name').and.equal(testApplication.name);
        responseApplication.attributes.should.have.property('apiKeyValue').and.equal(testApplication.apiKeyValue);
        responseApplication.attributes.should.have.property('user').and.eql({
            id: applicationUser.profile.legacyId,
            name: applicationUser.profile.displayName,
        });
        responseApplication.attributes.should.have.property('createdAt');
        new Date(responseApplication.attributes.createdAt).should.equalDate(testApplication.createdAt);
        responseApplication.attributes.should.have.property('updatedAt');
        new Date(responseApplication.attributes.updatedAt).should.equalDate(testApplication.updatedAt);
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
    });
});
