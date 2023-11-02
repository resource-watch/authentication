import nock from 'nock';
import chai from 'chai';
import ApplicationModel, { CreateApplicationsDto, IApplication } from 'models/application';
import chaiDateTime from 'chai-datetime';
import { getTestAgent } from '../utils/test-server';
import request from 'superagent';
import { getMockOktaUser, mockGetUserById, mockValidJWT } from '../okta/okta.mocks';
import { mockCreateAWSAPIGatewayAPIKey } from "./aws.mocks";
import { assertConnection, createApplication, createOrganization } from "../utils/helpers";
import OrganizationModel, { IOrganization } from "models/organization";
import OrganizationApplicationModel from "models/organization-application";
import OrganizationUserModel, { ORGANIZATION_ROLES } from "models/organization-user";
import ApplicationUserModel from "models/application-user";
import { OktaUser } from "services/okta.interfaces";
import { describe } from "mocha";
import mongoose from "mongoose";

chai.should();
chai.use(chaiDateTime);

let requester: ChaiHttp.Agent;

nock.disableNetConnect();
nock.enableNetConnect(process.env.HOST_IP);

const sendCreateApplicationRequest: (token: string, application?: Partial<CreateApplicationsDto>) => Promise<request.Response> = async (token: string, application: Partial<CreateApplicationsDto> = {}) => requester
    .post(`/api/v1/application`)
    .set('Authorization', `Bearer ${token}`)
    .set('x-api-key', 'api-key-test')
    .send({ ...application });

