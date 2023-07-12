import nock from 'nock';
import chai from 'chai';
import config from 'config';
import ApplicationModel, { IApplication } from 'models/application';
import { getTestAgent } from '../utils/test-server';
import { createApplication, createOrganization } from '../utils/helpers';
import chaiDateTime from 'chai-datetime';
import request from 'superagent';
import { HydratedDocument } from 'mongoose';
import { getMockOktaUser, mockGetUserById, mockValidJWT } from '../okta/okta.mocks';
import { describe } from 'mocha';
import OrganizationModel, { IOrganization } from "models/organization";
import OrganizationApplicationModel from "models/organization-application";
import OrganizationUserModel from "models/organization-user";
import ApplicationUserModel from "models/application-user";
import { OktaUser } from "services/okta.interfaces";

chai.should();
chai.use(chaiDateTime);

let requester: ChaiHttp.Agent;

nock.disableNetConnect();
nock.enableNetConnect(process.env.HOST_IP);

describe('Get applications tests', () => {

    before(async () => {
        if (process.env.NODE_ENV !== 'test') {
            throw Error(`Running the test suite with NODE_ENV ${process.env.NODE_ENV} may result in permanent data loss. Please use NODE_ENV=test.`);
        }

        requester = await getTestAgent();
    });

    beforeEach(async () => {
        await ApplicationModel.deleteMany({}).exec();
    });

    it('Get applications while not being logged in should return a 401 error', async () => {
        const response: request.Response = await requester
            .get(`/api/v1/application`)
            .set('x-api-key', 'api-key-test');

        response.status.should.equal(401);
        response.body.should.have.property('errors').and.be.an('array').and.length(1);
        response.body.errors[0].should.have.property('status').and.equal(401);
        response.body.errors[0].should.have.property('detail').and.equal('Not authenticated');
    });

    it('Get applications while being logged in as USER should return a 200 and apps for the current user', async () => {
        const testUser: OktaUser = getMockOktaUser({ role: 'USER' });
        const token: string = mockValidJWT({
            id: testUser.profile.legacyId,
            email: testUser.profile.email,
            role: testUser.profile.role,
            extraUserData: { apps: testUser.profile.apps },
        });
        const otherUser: OktaUser = getMockOktaUser({ role: 'USER' });

        const otherApplication: HydratedDocument<IApplication> = await createApplication();
        const testUserApplication: HydratedDocument<IApplication> = await createApplication();

        await new ApplicationUserModel({
            userId: otherUser.profile.legacyId,
            application: otherApplication._id.toString()
        }).save();

        await new ApplicationUserModel({
            userId: testUser.profile.legacyId,
            application: testUserApplication._id.toString()
        }).save();

        mockGetUserById(testUser);

        const response: request.Response = await requester
            .get(`/api/v1/application`)
            .set('x-api-key', 'api-key-test')
            .set('Authorization', `Bearer ${token}`);

        response.status.should.equal(200);
        response.body.should.have.property('data').and.be.an('array').and.length(1);
        response.body.data[0].should.have.property('type').and.equal('applications');
        response.body.data[0].should.have.property('id').and.equal(testUserApplication._id.toString());
        response.body.data[0].should.have.property('attributes').and.be.an('object');
        response.body.data[0].attributes.should.have.property('name').and.equal(testUserApplication.name);
        response.body.data[0].attributes.should.have.property('apiKeyValue').and.equal(testUserApplication.apiKeyValue);
        response.body.data[0].attributes.should.have.property('createdAt');
        new Date(response.body.data[0].attributes.createdAt).should.equalDate(testUserApplication.createdAt);
        response.body.data[0].attributes.should.have.property('updatedAt');
        new Date(response.body.data[0].attributes.updatedAt).should.equalDate(testUserApplication.updatedAt);
    });

    it('Get applications while being logged in as MANAGER should return a 200 and apps for all users', async () => {
        const testUser: OktaUser = getMockOktaUser({ role: 'MANAGER' });
        const token: string = mockValidJWT({
            id: testUser.profile.legacyId,
            email: testUser.profile.email,
            role: testUser.profile.role,
            extraUserData: { apps: testUser.profile.apps },
        });
        const otherUser: OktaUser = getMockOktaUser({ role: 'MANAGER' });

        const otherApplication: HydratedDocument<IApplication> = await createApplication();
        const testUserApplication: HydratedDocument<IApplication> = await createApplication();

        await new ApplicationUserModel({
            userId: otherUser.profile.legacyId,
            application: otherApplication._id.toString()
        }).save();

        await new ApplicationUserModel({
            userId: testUser.profile.legacyId,
            application: testUserApplication._id.toString()
        }).save();

        mockGetUserById(testUser);
        mockGetUserById(otherUser);

        const response: request.Response = await requester
            .get(`/api/v1/application`)
            .set('x-api-key', 'api-key-test')
            .set('Authorization', `Bearer ${token}`);

        response.status.should.equal(200);
        response.body.should.have.property('data').and.be.an('array').and.length(2);

        response.body.data[0].should.have.property('type').and.equal('applications');
        response.body.data[0].should.have.property('id').and.be.oneOf([testUserApplication._id.toString(), otherApplication._id.toString()]);
        response.body.data[0].should.have.property('attributes').and.be.an('object');
        response.body.data[0].attributes.should.have.property('name').and.be.oneOf([testUserApplication.name, otherApplication.name]);
        response.body.data[0].attributes.should.have.property('apiKeyValue').and.be.oneOf([testUserApplication.apiKeyValue, otherApplication.apiKeyValue]);
        response.body.data[0].attributes.should.have.property('createdAt');
        response.body.data[0].attributes.should.have.property('updatedAt');

        response.body.data[1].should.have.property('type').and.equal('applications');
        response.body.data[1].should.have.property('id').and.be.oneOf([testUserApplication._id.toString(), otherApplication._id.toString()]);
        response.body.data[1].should.have.property('attributes').and.be.an('object');
        response.body.data[1].attributes.should.have.property('name').and.be.oneOf([testUserApplication.name, otherApplication.name]);
        response.body.data[1].attributes.should.have.property('apiKeyValue').and.be.oneOf([testUserApplication.apiKeyValue, otherApplication.apiKeyValue]);
        response.body.data[1].attributes.should.have.property('createdAt');
        response.body.data[1].attributes.should.have.property('updatedAt');
    });

    it('Get applications while being logged in as ADMIN should return a 200 and apps for all users', async () => {
        const testUser: OktaUser = getMockOktaUser({ role: 'ADMIN' });
        const token: string = mockValidJWT({
            id: testUser.profile.legacyId,
            email: testUser.profile.email,
            role: testUser.profile.role,
            extraUserData: { apps: testUser.profile.apps },
        });
        const otherUser: OktaUser = getMockOktaUser({ role: 'USER' });

        const otherApplication: HydratedDocument<IApplication> = await createApplication();
        const testUserApplication: HydratedDocument<IApplication> = await createApplication();

        await new ApplicationUserModel({
            userId: otherUser.profile.legacyId,
            application: otherApplication._id.toString()
        }).save();

        await new ApplicationUserModel({
            userId: testUser.profile.legacyId,
            application: testUserApplication._id.toString()
        }).save();

        mockGetUserById(testUser);
        mockGetUserById(otherUser);

        const response: request.Response = await requester
            .get(`/api/v1/application`)
            .set('x-api-key', 'api-key-test')
            .set('Authorization', `Bearer ${token}`);

        response.status.should.equal(200);
        response.body.should.have.property('data').and.be.an('array').and.length(2);

        response.body.data[0].should.have.property('type').and.equal('applications');
        response.body.data[0].should.have.property('id').and.be.oneOf([testUserApplication._id.toString(), otherApplication._id.toString()]);
        response.body.data[0].should.have.property('attributes').and.be.an('object');
        response.body.data[0].attributes.should.have.property('name').and.be.oneOf([testUserApplication.name, otherApplication.name]);
        response.body.data[0].attributes.should.have.property('apiKeyValue').and.be.oneOf([testUserApplication.apiKeyValue, otherApplication.apiKeyValue]);
        response.body.data[0].attributes.should.have.property('createdAt');
        response.body.data[0].attributes.should.have.property('updatedAt');

        response.body.data[1].should.have.property('type').and.equal('applications');
        response.body.data[1].should.have.property('id').and.be.oneOf([testUserApplication._id.toString(), otherApplication._id.toString()]);
        response.body.data[1].should.have.property('attributes').and.be.an('object');
        response.body.data[1].attributes.should.have.property('name').and.be.oneOf([testUserApplication.name, otherApplication.name]);
        response.body.data[1].attributes.should.have.property('apiKeyValue').and.be.oneOf([testUserApplication.apiKeyValue, otherApplication.apiKeyValue]);
        response.body.data[1].attributes.should.have.property('createdAt');
        response.body.data[1].attributes.should.have.property('updatedAt');
    });

    describe('Pagination', () => {
        it('Get paginated applications should return a 200 and the paginated application data - Different pages, USER role', async () => {
            const testUser: OktaUser = getMockOktaUser({ role: 'USER' });
            const token: string = mockValidJWT({
                id: testUser.profile.legacyId,
                email: testUser.profile.email,
                role: testUser.profile.role,
                extraUserData: { apps: testUser.profile.apps },
            });
            const otherUser: OktaUser = getMockOktaUser({ role: 'USER' });

            for (let i: number = 0; i < 25; i++) {
                const application: IApplication = await createApplication();

                await new ApplicationUserModel({
                    userId: (i % 2 == 0 ? testUser.profile.legacyId : otherUser.profile.legacyId),
                    application: application._id.toString()
                }).save();
            }

            mockGetUserById(testUser, 13);

            const responsePageOne: request.Response = await requester
                .get(`/api/v1/application`)
                .query({ 'page[size]': 10, 'page[number]': 1 })
                .set('x-api-key', 'api-key-test')
                .set('Authorization', `Bearer ${token}`);

            responsePageOne.status.should.equal(200);
            responsePageOne.body.should.have.property('data').and.be.an('array').and.length(10);
            responsePageOne.body.should.have.property('links').and.be.an('object');
            responsePageOne.body.links.should.have.property('self').and.equal(`http://127.0.0.1:${config.get('server.port')}/v1/application?page[number]=1&page[size]=10`);
            responsePageOne.body.links.should.have.property('prev').and.equal(`http://127.0.0.1:${config.get('server.port')}/v1/application?page[number]=1&page[size]=10`);
            responsePageOne.body.links.should.have.property('next').and.equal(`http://127.0.0.1:${config.get('server.port')}/v1/application?page[number]=2&page[size]=10`);
            responsePageOne.body.links.should.have.property('first').and.equal(`http://127.0.0.1:${config.get('server.port')}/v1/application?page[number]=1&page[size]=10`);
            responsePageOne.body.links.should.have.property('last').and.equal(`http://127.0.0.1:${config.get('server.port')}/v1/application?page[number]=2&page[size]=10`);

            const responsePageTwo: request.Response = await requester
                .get(`/api/v1/application`)
                .query({ 'page[size]': 10, 'page[number]': 2 })
                .set('x-api-key', 'api-key-test')
                .set('Authorization', `Bearer ${token}`);

            responsePageTwo.status.should.equal(200);
            responsePageTwo.body.should.have.property('data').and.be.an('array').and.length(3);
            responsePageTwo.body.should.have.property('links').and.be.an('object');
            responsePageTwo.body.links.should.have.property('self').and.equal(`http://127.0.0.1:${config.get('server.port')}/v1/application?page[number]=2&page[size]=10`);
            responsePageTwo.body.links.should.have.property('prev').and.equal(`http://127.0.0.1:${config.get('server.port')}/v1/application?page[number]=1&page[size]=10`);
            responsePageTwo.body.links.should.have.property('next').and.equal(`http://127.0.0.1:${config.get('server.port')}/v1/application?page[number]=2&page[size]=10`);
            responsePageTwo.body.links.should.have.property('first').and.equal(`http://127.0.0.1:${config.get('server.port')}/v1/application?page[number]=1&page[size]=10`);
            responsePageTwo.body.links.should.have.property('last').and.equal(`http://127.0.0.1:${config.get('server.port')}/v1/application?page[number]=2&page[size]=10`);
        });

        it('Get paginated applications should return a 200 and the paginated application data - Different pages, ADMIN role', async () => {
            for (let i: number = 0; i < 25; i++) {
                await createApplication();
            }

            const token: string = mockValidJWT({ role: 'ADMIN' });

            const responsePageOne: request.Response = await requester
                .get(`/api/v1/application`)
                .query({ 'page[size]': 10, 'page[number]': 1 })
                .set('x-api-key', 'api-key-test')
                .set('Authorization', `Bearer ${token}`);

            responsePageOne.status.should.equal(200);
            responsePageOne.body.should.have.property('data').and.be.an('array').and.length(10);
            responsePageOne.body.should.have.property('links').and.be.an('object');
            responsePageOne.body.links.should.have.property('self').and.equal(`http://127.0.0.1:${config.get('server.port')}/v1/application?page[number]=1&page[size]=10`);
            responsePageOne.body.links.should.have.property('prev').and.equal(`http://127.0.0.1:${config.get('server.port')}/v1/application?page[number]=1&page[size]=10`);
            responsePageOne.body.links.should.have.property('next').and.equal(`http://127.0.0.1:${config.get('server.port')}/v1/application?page[number]=2&page[size]=10`);
            responsePageOne.body.links.should.have.property('first').and.equal(`http://127.0.0.1:${config.get('server.port')}/v1/application?page[number]=1&page[size]=10`);
            responsePageOne.body.links.should.have.property('last').and.equal(`http://127.0.0.1:${config.get('server.port')}/v1/application?page[number]=3&page[size]=10`);

            const responsePageTwo: request.Response = await requester
                .get(`/api/v1/application`)
                .query({ 'page[size]': 10, 'page[number]': 2 })
                .set('x-api-key', 'api-key-test')
                .set('Authorization', `Bearer ${token}`);

            responsePageTwo.status.should.equal(200);
            responsePageTwo.body.should.have.property('data').and.be.an('array').and.length(10);
            responsePageTwo.body.should.have.property('links').and.be.an('object');
            responsePageTwo.body.links.should.have.property('self').and.equal(`http://127.0.0.1:${config.get('server.port')}/v1/application?page[number]=2&page[size]=10`);
            responsePageTwo.body.links.should.have.property('prev').and.equal(`http://127.0.0.1:${config.get('server.port')}/v1/application?page[number]=1&page[size]=10`);
            responsePageTwo.body.links.should.have.property('next').and.equal(`http://127.0.0.1:${config.get('server.port')}/v1/application?page[number]=3&page[size]=10`);
            responsePageTwo.body.links.should.have.property('first').and.equal(`http://127.0.0.1:${config.get('server.port')}/v1/application?page[number]=1&page[size]=10`);
            responsePageTwo.body.links.should.have.property('last').and.equal(`http://127.0.0.1:${config.get('server.port')}/v1/application?page[number]=3&page[size]=10`);

            const responsePageThree: request.Response = await requester
                .get(`/api/v1/application`)
                .query({ 'page[size]': 10, 'page[number]': 3 })
                .set('x-api-key', 'api-key-test')
                .set('Authorization', `Bearer ${token}`);

            responsePageThree.status.should.equal(200);
            responsePageThree.body.should.have.property('data').and.be.an('array').and.length(5);
            responsePageThree.body.should.have.property('links').and.be.an('object');
            responsePageThree.body.links.should.have.property('self').and.equal(`http://127.0.0.1:${config.get('server.port')}/v1/application?page[number]=3&page[size]=10`);
            responsePageThree.body.links.should.have.property('prev').and.equal(`http://127.0.0.1:${config.get('server.port')}/v1/application?page[number]=2&page[size]=10`);
            responsePageThree.body.links.should.have.property('next').and.equal(`http://127.0.0.1:${config.get('server.port')}/v1/application?page[number]=3&page[size]=10`);
            responsePageThree.body.links.should.have.property('first').and.equal(`http://127.0.0.1:${config.get('server.port')}/v1/application?page[number]=1&page[size]=10`);
            responsePageThree.body.links.should.have.property('last').and.equal(`http://127.0.0.1:${config.get('server.port')}/v1/application?page[number]=3&page[size]=10`);
        });

        it('Get paginated applications with over 100 results per page should return a 400', async () => {
            const token: string = mockValidJWT({ role: 'ADMIN' });


            const response: request.Response = await requester
                .get(`/api/v1/application`)
                .query({ 'page[size]': 101 })
                .set('x-api-key', 'api-key-test')
                .set('Authorization', `Bearer ${token}`);

            response.status.should.equal(400);
            response.body.should.have.property('errors').and.be.an('array').and.length(1);
            response.body.errors[0].should.have.property('status').and.equal(400);
            response.body.errors[0].should.have.property('detail').and.equal('"page.size" must be less than or equal to 100');
        });

        describe('with associated organizations', () => {
            it('Get applications with associated organizations should be successful', async () => {
                const token: string = mockValidJWT({ role: 'ADMIN' });
                const testOrganization: IOrganization = await createOrganization();
                const testApplication: IApplication = await createApplication();

                await new OrganizationApplicationModel({
                    organization: testOrganization._id.toString(),
                    application: testApplication._id.toString()
                }).save();

                const response: request.Response = await requester
                    .get(`/api/v1/application`)
                    .set('x-api-key', 'api-key-test')
                    .set('Authorization', `Bearer ${token}`);

                response.status.should.equal(200);
                response.body.should.have.property('data').and.be.an('array').and.length(1);
                response.body.data[0].should.have.property('type').and.equal('applications');
                response.body.data[0].should.have.property('id').and.equal(testApplication._id.toString());
                response.body.data[0].should.have.property('attributes').and.be.an('object');
                response.body.data[0].attributes.should.have.property('name').and.equal(testApplication.name);
                response.body.data[0].attributes.should.have.property('organization').and.eql({
                    id: testOrganization.id,
                    name: testOrganization.name,
                });
                response.body.data[0].attributes.should.have.property('createdAt');
                new Date(response.body.data[0].attributes.createdAt).should.equalDate(testApplication.createdAt);
                response.body.data[0].attributes.should.have.property('updatedAt');
                new Date(response.body.data[0].attributes.updatedAt).should.equalDate(testApplication.updatedAt);
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

                const response: request.Response = await requester
                    .get(`/api/v1/application`)
                    .set('x-api-key', 'api-key-test')
                    .set('Authorization', `Bearer ${token}`);

                response.status.should.equal(200);
                response.body.should.have.property('data').and.be.an('array').and.length(1);
                response.body.data[0].should.have.property('type').and.equal('applications');
                response.body.data[0].should.have.property('id').and.equal(testApplication._id.toString());
                response.body.data[0].should.have.property('attributes').and.be.an('object');
                response.body.data[0].attributes.should.have.property('name').and.equal(testApplication.name);
                response.body.data[0].attributes.should.have.property('user').and.eql({
                    id: user.profile.legacyId,
                    name: user.profile.displayName,
                });
                response.body.data[0].attributes.should.have.property('createdAt');
                new Date(response.body.data[0].attributes.createdAt).should.equalDate(testApplication.createdAt);
                response.body.data[0].attributes.should.have.property('updatedAt');
                new Date(response.body.data[0].attributes.updatedAt).should.equalDate(testApplication.updatedAt);
            });
        })
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
