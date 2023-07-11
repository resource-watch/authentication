import nock from 'nock';
import chai from 'chai';
import mongoose, { HydratedDocument } from 'mongoose';
import ApplicationModel, { IApplication } from 'models/application';
import chaiDateTime from 'chai-datetime';
import { getTestAgent } from '../utils/test-server';
import { createApplication, createOrganization } from '../utils/helpers';
import request from 'superagent';
import { getMockOktaUser, mockGetUserById, mockValidJWT } from '../okta/okta.mocks';
import OrganizationModel, { IOrganization } from "models/organization";
import OrganizationApplicationModel from "models/organization-application";
import OrganizationUserModel, { ORGANIZATION_ROLES } from "models/organization-user";
import ApplicationUserModel from "models/application-user";
import { describe } from "mocha";
import { OktaUser } from "services/okta.interfaces";
import { mockValidateRequestWithApiKey, mockValidateRequestWithApiKeyAndUserToken } from "../utils/mocks";

chai.should();
chai.use(chaiDateTime);

let requester: ChaiHttp.Agent;

nock.disableNetConnect();
nock.enableNetConnect(process.env.HOST_IP);

describe('Get application by id tests', () => {

    before(async () => {
        if (process.env.NODE_ENV !== 'test') {
            throw Error(`Running the test suite with NODE_ENV ${process.env.NODE_ENV} may result in permanent data loss. Please use NODE_ENV=test.`);
        }

        requester = await getTestAgent();
    });

    beforeEach(async () => {
        await ApplicationModel.deleteMany({}).exec();
    });

    it('Get application by id without being authenticated should return a 401 \'Unauthorized\' error', async () => {
        const application: HydratedDocument<IApplication> = await createApplication();

        mockValidateRequestWithApiKey({});

        const response: request.Response = await requester
            .get(`/api/v1/application/${application._id.toString()}`)
            .set('x-api-key', 'api-key-test');

        response.status.should.equal(401);
        response.body.should.have.property('errors').and.be.an('array').and.length(1);
        response.body.errors[0].should.have.property('status').and.equal(401);
        response.body.errors[0].should.have.property('detail').and.equal('Not authenticated');
    });

    it('Get application by id while being authenticated as a USER that does not own the app should return a 403 \'Forbidden\' error', async () => {
        const token: string = mockValidJWT({ role: 'USER' });

        const application: HydratedDocument<IApplication> = await createApplication();

        mockValidateRequestWithApiKeyAndUserToken({ token });

        const response: request.Response = await requester
            .get(`/api/v1/application/${application._id.toString()}`)
            .set('Authorization', `Bearer ${token}`)
            .set('x-api-key', 'api-key-test');

        response.status.should.equal(403);
        response.body.should.have.property('errors').and.be.an('array').and.length(1);
        response.body.errors[0].should.have.property('status').and.equal(403);
        response.body.errors[0].should.have.property('detail').and.equal('Not authorized');
    });

    describe('USER role', () => {
        it('Get application by id while being logged in as USER that owns the application should return a 200 and application data', async () => {
            const testUser: OktaUser = getMockOktaUser({ role: 'USER' });
            const token: string = mockValidJWT({
                id: testUser.profile.legacyId,
                email: testUser.profile.email,
                role: testUser.profile.role,
                extraUserData: { apps: testUser.profile.apps },
            });

            const application: HydratedDocument<IApplication> = await createApplication();

            await new ApplicationUserModel({
                userId: testUser.profile.legacyId,
                application: application._id.toString()
            }).save();

            mockGetUserById(testUser);
            mockValidateRequestWithApiKeyAndUserToken({ token });

            const response: request.Response = await requester
                .get(`/api/v1/application/${application._id.toString()}`)
                .set('Authorization', `Bearer ${token}`)
                .set('x-api-key', 'api-key-test');

            response.status.should.equal(200);
            response.body.data.should.have.property('type').and.equal('applications');
            response.body.data.should.have.property('id').and.equal(application._id.toString());
            response.body.data.should.have.property('attributes').and.be.an('object');
            response.body.data.attributes.should.have.property('name').and.equal(application.name);
            response.body.data.attributes.should.have.property('apiKeyValue').and.equal(application.apiKeyValue);
            response.body.data.attributes.should.have.property('createdAt');
            new Date(response.body.data.attributes.createdAt).should.equalDate(application.createdAt);
            response.body.data.attributes.should.have.property('updatedAt');
            new Date(response.body.data.attributes.updatedAt).should.equalDate(application.updatedAt);
        });

        it('Get application by id while being logged in as USER that belongs to the organization that owns the application should return a 200 and application data', async () => {
            const testUser: OktaUser = getMockOktaUser({ role: 'USER' });
            const token: string = mockValidJWT({
                id: testUser.profile.legacyId,
                email: testUser.profile.email,
                role: testUser.profile.role,
                extraUserData: { apps: testUser.profile.apps },
            });

            const application: HydratedDocument<IApplication> = await createApplication();
            const testOrganization: IOrganization = await createOrganization();

            await new OrganizationApplicationModel({
                application: application,
                organization: testOrganization
            }).save();

            await new OrganizationUserModel({
                userId: testUser.profile.legacyId,
                organization: testOrganization,
                role: ORGANIZATION_ROLES.ORG_MEMBER
            }).save();

            mockValidateRequestWithApiKeyAndUserToken({ token });

            const response: request.Response = await requester
                .get(`/api/v1/application/${application._id.toString()}`)
                .set('Authorization', `Bearer ${token}`)
                .set('x-api-key', 'api-key-test');

            response.status.should.equal(200);
            response.body.data.should.have.property('type').and.equal('applications');
            response.body.data.should.have.property('id').and.equal(application._id.toString());
            response.body.data.should.have.property('attributes').and.be.an('object');
            response.body.data.attributes.should.have.property('name').and.equal(application.name);
            response.body.data.attributes.should.have.property('apiKeyValue').and.equal(application.apiKeyValue);
            response.body.data.attributes.should.have.property('createdAt');
            new Date(response.body.data.attributes.createdAt).should.equalDate(application.createdAt);
            response.body.data.attributes.should.have.property('updatedAt');
            new Date(response.body.data.attributes.updatedAt).should.equalDate(application.updatedAt);
        });

        it('Get application by id while being logged in as USER that does not own the application should return a 403 \'Forbidden\' error', async () => {
            const testUser: OktaUser = getMockOktaUser({ role: 'USER' });
            const token: string = mockValidJWT({
                id: testUser.profile.legacyId,
                email: testUser.profile.email,
                role: testUser.profile.role,
                extraUserData: { apps: testUser.profile.apps },
            });
            const otherUser: OktaUser = getMockOktaUser({ role: 'USER' });

            const application: HydratedDocument<IApplication> = await createApplication();

            await new ApplicationUserModel({
                userId: otherUser.profile.legacyId,
                application: application._id.toString()
            }).save();

            mockValidateRequestWithApiKeyAndUserToken({ token });

            const response: request.Response = await requester
                .get(`/api/v1/application/${application._id.toString()}`)
                .set('Authorization', `Bearer ${token}`)
                .set('x-api-key', 'api-key-test');

            response.status.should.equal(403);
            response.body.should.have.property('errors').and.be.an('array').and.length(1);
            response.body.errors[0].should.have.property('status').and.equal(403);
            response.body.errors[0].should.have.property('detail').and.equal('Not authorized');
        });
    });

    describe('MANAGER role', () => {
        it('Get application by id while being logged in as MANAGER that owns the application should return a 200 and application data', async () => {
            const testUser: OktaUser = getMockOktaUser({ role: 'MANAGER' });
            const token: string = mockValidJWT({
                id: testUser.profile.legacyId,
                email: testUser.profile.email,
                role: testUser.profile.role,
                extraUserData: { apps: testUser.profile.apps },
            });

            const application: HydratedDocument<IApplication> = await createApplication();

            await new ApplicationUserModel({
                userId: testUser.profile.legacyId,
                application: application._id.toString()
            }).save();

            mockGetUserById(testUser);

            mockValidateRequestWithApiKeyAndUserToken({ token });

            const response: request.Response = await requester
                .get(`/api/v1/application/${application._id.toString()}`)
                .set('x-api-key', 'api-key-test')
                .set('Authorization', `Bearer ${token}`);

            response.status.should.equal(200);
            response.body.data.should.have.property('type').and.equal('applications');
            response.body.data.should.have.property('id').and.equal(application._id.toString());
            response.body.data.should.have.property('attributes').and.be.an('object');
            response.body.data.attributes.should.have.property('name').and.equal(application.name);
            response.body.data.attributes.should.have.property('apiKeyValue').and.equal(application.apiKeyValue);
            response.body.data.attributes.should.have.property('createdAt');
            new Date(response.body.data.attributes.createdAt).should.equalDate(application.createdAt);
            response.body.data.attributes.should.have.property('updatedAt');
            new Date(response.body.data.attributes.updatedAt).should.equalDate(application.updatedAt);
        });

        it('Get application by id while being logged in as MANAGER that does not own the application should return a 200 and application data', async () => {
            const testUser: OktaUser = getMockOktaUser({ role: 'MANAGER' });
            const token: string = mockValidJWT({
                id: testUser.profile.legacyId,
                email: testUser.profile.email,
                role: testUser.profile.role,
                extraUserData: { apps: testUser.profile.apps },
            });
            const otherUser: OktaUser = getMockOktaUser({ role: 'USER' });

            const application: HydratedDocument<IApplication> = await createApplication();

            await new ApplicationUserModel({
                userId: otherUser.profile.legacyId,
                application: application._id.toString()
            }).save();

            mockGetUserById(otherUser);

            mockValidateRequestWithApiKeyAndUserToken({ token });

            const response: request.Response = await requester
                .get(`/api/v1/application/${application._id.toString()}`)
                .set('x-api-key', 'api-key-test')
                .set('Authorization', `Bearer ${token}`);

            response.status.should.equal(200);
            response.body.data.should.have.property('type').and.equal('applications');
            response.body.data.should.have.property('id').and.equal(application._id.toString());
            response.body.data.should.have.property('attributes').and.be.an('object');
            response.body.data.attributes.should.have.property('name').and.equal(application.name);
            response.body.data.attributes.should.have.property('apiKeyValue').and.equal(application.apiKeyValue);
            response.body.data.attributes.should.have.property('createdAt');
            new Date(response.body.data.attributes.createdAt).should.equalDate(application.createdAt);
            response.body.data.attributes.should.have.property('updatedAt');
            new Date(response.body.data.attributes.updatedAt).should.equalDate(application.updatedAt);
        });
    });

    it('Get application by id while being authenticated as an ADMIN user should return a 200 and the application data (happy case)', async () => {
        const token: string = mockValidJWT({ role: 'ADMIN' });

        const application: HydratedDocument<IApplication> = await createApplication();

        mockValidateRequestWithApiKeyAndUserToken({ token });

        const response: request.Response = await requester
            .get(`/api/v1/application/${application._id.toString()}`)
            .set('x-api-key', 'api-key-test')
            .set('Authorization', `Bearer ${token}`);

        response.status.should.equal(200);
        response.body.should.have.property('data').and.be.an('object');
        response.body.data.should.have.property('type').and.equal('applications');
        response.body.data.should.have.property('id').and.equal(application._id.toString());
        response.body.data.should.have.property('attributes').and.be.an('object');
        response.body.data.attributes.should.have.property('name').and.equal(application.name);
        response.body.data.attributes.should.have.property('apiKeyValue').and.equal(application.apiKeyValue);
        response.body.data.attributes.should.have.property('createdAt');
        new Date(response.body.data.attributes.createdAt).should.equalDate(application.createdAt);
        response.body.data.attributes.should.have.property('updatedAt');
        new Date(response.body.data.attributes.updatedAt).should.equalDate(application.updatedAt);

    });

    it('Get application by id for an invalid id should return a 404 \'Application not found\' error', async () => {
        const token: string = mockValidJWT({ role: 'ADMIN' });

        mockValidateRequestWithApiKeyAndUserToken({ token });

        const response: request.Response = await requester
            .get(`/api/v1/application/1234`)
            .set('x-api-key', 'api-key-test')
            .set('Authorization', `Bearer ${token}`);

        response.status.should.equal(404);
        response.body.should.have.property('errors').and.be.an('array').and.length(1);
        response.body.errors[0].should.have.property('status').and.equal(404);
        response.body.errors[0].should.have.property('detail').and.equal('Application not found');
    });

    it('Get application by id for an valid id that does not exist on the database should return a 404 \'Application not found\' error', async () => {
        const token: string = mockValidJWT({ role: 'ADMIN' });

        mockValidateRequestWithApiKeyAndUserToken({ token });

        const response: request.Response = await requester
            .get(`/api/v1/application/${new mongoose.Types.ObjectId()}`)
            .set('x-api-key', 'api-key-test')
            .set('Authorization', `Bearer ${token}`);

        response.status.should.equal(404);
        response.body.should.have.property('errors').and.be.an('array').and.length(1);
        response.body.errors[0].should.have.property('status').and.equal(404);
        response.body.errors[0].should.have.property('detail').and.equal('Application not found');
    });

    describe('with associated organizations', () => {
        it('Get application by id with associated organization should be successful', async () => {
            const token: string = mockValidJWT({ role: 'ADMIN' });
            const testOrganization: IOrganization = await createOrganization();
            const testApplication: IApplication = await createApplication();

            await new OrganizationApplicationModel({
                application: testApplication,
                organization: testOrganization
            }).save();

            mockValidateRequestWithApiKeyAndUserToken({ token });

            const response: request.Response = await requester
                .get(`/api/v1/application/${testApplication._id.toString()}`)
                .set('x-api-key', 'api-key-test')
                .set('Authorization', `Bearer ${token}`);

            response.status.should.equal(200);

            const databaseApplication: IApplication = await ApplicationModel.findById(response.body.data.id);

            response.body.data.should.have.property('type').and.equal('applications');
            response.body.data.should.have.property('id').and.equal(databaseApplication._id.toString());
            response.body.data.should.have.property('attributes').and.be.an('object');
            response.body.data.attributes.should.have.property('name').and.equal(databaseApplication.name);
            response.body.data.attributes.should.have.property('organization').and.eql({
                id: testOrganization.id,
                name: testOrganization.name,
            });
            response.body.data.attributes.should.have.property('createdAt');
            new Date(response.body.data.attributes.createdAt).should.equalDate(databaseApplication.createdAt);
            response.body.data.attributes.should.have.property('updatedAt');
            new Date(response.body.data.attributes.updatedAt).should.equalDate(databaseApplication.updatedAt);
        });
    })

    describe('with associated users', () => {
        it('Get applications with associated users should be successful', async () => {
            const user: OktaUser = getMockOktaUser({ role: 'ADMIN' });
            const token: string = mockValidJWT({
                id: user.profile.legacyId,
                email: user.profile.email,
                role: user.profile.role,
                extraUserData: { apps: user.profile.apps },
            });

            mockGetUserById(user);
            const testApplication: IApplication = await createApplication();

            await new ApplicationUserModel({
                userId: user.profile.legacyId,
                application: testApplication._id.toString()
            }).save();

            mockValidateRequestWithApiKeyAndUserToken({ token });

            const response: request.Response = await requester
                .get(`/api/v1/application/${testApplication._id.toString()}`)
                .set('x-api-key', 'api-key-test')
                .set('Authorization', `Bearer ${token}`);

            response.status.should.equal(200);
            response.body.data.should.have.property('type').and.equal('applications');
            response.body.data.should.have.property('id').and.equal(testApplication._id.toString());
            response.body.data.should.have.property('attributes').and.be.an('object');
            response.body.data.attributes.should.have.property('name').and.equal(testApplication.name);
            response.body.data.attributes.should.have.property('user').and.eql({
                id: user.profile.legacyId,
                name: user.profile.displayName,
            });
            response.body.data.attributes.should.have.property('createdAt');
            new Date(response.body.data.attributes.createdAt).should.equalDate(testApplication.createdAt);
            response.body.data.attributes.should.have.property('updatedAt');
            new Date(response.body.data.attributes.updatedAt).should.equalDate(testApplication.updatedAt);
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