describe('Create application tests', () => {

    before(async () => {
        if (process.env.NODE_ENV !== 'test') {
            throw Error(`Running the test suite with NODE_ENV ${process.env.NODE_ENV} may result in permanent data loss. Please use NODE_ENV=test.`);
        }

        requester = await getTestAgent();
    });

    beforeEach(async () => {
        await ApplicationModel.deleteMany({}).exec();
    });

    it('Create a application while not being logged in should return a 401 \'Unauthorized\' error', async () => {
        const response: request.Response = await requester
            .post(`/api/v1/application`)
            .set('x-api-key', `api-key-test`)
            .send({});

        response.status.should.equal(401);
        response.body.should.have.property('errors').and.be.an('array').and.length(1);
        response.body.errors[0].should.have.property('status', 401);
        response.body.errors[0].should.have.property('detail', 'Not authenticated');
    });

    describe('USER role', () => {
        it('Create a application associated with myself (by omission) while being logged in as USER should return a 200', async () => {
            const testUser: OktaUser = getMockOktaUser({ role: 'USER' });
            const token: string = mockValidJWT({
                id: testUser.profile.legacyId,
                email: testUser.profile.email,
                role: testUser.profile.role,
                extraUserData: { apps: testUser.profile.apps },
            });

            mockGetUserById(testUser, 2);
            const apiKey: string = mockCreateAWSAPIGatewayAPIKey();

            const response: request.Response = await sendCreateApplicationRequest(token, { name: 'my application' });

            response.status.should.equal(200);

            const databaseApplication: IApplication = await ApplicationModel.findById(response.body.data.id);

            response.body.data.should.have.property('type').and.equal('applications');
            response.body.data.should.have.property('id').and.equal(databaseApplication._id.toString());
            response.body.data.should.have.property('attributes').and.be.an('object');
            response.body.data.attributes.should.have.property('name').and.equal(databaseApplication.name);
            response.body.data.attributes.should.have.property('apiKeyValue').and.equal(apiKey);
            response.body.data.attributes.should.have.property('createdAt');
            response.body.data.attributes.should.have.property('organization').and.null;
            response.body.data.attributes.should.have.property('user').and.not.empty;
            new Date(response.body.data.attributes.createdAt).should.equalDate(databaseApplication.createdAt);
            response.body.data.attributes.should.have.property('updatedAt');
            new Date(response.body.data.attributes.updatedAt).should.equalDate(databaseApplication.updatedAt);

            await assertConnection({ user: testUser, applicationId: response.body.data.id })
        });

        it('Create a application associated with myself (explicitly) while being logged in as USER should return a 200', async () => {
            const testUser: OktaUser = getMockOktaUser({ role: 'USER' });
            const token: string = mockValidJWT({
                id: testUser.profile.legacyId,
                email: testUser.profile.email,
                role: testUser.profile.role,
                extraUserData: { apps: testUser.profile.apps },
            });

            mockGetUserById(testUser, 2);
            const apiKey: string = mockCreateAWSAPIGatewayAPIKey();

            const response: request.Response = await sendCreateApplicationRequest(token, {
                name: 'my application', user: testUser.profile.legacyId,
            });

            response.status.should.equal(200);

            const databaseApplication: IApplication = await ApplicationModel.findById(response.body.data.id);

            response.body.data.should.have.property('type').and.equal('applications');
            response.body.data.should.have.property('id').and.equal(databaseApplication._id.toString());
            response.body.data.should.have.property('attributes').and.be.an('object');
            response.body.data.attributes.should.have.property('name').and.equal(databaseApplication.name);
            response.body.data.attributes.should.have.property('apiKeyValue').and.equal(apiKey);
            response.body.data.attributes.should.have.property('createdAt');
            response.body.data.attributes.should.have.property('organization').and.null;
            response.body.data.attributes.should.have.property('user').and.not.empty;
            new Date(response.body.data.attributes.createdAt).should.equalDate(databaseApplication.createdAt);
            response.body.data.attributes.should.have.property('updatedAt');
            new Date(response.body.data.attributes.updatedAt).should.equalDate(databaseApplication.updatedAt);

            await assertConnection({ user: testUser, applicationId: response.body.data.id })
        });

        it('Create a application associated with someone else while being logged in as USER should return a 403', async () => {
            const token: string = mockValidJWT({ role: 'USER' });

            const response: request.Response = await sendCreateApplicationRequest(token, {
                name: 'my application',
                user: new mongoose.Types.ObjectId().toString()
            });

            response.status.should.equal(403);
            response.body.should.have.property('errors').and.be.an('array').and.length(1);
            response.body.errors[0].should.have.property('status').and.equal(403);
            response.body.errors[0].should.have.property('detail').and.equal('User can only create applications for themselves or organizations they own');
        });

        it('Create a application associated with an organization with which the user is not associated with while being logged in as USER should return a 403', async () => {
            const token: string = mockValidJWT({ role: 'USER' });

            const testOrganization: IOrganization = await createOrganization();

            const response: request.Response = await sendCreateApplicationRequest(token, {
                name: 'my application',
                organization: testOrganization._id.toString()
            });

            response.status.should.equal(403);
            response.body.should.have.property('errors').and.be.an('array').and.length(1);
            response.body.errors[0].should.have.property('status').and.equal(403);
            response.body.errors[0].should.have.property('detail').and.equal('User can only create applications for themselves or organizations they own');
        });

        it('Create a application associated with an organization of which the user is an ORG_MEMBER with while being logged in as USER should return a 403', async () => {
            const testUser: OktaUser = getMockOktaUser({ role: 'USER' });
            const token: string = mockValidJWT({
                id: testUser.profile.legacyId,
                email: testUser.profile.email,
                role: testUser.profile.role,
                extraUserData: { apps: testUser.profile.apps },
            });

            const testOrganization: IOrganization = await createOrganization();

            await new OrganizationUserModel({
                organization: testOrganization._id.toString(),
                userId: testUser.profile.legacyId,
                role: ORGANIZATION_ROLES.ORG_MEMBER
            }).save();

            const response: request.Response = await sendCreateApplicationRequest(token, {
                name: 'my application',
                organization: testOrganization._id.toString()
            });

            response.status.should.equal(403);
            response.body.should.have.property('errors').and.be.an('array').and.length(1);
            response.body.errors[0].should.have.property('status').and.equal(403);
            response.body.errors[0].should.have.property('detail').and.equal('User can only create applications for themselves or organizations they own');
        });

        it('Create a application associated with an organization of which the user is an ORG_ADMIN with while being logged in as USER should be successful', async () => {
            const testUser: OktaUser = getMockOktaUser({ role: 'USER' });
            const token: string = mockValidJWT({
                id: testUser.profile.legacyId,
                email: testUser.profile.email,
                role: testUser.profile.role,
                extraUserData: { apps: testUser.profile.apps },
            });

            const testOrganization: IOrganization = await createOrganization();

            await new OrganizationUserModel({
                organization: testOrganization,
                userId: testUser.profile.legacyId,
                role: ORGANIZATION_ROLES.ORG_ADMIN
            }).save();

            const apiKey: string = mockCreateAWSAPIGatewayAPIKey();

            const response: request.Response = await sendCreateApplicationRequest(token, {
                name: 'my application',
                organization: testOrganization._id.toString()
            });

            response.status.should.equal(200);

            const databaseApplication: IApplication = await ApplicationModel.findById(response.body.data.id);

            response.body.data.should.have.property('type').and.equal('applications');
            response.body.data.should.have.property('id').and.equal(databaseApplication._id.toString());
            response.body.data.should.have.property('attributes').and.be.an('object');
            response.body.data.attributes.should.have.property('name').and.equal(databaseApplication.name);
            response.body.data.attributes.should.have.property('apiKeyValue').and.equal(apiKey);
            response.body.data.attributes.should.have.property('createdAt');
            new Date(response.body.data.attributes.createdAt).should.equalDate(databaseApplication.createdAt);
            response.body.data.attributes.should.have.property('updatedAt');
            new Date(response.body.data.attributes.updatedAt).should.equalDate(databaseApplication.updatedAt);
        });
    });

    describe('MANAGER role', () => {
        it('Create a application associated with myself (by omission) while being logged in as MANAGER should return a 200', async () => {
            const testUser: OktaUser = getMockOktaUser({ role: 'MANAGER' });
            const token: string = mockValidJWT({
                id: testUser.profile.legacyId,
                email: testUser.profile.email,
                role: testUser.profile.role,
                extraUserData: { apps: testUser.profile.apps },
            });

            mockGetUserById(testUser, 2);
            const apiKey: string = mockCreateAWSAPIGatewayAPIKey();

            const response: request.Response = await sendCreateApplicationRequest(token, { name: 'my application' });

            response.status.should.equal(200);

            const databaseApplication: IApplication = await ApplicationModel.findById(response.body.data.id);

            response.body.data.should.have.property('type').and.equal('applications');
            response.body.data.should.have.property('id').and.equal(databaseApplication._id.toString());
            response.body.data.should.have.property('attributes').and.be.an('object');
            response.body.data.attributes.should.have.property('name').and.equal(databaseApplication.name);
            response.body.data.attributes.should.have.property('apiKeyValue').and.equal(apiKey);
            response.body.data.attributes.should.have.property('createdAt');
            response.body.data.attributes.should.have.property('organization').and.null;
            response.body.data.attributes.should.have.property('user').and.not.empty;
            new Date(response.body.data.attributes.createdAt).should.equalDate(databaseApplication.createdAt);
            response.body.data.attributes.should.have.property('updatedAt');
            new Date(response.body.data.attributes.updatedAt).should.equalDate(databaseApplication.updatedAt);

            await assertConnection({ user: testUser, applicationId: response.body.data.id })
        });

        it('Create a application associated with myself (explicitly) while being logged in as MANAGER should return a 200', async () => {
            const testUser: OktaUser = getMockOktaUser({ role: 'MANAGER' });
            const token: string = mockValidJWT({
                id: testUser.profile.legacyId,
                email: testUser.profile.email,
                role: testUser.profile.role,
                extraUserData: { apps: testUser.profile.apps },
            });

            mockGetUserById(testUser, 2);
            const apiKey: string = mockCreateAWSAPIGatewayAPIKey();

            const response: request.Response = await sendCreateApplicationRequest(token, {
                name: 'my application', user: testUser.profile.legacyId,
            });

            response.status.should.equal(200);

            const databaseApplication: IApplication = await ApplicationModel.findById(response.body.data.id);

            response.body.data.should.have.property('type').and.equal('applications');
            response.body.data.should.have.property('id').and.equal(databaseApplication._id.toString());
            response.body.data.should.have.property('attributes').and.be.an('object');
            response.body.data.attributes.should.have.property('name').and.equal(databaseApplication.name);
            response.body.data.attributes.should.have.property('apiKeyValue').and.equal(apiKey);
            response.body.data.attributes.should.have.property('createdAt');
            response.body.data.attributes.should.have.property('organization').and.null;
            response.body.data.attributes.should.have.property('user').and.not.empty;
            new Date(response.body.data.attributes.createdAt).should.equalDate(databaseApplication.createdAt);
            response.body.data.attributes.should.have.property('updatedAt');
            new Date(response.body.data.attributes.updatedAt).should.equalDate(databaseApplication.updatedAt);

            await assertConnection({ user: testUser, applicationId: response.body.data.id })
        });

        it('Create a application associated with someone else while being logged in as MANAGER should return a 403', async () => {
            const token: string = mockValidJWT({ role: 'MANAGER' });

            const response: request.Response = await sendCreateApplicationRequest(token, {
                name: 'my application',
                user: new mongoose.Types.ObjectId().toString()
            });

            response.status.should.equal(403);
            response.body.should.have.property('errors').and.be.an('array').and.length(1);
            response.body.errors[0].should.have.property('status').and.equal(403);
            response.body.errors[0].should.have.property('detail').and.equal('User can only create applications for themselves or organizations they own');
        });

        it('Create a application associated with an organization with which the user is not associated with while being logged in as MANAGER should return a 403', async () => {
            const token: string = mockValidJWT({ role: 'MANAGER' });

            const testOrganization: IOrganization = await createOrganization();

            const response: request.Response = await sendCreateApplicationRequest(token, {
                name: 'my application',
                organization: testOrganization._id.toString()
            });

            response.status.should.equal(403);
            response.body.should.have.property('errors').and.be.an('array').and.length(1);
            response.body.errors[0].should.have.property('status').and.equal(403);
            response.body.errors[0].should.have.property('detail').and.equal('User can only create applications for themselves or organizations they own');
        });

        it('Create a application associated with an organization of which the user is an ORG_MEMBER with while being logged in as MANAGER should return a 403', async () => {
            const testUser: OktaUser = getMockOktaUser({ role: 'MANAGER' });
            const token: string = mockValidJWT({
                id: testUser.profile.legacyId,
                email: testUser.profile.email,
                role: testUser.profile.role,
                extraUserData: { apps: testUser.profile.apps },
            });

            const testOrganization: IOrganization = await createOrganization();

            await new OrganizationUserModel({
                organization: testOrganization._id.toString(),
                userId: testUser.profile.legacyId,
                role: ORGANIZATION_ROLES.ORG_MEMBER
            }).save();

            const response: request.Response = await sendCreateApplicationRequest(token, {
                name: 'my application',
                organization: testOrganization._id.toString()
            });

            response.status.should.equal(403);
            response.body.should.have.property('errors').and.be.an('array').and.length(1);
            response.body.errors[0].should.have.property('status').and.equal(403);
            response.body.errors[0].should.have.property('detail').and.equal('User can only create applications for themselves or organizations they own');
        });

        it('Create a application associated with an organization of which the user is an ORG_ADMIN with while being logged in as MANAGER should be successful', async () => {
            const testUser: OktaUser = getMockOktaUser({ role: 'MANAGER' });
            const token: string = mockValidJWT({
                id: testUser.profile.legacyId,
                email: testUser.profile.email,
                role: testUser.profile.role,
                extraUserData: { apps: testUser.profile.apps },
            });

            const testOrganization: IOrganization = await createOrganization();

            await new OrganizationUserModel({
                organization: testOrganization,
                userId: testUser.profile.legacyId,
                role: ORGANIZATION_ROLES.ORG_ADMIN
            }).save();

            const apiKey: string = mockCreateAWSAPIGatewayAPIKey();

            const response: request.Response = await sendCreateApplicationRequest(token, {
                name: 'my application',
                organization: testOrganization._id.toString()
            });

            response.status.should.equal(200);

            const databaseApplication: IApplication = await ApplicationModel.findById(response.body.data.id);

            response.body.data.should.have.property('type').and.equal('applications');
            response.body.data.should.have.property('id').and.equal(databaseApplication._id.toString());
            response.body.data.should.have.property('attributes').and.be.an('object');
            response.body.data.attributes.should.have.property('name').and.equal(databaseApplication.name);
            response.body.data.attributes.should.have.property('apiKeyValue').and.equal(apiKey);
            response.body.data.attributes.should.have.property('createdAt');
            new Date(response.body.data.attributes.createdAt).should.equalDate(databaseApplication.createdAt);
            response.body.data.attributes.should.have.property('updatedAt');
            new Date(response.body.data.attributes.updatedAt).should.equalDate(databaseApplication.updatedAt);
        });
    });

    describe('Missing or incorrect data', () => {
        it('Create a application while being logged in as ADMIN without the required name field should return a 400 error', async () => {
            const token: string = mockValidJWT({ role: 'ADMIN' });

            const response: request.Response = await sendCreateApplicationRequest(token);

            response.status.should.equal(400);
            response.body.should.have.property('errors').and.be.an('array').and.length(1);
            response.body.errors[0].should.have.property('status', 400);
            response.body.errors[0].should.have.property('detail', '"name" is required');
        });
    });

    it('Create a application while being logged in as ADMIN should return a 200 (happy case)', async () => {
        const testUser: OktaUser = getMockOktaUser({ role: 'ADMIN' });
        const token: string = mockValidJWT({
            id: testUser.profile.legacyId,
            email: testUser.profile.email,
            role: testUser.profile.role,
            extraUserData: { apps: testUser.profile.apps },
        });

        mockGetUserById(testUser, 2);
        const apiKey: string = mockCreateAWSAPIGatewayAPIKey();

        const response: request.Response = await sendCreateApplicationRequest(token, {
            name: "my application",
            user: testUser.profile.legacyId
        });
        response.status.should.equal(200);

        const databaseApplication: IApplication = await ApplicationModel.findById(response.body.data.id);

        response.body.data.should.have.property('type').and.equal('applications');
        response.body.data.should.have.property('id').and.equal(databaseApplication._id.toString());
        response.body.data.should.have.property('attributes').and.be.an('object');
        response.body.data.attributes.should.have.property('name').and.equal(databaseApplication.name);
        response.body.data.attributes.should.have.property('apiKeyValue').and.equal(apiKey);
        response.body.data.attributes.should.have.property('createdAt');
        response.body.data.attributes.should.have.property('organization').and.null;
        response.body.data.attributes.should.have.property('user').and.not.empty;
        new Date(response.body.data.attributes.createdAt).should.equalDate(databaseApplication.createdAt);
        response.body.data.attributes.should.have.property('updatedAt');
        new Date(response.body.data.attributes.updatedAt).should.equalDate(databaseApplication.updatedAt);

        await assertConnection({ user: testUser, applicationId: response.body.data.id })
    });

    it('Create a application while being logged in as ADMIN without user or organization should return a 200 and associate the application with the current user', async () => {
        const testUser: OktaUser = getMockOktaUser({ role: 'ADMIN' });
        const token: string = mockValidJWT({
            id: testUser.profile.legacyId,
            email: testUser.profile.email,
            role: testUser.profile.role,
            extraUserData: { apps: testUser.profile.apps },
        });

        mockGetUserById(testUser, 2);
        const apiKey = mockCreateAWSAPIGatewayAPIKey();

        const response: request.Response = await sendCreateApplicationRequest(token, {
            name: "my application"
        });
        response.status.should.equal(200);

        const databaseApplication: IApplication = await ApplicationModel.findById(response.body.data.id);

        response.body.data.should.have.property('type').and.equal('applications');
        response.body.data.should.have.property('id').and.equal(databaseApplication._id.toString());
        response.body.data.should.have.property('attributes').and.be.an('object');
        response.body.data.attributes.should.have.property('name').and.equal(databaseApplication.name);
        response.body.data.attributes.should.have.property('apiKeyValue').and.equal(apiKey);
        response.body.data.attributes.should.have.property('createdAt');
        new Date(response.body.data.attributes.createdAt).should.equalDate(databaseApplication.createdAt);
        response.body.data.attributes.should.have.property('updatedAt');
        new Date(response.body.data.attributes.updatedAt).should.equalDate(databaseApplication.updatedAt);
    });

    describe('with associated organization', () => {
        it('Create an application and setting an existing organization should be successful', async () => {
            const token: string = mockValidJWT({ role: 'ADMIN' });
            const testOrganization: IOrganization = await createOrganization();

            mockCreateAWSAPIGatewayAPIKey({ name: 'new application name' })

            const response: request.Response = await requester
                .post(`/api/v1/application`)
                .set('Authorization', `Bearer ${token}`)
                .set('x-api-key', 'api-key-test')
                .send({
                    name: 'new application name',
                    organization: testOrganization.id
                });

            response.status.should.equal(200);

            const databaseApplication: IApplication = await ApplicationModel.findById(response.body.data.id);

            response.body.data.should.have.property('type').and.equal('applications');
            response.body.data.should.have.property('id').and.equal(databaseApplication._id.toString());
            response.body.data.should.have.property('attributes').and.be.an('object');
            response.body.data.attributes.should.have.property('name').and.equal(databaseApplication.name);
            response.body.data.attributes.should.have.property('apiKeyValue').and.equal(databaseApplication.apiKeyValue);
            response.body.data.attributes.should.have.property('organization').and.eql({
                id: testOrganization.id,
                name: testOrganization.name,
            });
            response.body.data.attributes.should.have.property('createdAt');
            new Date(response.body.data.attributes.createdAt).should.equalDate(databaseApplication.createdAt);
            response.body.data.attributes.should.have.property('updatedAt');
            new Date(response.body.data.attributes.updatedAt).should.equalDate(databaseApplication.updatedAt);

            await assertConnection({ organization: testOrganization, applicationId: response.body.data.id });
        });

        it('Create an application and associating it to an existing organization with links to other applications should be successful and not affect previous application links', async () => {
            const token: string = mockValidJWT({ role: 'ADMIN' });
            const testOrganization: IOrganization = await createOrganization();

            const preexistingApplication: IApplication = await createApplication();

            await new OrganizationApplicationModel({
                organization: testOrganization._id.toString(),
                application: preexistingApplication._id.toString()
            }).save();

            mockCreateAWSAPIGatewayAPIKey({ name: 'new application name' });

            const response: request.Response = await requester
                .post(`/api/v1/application`)
                .set('Authorization', `Bearer ${token}`)
                .set('x-api-key', 'api-key-test')
                .send({
                    name: 'new application name',
                    organization: testOrganization.id
                });

            response.status.should.equal(200);

            const databaseApplication: IApplication = await ApplicationModel.findById(response.body.data.id);

            response.body.data.should.have.property('type').and.equal('applications');
            response.body.data.should.have.property('id').and.equal(databaseApplication._id.toString());
            response.body.data.should.have.property('attributes').and.be.an('object');
            response.body.data.attributes.should.have.property('name').and.equal(databaseApplication.name);
            response.body.data.attributes.should.have.property('apiKeyValue').and.equal(databaseApplication.apiKeyValue);
            response.body.data.attributes.should.have.property('organization').and.eql(
                {
                    id: testOrganization.id,
                    name: testOrganization.name,
                }
            );
            response.body.data.attributes.should.have.property('createdAt');
            new Date(response.body.data.attributes.createdAt).should.equalDate(databaseApplication.createdAt);
            response.body.data.attributes.should.have.property('updatedAt');
            new Date(response.body.data.attributes.updatedAt).should.equalDate(databaseApplication.updatedAt);

            await assertConnection({ organization: testOrganization, applicationId: response.body.data.id })
            await assertConnection({ organization: testOrganization, application: preexistingApplication })
        });
    })

    describe('with associated user', () => {
        it('Create an application and setting an existing user should be successful', async () => {
            const testUser: OktaUser = getMockOktaUser({ role: 'ADMIN' });
            const token: string = mockValidJWT({
                id: testUser.profile.legacyId,
                email: testUser.profile.email,
                role: testUser.profile.role,
                extraUserData: { apps: testUser.profile.apps },
            });

            mockGetUserById(testUser, 2);

            mockCreateAWSAPIGatewayAPIKey({ name: 'new application name' });

            const response: request.Response = await requester
                .post(`/api/v1/application`)
                .set('Authorization', `Bearer ${token}`)
                .set('x-api-key', 'api-key-test')
                .send({
                    name: 'new application name',
                    user: testUser.profile.legacyId
                });

            response.status.should.equal(200);

            const databaseApplication: IApplication = await ApplicationModel.findById(response.body.data.id);

            response.body.data.should.have.property('type').and.equal('applications');
            response.body.data.should.have.property('id').and.equal(databaseApplication._id.toString());
            response.body.data.should.have.property('attributes').and.be.an('object');
            response.body.data.attributes.should.have.property('name').and.equal(databaseApplication.name);
            response.body.data.attributes.should.have.property('apiKeyValue').and.equal(databaseApplication.apiKeyValue);
            response.body.data.attributes.should.have.property('user').and.eql({
                id: testUser.profile.legacyId,
                name: testUser.profile.displayName,
            });
            response.body.data.attributes.should.have.property('createdAt');
            new Date(response.body.data.attributes.createdAt).should.equalDate(databaseApplication.createdAt);
            response.body.data.attributes.should.have.property('updatedAt');
            new Date(response.body.data.attributes.updatedAt).should.equalDate(databaseApplication.updatedAt);

            await assertConnection({ user: testUser, applicationId: response.body.data.id });
        });

        it('Create an application and associating it to an existing user with links to other applications should be successful and not affect previous application links', async () => {
            const testUser: OktaUser = getMockOktaUser({ role: 'ADMIN' });
            const token: string = mockValidJWT({
                id: testUser.profile.legacyId,
                email: testUser.profile.email,
                role: testUser.profile.role,
                extraUserData: { apps: testUser.profile.apps },
            });

            mockGetUserById(testUser, 2);

            const preexistingApplication: IApplication = await createApplication();

            await new ApplicationUserModel({
                userId: testUser.profile.legacyId,
                application: preexistingApplication._id.toString()
            }).save();

            mockCreateAWSAPIGatewayAPIKey({ name: 'new application name' })

            const response: request.Response = await requester
                .post(`/api/v1/application`)
                .set('Authorization', `Bearer ${token}`)
                .set('x-api-key', 'api-key-test')
                .send({
                    name: 'new application name',
                    user: testUser.profile.legacyId
                });

            response.status.should.equal(200);

            const databaseApplication: IApplication = await ApplicationModel.findById(response.body.data.id);

            response.body.data.should.have.property('type').and.equal('applications');
            response.body.data.should.have.property('id').and.equal(databaseApplication._id.toString());
            response.body.data.should.have.property('attributes').and.be.an('object');
            response.body.data.attributes.should.have.property('name').and.equal(databaseApplication.name);
            response.body.data.attributes.should.have.property('apiKeyValue').and.equal(databaseApplication.apiKeyValue);
            response.body.data.attributes.should.have.property('user').and.eql({
                id: testUser.profile.legacyId,
                name: testUser.profile.displayName,
            });
            response.body.data.attributes.should.have.property('createdAt');
            new Date(response.body.data.attributes.createdAt).should.equalDate(databaseApplication.createdAt);
            response.body.data.attributes.should.have.property('updatedAt');
            new Date(response.body.data.attributes.updatedAt).should.equalDate(databaseApplication.updatedAt);

            await assertConnection({ user: testUser, applicationId: response.body.data.id })
            await assertConnection({ user: testUser, application: preexistingApplication })
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
