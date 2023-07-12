import nock from 'nock';
import chai from 'chai';
import OrganizationModel, { CreateOrganizationsDto, IOrganization } from 'models/organization';
import chaiDateTime from 'chai-datetime';
import { getTestAgent } from '../utils/test-server';
import request from 'superagent';
import { getMockOktaUser, mockGetUserById, mockValidJWT } from '../okta/okta.mocks';
import { assertConnection, assertNoConnection, createApplication, createOrganization } from "../utils/helpers";
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

const sendCreateOrganizationRequest: (token: string, organization?: Partial<CreateOrganizationsDto>) => Promise<request.Response> = async (token: string, organization: Partial<CreateOrganizationsDto> = {}) => {
    return requester
        .post(`/api/v1/organization`)
        .set('Authorization', `Bearer ${token}`)
        .set('x-api-key', 'api-key-test')
        .send({ ...organization });
}

describe('Create organization tests', () => {

    before(async () => {
        if (process.env.NODE_ENV !== 'test') {
            throw Error(`Running the test suite with NODE_ENV ${process.env.NODE_ENV} may result in permanent data loss. Please use NODE_ENV=test.`);
        }

        requester = await getTestAgent();
    });

    beforeEach(async () => {
        await OrganizationModel.deleteMany({}).exec();
    });

    it('Create a organization while not being logged in should return a 401 \'Unauthorized\' error', async () => {
        const response: request.Response = await requester
            .post(`/api/v1/organization`)
            .set('x-api-key', 'api-key-test')
            .send({});

        response.status.should.equal(401);
        response.body.should.have.property('errors').and.be.an('array').and.length(1);
        response.body.errors[0].should.have.property('status', 401);
        response.body.errors[0].should.have.property('detail', 'Not authenticated');
    });

    it('Create a organization while being logged in as USER should return a 403', async () => {
        const token: string = mockValidJWT({ role: 'USER' });

        const response: request.Response = await sendCreateOrganizationRequest(token);

        response.status.should.equal(403);
        response.body.should.have.property('errors').and.be.an('array').and.length(1);
        response.body.errors[0].should.have.property('status').and.equal(403);
        response.body.errors[0].should.have.property('detail').and.equal('Not authorized');
    });

    it('Create a organization while being logged in as ADMIN without the required fields should return a 400 \'Unauthorized\' error', async () => {
        const token: string = mockValidJWT({ role: 'ADMIN' });

        const response: request.Response = await sendCreateOrganizationRequest(token);

        response.status.should.equal(400);
        response.body.should.have.property('errors').and.be.an('array').and.length(1);
        response.body.errors[0].should.have.property('status', 400);
        response.body.errors[0].should.have.property('detail', '"name" is required');
    });

    it('Create a organization without users should return a 400 error', async () => {
        const token: string = mockValidJWT({ role: 'ADMIN' });

        const response: request.Response = await sendCreateOrganizationRequest(token, { name: "my organization" });
        response.status.should.equal(400);
        response.body.should.have.property('errors').and.be.an('array').and.length(1);
        response.body.errors[0].should.have.property('status', 400);
        response.body.errors[0].should.have.property('detail', '"users" is required');
    });

    it('Create a organization with an empty users list should return a 400 error', async () => {
        const token: string = mockValidJWT({ role: 'ADMIN' });

        const response: request.Response = await sendCreateOrganizationRequest(token, {
            name: "my organization",
            users: []
        });
        response.status.should.equal(400);
        response.body.should.have.property('errors').and.be.an('array').and.length(1);
        response.body.errors[0].should.have.property('status', 400);
        response.body.errors[0].should.have.property('detail', '"users" must contain at least 1 items');
    });

    it('Create a organization with users but no owners should return a 400 error', async () => {
        const testUser: OktaUser = getMockOktaUser({ role: 'ADMIN' });
        const token: string = mockValidJWT({
            id: testUser.profile.legacyId,
            email: testUser.profile.email,
            role: testUser.profile.role,
            extraUserData: { apps: testUser.profile.apps },
        });

        const response: request.Response = await sendCreateOrganizationRequest(token, {
            name: "my organization",
            users: [{ id: testUser.profile.legacyId, role: 'ORG_MEMBER' }]

        });
        response.status.should.equal(400);
        response.body.should.have.property('errors').and.be.an('array').and.length(1);
        response.body.errors[0].should.have.property('status', 400);
        response.body.errors[0].should.have.property('detail', '"users" must contain a user with role ORG_ADMIN');
    });

    it('Create a organization while being logged in as ADMIN should return a 200 (happy case)', async () => {
        const testUser: OktaUser = getMockOktaUser({ role: 'ADMIN' });
        const token: string = mockValidJWT({
            id: testUser.profile.legacyId,
            email: testUser.profile.email,
            role: testUser.profile.role,
            extraUserData: { apps: testUser.profile.apps },
        });

        mockGetUserById(testUser);

        const response: request.Response = await sendCreateOrganizationRequest(token, {
            name: "my organization",
            users: [{ id: testUser.profile.legacyId, role: 'ORG_ADMIN' }]

        });
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

    describe('with associated applications', () => {
        it('Create an organization with associated application should be successful', async () => {
            const testUser: OktaUser = getMockOktaUser({ role: 'ADMIN' });
            const token: string = mockValidJWT({
                id: testUser.profile.legacyId,
                email: testUser.profile.email,
                role: testUser.profile.role,
                extraUserData: { apps: testUser.profile.apps },
            });

            mockGetUserById(testUser);
            const testApplication: IApplication = await createApplication();

            const response: request.Response = await sendCreateOrganizationRequest(token, {
                name: "my organization",
                applications: [testApplication.id],
                users: [{ id: testUser.profile.legacyId, role: 'ORG_ADMIN' }]
            });
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

            await assertConnection({ application: testApplication, organization: databaseOrganization });
        });

        it('Create an organization with associated application that belong to other organizations should be successful and remove link to the previous organization', async () => {
            const testUser: OktaUser = getMockOktaUser({ role: 'ADMIN' });
            const token: string = mockValidJWT({
                id: testUser.profile.legacyId,
                email: testUser.profile.email,
                role: testUser.profile.role,
                extraUserData: { apps: testUser.profile.apps },
            });

            mockGetUserById(testUser);
            const testApplication: IApplication = await createApplication();
            const previousOrganization: IOrganization = await createOrganization();

            await new OrganizationApplicationModel({
                organization: previousOrganization,
                application: testApplication
            }).save();

            const response: request.Response = await sendCreateOrganizationRequest(token, {
                name: "my organization",
                applications: [testApplication.id],
                users: [{ id: testUser.profile.legacyId, role: 'ORG_ADMIN' }]
            });
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

            await assertConnection({ application: testApplication, organization: databaseOrganization });
            await assertNoConnection({ application: testApplication, organization: previousOrganization });
        });

        it('Create an organization with associated application that belong to a user should be successful and remove link to the previous user', async () => {
            const testApplication: IApplication = await createApplication();
            const testUser: OktaUser = getMockOktaUser({ role: 'ADMIN' });
            const token: string = mockValidJWT({
                id: testUser.profile.legacyId,
                email: testUser.profile.email,
                role: testUser.profile.role,
                extraUserData: { apps: testUser.profile.apps },
            });

            mockGetUserById(testUser);

            await new ApplicationUserModel({
                userId: testUser.profile.legacyId,
                application: testApplication
            }).save();

            const response: request.Response = await sendCreateOrganizationRequest(token, {
                name: "my organization",
                applications: [testApplication.id],
                users: [{ id: testUser.profile.legacyId, role: 'ORG_ADMIN' }]
            });
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

            await assertConnection({ application: testApplication, organization: databaseOrganization });
            await assertNoConnection({ application: testApplication, userId: testUser.profile.legacyId });
        });
    })

    describe('with associated users', () => {
        it('Create an organization with associated user should be successful', async () => {
            const testUser: OktaUser = getMockOktaUser({ role: 'ADMIN' });
            const token: string = mockValidJWT({
                id: testUser.profile.legacyId,
                email: testUser.profile.email,
                role: testUser.profile.role,
                extraUserData: { apps: testUser.profile.apps },
            });

            mockGetUserById(testUser);

            const response: request.Response = await sendCreateOrganizationRequest(token, {
                name: "my organization",
                users: [{ id: testUser.profile.legacyId, role: 'ORG_ADMIN' }]
            });
            response.status.should.equal(200);

            const databaseOrganization: IOrganization = await OrganizationModel.findById(response.body.data.id);

            response.body.data.should.have.property('type').and.equal('organizations');
            response.body.data.should.have.property('id').and.equal(databaseOrganization._id.toString());
            response.body.data.should.have.property('attributes').and.be.an('object');
            response.body.data.attributes.should.have.property('name').and.equal(databaseOrganization.name);
            response.body.data.attributes.should.have.property('users').and.eql([{
                id: testUser.profile.legacyId,
                name: testUser.profile.displayName,
                role: 'ORG_ADMIN'
            }]);
            response.body.data.attributes.should.have.property('createdAt');
            new Date(response.body.data.attributes.createdAt).should.equalDate(databaseOrganization.createdAt);
            response.body.data.attributes.should.have.property('updatedAt');
            new Date(response.body.data.attributes.updatedAt).should.equalDate(databaseOrganization.updatedAt);

            await assertConnection({ userId: testUser.profile.legacyId, organization: databaseOrganization });
        });

        it('Create an organization with associated user that belong to other organizations should be successful and remove link to the previous organization', async () => {
            const testUser: OktaUser = getMockOktaUser({ role: 'ADMIN' });
            const token: string = mockValidJWT({
                id: testUser.profile.legacyId,
                email: testUser.profile.email,
                role: testUser.profile.role,
                extraUserData: { apps: testUser.profile.apps },
            });

            mockGetUserById(testUser);

            const previousOrganization: IOrganization = await createOrganization();

            await new OrganizationUserModel({
                organization: previousOrganization,
                userId: testUser.profile.legacyId,
                role: 'ORG_ADMIN'
            }).save();

            const response: request.Response = await sendCreateOrganizationRequest(token, {
                name: "my organization",
                users: [{ id: testUser.profile.legacyId, role: 'ORG_ADMIN' }]
            });
            response.status.should.equal(200);

            const databaseOrganization: IOrganization = await OrganizationModel.findById(response.body.data.id);

            response.body.data.should.have.property('type').and.equal('organizations');
            response.body.data.should.have.property('id').and.equal(databaseOrganization._id.toString());
            response.body.data.should.have.property('attributes').and.be.an('object');
            response.body.data.attributes.should.have.property('name').and.equal(databaseOrganization.name);
            response.body.data.attributes.should.have.property('users').and.eql([{
                id: testUser.profile.legacyId,
                name: testUser.profile.displayName,
                role: 'ORG_ADMIN'
            }]);
            response.body.data.attributes.should.have.property('createdAt');
            new Date(response.body.data.attributes.createdAt).should.equalDate(databaseOrganization.createdAt);
            response.body.data.attributes.should.have.property('updatedAt');
            new Date(response.body.data.attributes.updatedAt).should.equalDate(databaseOrganization.updatedAt);

            await assertConnection({ userId: testUser.profile.legacyId, organization: databaseOrganization });
            await assertNoConnection({ userId: testUser.profile.legacyId, organization: previousOrganization });
        });

        it('Create an organization with associated user that has an associated application should be successful and not remove link user between application and user', async () => {
            const testApplication: IApplication = await createApplication();
            const testUser: OktaUser = getMockOktaUser({ role: 'ADMIN' });
            const token: string = mockValidJWT({
                id: testUser.profile.legacyId,
                email: testUser.profile.email,
                role: testUser.profile.role,
                extraUserData: { apps: testUser.profile.apps },
            });

            mockGetUserById(testUser);

            await new ApplicationUserModel({
                userId: testUser.profile.legacyId,
                application: testApplication
            }).save();

            const response: request.Response = await sendCreateOrganizationRequest(token, {
                name: "my organization",
                users: [{ id: testUser.profile.legacyId, role: 'ORG_ADMIN' }]
            });
            response.status.should.equal(200);

            const databaseOrganization: IOrganization = await OrganizationModel.findById(response.body.data.id);

            response.body.data.should.have.property('type').and.equal('organizations');
            response.body.data.should.have.property('id').and.equal(databaseOrganization._id.toString());
            response.body.data.should.have.property('attributes').and.be.an('object');
            response.body.data.attributes.should.have.property('name').and.equal(databaseOrganization.name);
            response.body.data.attributes.should.have.property('users').and.eql([{
                id: testUser.profile.legacyId,
                name: testUser.profile.displayName,
                role: 'ORG_ADMIN'
            }]);
            response.body.data.attributes.should.have.property('createdAt');
            new Date(response.body.data.attributes.createdAt).should.equalDate(databaseOrganization.createdAt);
            response.body.data.attributes.should.have.property('updatedAt');
            new Date(response.body.data.attributes.updatedAt).should.equalDate(databaseOrganization.updatedAt);

            await assertConnection({ userId: testUser.profile.legacyId, organization: databaseOrganization });
            await assertConnection({ application: testApplication, userId: testUser.profile.legacyId });
            await assertNoConnection({ application: testApplication, organization: databaseOrganization });
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
