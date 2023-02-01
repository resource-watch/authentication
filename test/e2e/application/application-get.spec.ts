import nock from 'nock';
import chai from 'chai';
import config from 'config';
import ApplicationModel, { IApplication } from 'models/application';
import { getTestAgent } from '../utils/test-server';
import { createApplication, createOrganization } from '../utils/helpers';
import chaiDateTime from 'chai-datetime';
import request from 'superagent';
import { HydratedDocument } from 'mongoose';
import { mockValidJWT } from '../okta/okta.mocks';
import { describe } from 'mocha';
import OrganizationModel, { IOrganization } from "../../../src/models/organization";

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
            .get(`/api/v1/application`);

        response.status.should.equal(401);
        response.body.should.have.property('errors').and.be.an('array').and.length(1);
        response.body.errors[0].should.have.property('status').and.equal(401);
        response.body.errors[0].should.have.property('detail').and.equal('Not authenticated');
    });

    it('Get applications while being logged in as USER should return a 403 error', async () => {
        const token: string = mockValidJWT({ role: 'USER' });

        const response: request.Response = await requester
            .get(`/api/v1/application`)
            .set('Authorization', `Bearer ${token}`);

        response.status.should.equal(403);
        response.body.should.have.property('errors').and.be.an('array').and.length(1);
        response.body.errors[0].should.have.property('status').and.equal(403);
        response.body.errors[0].should.have.property('detail').and.equal('Not authorized');
    });

    it('Get applications while being logged in should return a 200 and the user data (happy case)', async () => {
        const application: HydratedDocument<IApplication> = await createApplication();

        const token: string = mockValidJWT({ role: 'ADMIN' });

        const response: request.Response = await requester
            .get(`/api/v1/application`)
            .set('Authorization', `Bearer ${token}`);

        response.status.should.equal(200);
        response.body.should.have.property('data').and.be.an('array').and.length(1);
        response.body.data[0].should.have.property('type').and.equal('applications');
        response.body.data[0].should.have.property('id').and.equal(application._id.toString());
        response.body.data[0].should.have.property('attributes').and.be.an('object');
        response.body.data[0].attributes.should.have.property('name').and.equal(application.name);
        response.body.data[0].attributes.should.have.property('apiKeyValue').and.equal(application.apiKeyValue);
        response.body.data[0].attributes.should.have.property('createdAt');
        new Date(response.body.data[0].attributes.createdAt).should.equalDate(application.createdAt);
        response.body.data[0].attributes.should.have.property('updatedAt');
        new Date(response.body.data[0].attributes.updatedAt).should.equalDate(application.updatedAt);
    });

    describe('Pagination', () => {
        it('Get paginated applications should return a 200 and the paginated application data - Different pages', async () => {
            const applications: HydratedDocument<IApplication>[] = [];
            for (let i: number = 0; i < 25; i++) {
                applications.push(await createApplication());
            }

            const token: string = mockValidJWT({ role: 'ADMIN' });

            const responsePageOne: request.Response = await requester
                .get(`/api/v1/application`)
                .query({ 'page[size]': 10, 'page[number]': 1 })
                .set('Authorization', `Bearer ${token}`);

            responsePageOne.status.should.equal(200);
            responsePageOne.body.should.have.property('data').and.be.an('array').and.length(10);
            responsePageOne.body.should.have.property('links').and.be.an('object');
            responsePageOne.body.links.should.have.property('self').and.equal(`http://127.0.0.1:${config.get('server.port')}/api/v1/application?page[number]=1&page[size]=10`);
            responsePageOne.body.links.should.have.property('prev').and.equal(`http://127.0.0.1:${config.get('server.port')}/api/v1/application?page[number]=1&page[size]=10`);
            responsePageOne.body.links.should.have.property('next').and.equal(`http://127.0.0.1:${config.get('server.port')}/api/v1/application?page[number]=2&page[size]=10`);
            responsePageOne.body.links.should.have.property('first').and.equal(`http://127.0.0.1:${config.get('server.port')}/api/v1/application?page[number]=1&page[size]=10`);
            responsePageOne.body.links.should.have.property('last').and.equal(`http://127.0.0.1:${config.get('server.port')}/api/v1/application?page[number]=3&page[size]=10`);

            const responsePageTwo: request.Response = await requester
                .get(`/api/v1/application`)
                .query({ 'page[size]': 10, 'page[number]': 2 })
                .set('Authorization', `Bearer ${token}`);

            responsePageTwo.status.should.equal(200);
            responsePageTwo.body.should.have.property('data').and.be.an('array').and.length(10);
            responsePageTwo.body.should.have.property('links').and.be.an('object');
            responsePageTwo.body.links.should.have.property('self').and.equal(`http://127.0.0.1:${config.get('server.port')}/api/v1/application?page[number]=2&page[size]=10`);
            responsePageTwo.body.links.should.have.property('prev').and.equal(`http://127.0.0.1:${config.get('server.port')}/api/v1/application?page[number]=1&page[size]=10`);
            responsePageTwo.body.links.should.have.property('next').and.equal(`http://127.0.0.1:${config.get('server.port')}/api/v1/application?page[number]=3&page[size]=10`);
            responsePageTwo.body.links.should.have.property('first').and.equal(`http://127.0.0.1:${config.get('server.port')}/api/v1/application?page[number]=1&page[size]=10`);
            responsePageTwo.body.links.should.have.property('last').and.equal(`http://127.0.0.1:${config.get('server.port')}/api/v1/application?page[number]=3&page[size]=10`);

            const responsePageThree: request.Response = await requester
                .get(`/api/v1/application`)
                .query({ 'page[size]': 10, 'page[number]': 3 })
                .set('Authorization', `Bearer ${token}`);

            responsePageThree.status.should.equal(200);
            responsePageThree.body.should.have.property('data').and.be.an('array').and.length(5);
            responsePageThree.body.should.have.property('links').and.be.an('object');
            responsePageThree.body.links.should.have.property('self').and.equal(`http://127.0.0.1:${config.get('server.port')}/api/v1/application?page[number]=3&page[size]=10`);
            responsePageThree.body.links.should.have.property('prev').and.equal(`http://127.0.0.1:${config.get('server.port')}/api/v1/application?page[number]=2&page[size]=10`);
            responsePageThree.body.links.should.have.property('next').and.equal(`http://127.0.0.1:${config.get('server.port')}/api/v1/application?page[number]=3&page[size]=10`);
            responsePageThree.body.links.should.have.property('first').and.equal(`http://127.0.0.1:${config.get('server.port')}/api/v1/application?page[number]=1&page[size]=10`);
            responsePageThree.body.links.should.have.property('last').and.equal(`http://127.0.0.1:${config.get('server.port')}/api/v1/application?page[number]=3&page[size]=10`);
        });

        it('Get paginated applications with over 100 results per page should return a 400', async () => {
            const token: string = mockValidJWT({ role: 'ADMIN' });

            const response: request.Response = await requester
                .get(`/api/v1/application`)
                .query({ 'page[size]': 101 })
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

                const application: HydratedDocument<IApplication> = await createApplication({
                    organization: testOrganization.id
                });

                const response: request.Response = await requester
                    .get(`/api/v1/application`)
                    .set('Authorization', `Bearer ${token}`);

                response.status.should.equal(200);
                response.body.should.have.property('data').and.be.an('array').and.length(1);
                response.body.data[0].should.have.property('type').and.equal('applications');
                response.body.data[0].should.have.property('id').and.equal(application._id.toString());
                response.body.data[0].should.have.property('attributes').and.be.an('object');
                response.body.data[0].attributes.should.have.property('name').and.equal(application.name);
                response.body.data[0].attributes.should.have.property('organization').and.eql({
                    id: testOrganization.id,
                    name: testOrganization.name,
                });
                response.body.data[0].attributes.should.have.property('createdAt');
                new Date(response.body.data[0].attributes.createdAt).should.equalDate(application.createdAt);
                response.body.data[0].attributes.should.have.property('updatedAt');
                new Date(response.body.data[0].attributes.updatedAt).should.equalDate(application.updatedAt);
            });
        })
    });

    afterEach(async () => {
        await ApplicationModel.deleteMany({}).exec();
        await OrganizationModel.deleteMany({}).exec();

        if (!nock.isDone()) {
            throw new Error(`Not all nock interceptors were used: ${nock.pendingMocks()}`);
        }
    });
});
