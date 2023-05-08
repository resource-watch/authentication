import nock from 'nock';
import chai from 'chai';
import config from 'config';
import DeletionModel, { IDeletion } from 'models/deletion';
import { getTestAgent } from '../utils/test-server';
import { createDeletion } from '../utils/helpers';
import chaiDateTime from 'chai-datetime';
import request from 'superagent';
import { HydratedDocument } from 'mongoose';
import { mockValidJWT } from '../okta/okta.mocks';
import { describe } from 'mocha';

chai.should();
chai.use(chaiDateTime);

let requester: ChaiHttp.Agent;

nock.disableNetConnect();
nock.enableNetConnect(process.env.HOST_IP);

describe('Get deletions tests', () => {

    before(async () => {
        if (process.env.NODE_ENV !== 'test') {
            throw Error(`Running the test suite with NODE_ENV ${process.env.NODE_ENV} may result in permanent data loss. Please use NODE_ENV=test.`);
        }

        requester = await getTestAgent();
    });

    beforeEach(async () => {
        await DeletionModel.deleteMany({}).exec();
    });

    it('Get deletions while not being logged in should return a 401 error', async () => {
        const response: request.Response = await requester
            .get(`/api/v1/deletion`);

        response.status.should.equal(401);
        response.body.should.have.property('errors').and.be.an('array').and.length(1);
        response.body.errors[0].should.have.property('status').and.equal(401);
        response.body.errors[0].should.have.property('detail').and.equal('Not authenticated');
    });

    it('Get deletions while being logged in as USER should return a 403 error', async () => {
        const token: string = mockValidJWT({ role: 'USER' });

        const response: request.Response = await requester
            .get(`/api/v1/deletion`)
            .set('Authorization', `Bearer ${token}`);

        response.status.should.equal(403);
        response.body.should.have.property('errors').and.be.an('array').and.length(1);
        response.body.errors[0].should.have.property('status').and.equal(403);
        response.body.errors[0].should.have.property('detail').and.equal('Not authorized');
    });

    it('Get deletions while being logged in should return a 200 and the user data (happy case)', async () => {
        const deletion: HydratedDocument<IDeletion> = await new DeletionModel(createDeletion()).save() as HydratedDocument<IDeletion>;

        const token: string = mockValidJWT({ role: 'ADMIN' });

        const response: request.Response = await requester
            .get(`/api/v1/deletion`)
            .set('Authorization', `Bearer ${token}`);

        response.status.should.equal(200);
        response.body.should.have.property('data').and.be.an('array').and.length(1);
        response.body.data[0].should.have.property('type').and.equal('deletions');
        response.body.data[0].should.have.property('id').and.equal(deletion._id.toString());
        response.body.data[0].should.have.property('attributes').and.be.an('object');
        response.body.data[0].attributes.should.have.property('userId').and.equal(deletion.userId);
        response.body.data[0].attributes.should.have.property('requestorUserId').and.equal(deletion.requestorUserId);
        response.body.data[0].attributes.should.have.property('createdAt');
        new Date(response.body.data[0].attributes.createdAt).should.equalDate(deletion.createdAt);
        response.body.data[0].attributes.should.have.property('updatedAt');
        new Date(response.body.data[0].attributes.updatedAt).should.equalDate(deletion.updatedAt);
        response.body.data[0].attributes.should.have.property('status').and.equal(deletion.status);
        response.body.data[0].attributes.should.have.property('datasetsDeleted').and.equal(deletion.datasetsDeleted);
        response.body.data[0].attributes.should.have.property('layersDeleted').and.equal(deletion.layersDeleted);
        response.body.data[0].attributes.should.have.property('widgetsDeleted').and.equal(deletion.widgetsDeleted);
        response.body.data[0].attributes.should.have.property('userAccountDeleted').and.equal(deletion.userAccountDeleted);
        response.body.data[0].attributes.should.have.property('userDataDeleted').and.equal(deletion.userDataDeleted);
        response.body.data[0].attributes.should.have.property('collectionsDeleted').and.equal(deletion.collectionsDeleted);
        response.body.data[0].attributes.should.have.property('favouritesDeleted').and.equal(deletion.favouritesDeleted);
        response.body.data[0].attributes.should.have.property('areasDeleted').and.equal(deletion.areasDeleted);
        response.body.data[0].attributes.should.have.property('storiesDeleted').and.equal(deletion.storiesDeleted);
        response.body.data[0].attributes.should.have.property('subscriptionsDeleted').and.equal(deletion.subscriptionsDeleted);
        response.body.data[0].attributes.should.have.property('dashboardsDeleted').and.equal(deletion.dashboardsDeleted);
        response.body.data[0].attributes.should.have.property('profilesDeleted').and.equal(deletion.profilesDeleted);
        response.body.data[0].attributes.should.have.property('topicsDeleted').and.equal(deletion.topicsDeleted);
    });

    it('Get deletions filtered by status while being logged in should return a 200 and the user data (happy case)', async () => {
        const deletionPending: HydratedDocument<IDeletion> = await new DeletionModel(createDeletion()).save() as HydratedDocument<IDeletion>;
        const deletionDone: HydratedDocument<IDeletion> = await new DeletionModel(createDeletion({ status: 'done' })).save() as HydratedDocument<IDeletion>;

        const token: string = mockValidJWT({ role: 'ADMIN' });

        const pendingResponse: request.Response = await requester
            .get(`/api/v1/deletion`)
            .query({ status: 'pending' })
            .set('Authorization', `Bearer ${token}`);

        pendingResponse.status.should.equal(200);
        pendingResponse.body.should.have.property('data').and.be.an('array').and.length(1);
        pendingResponse.body.data[0].should.have.property('type').and.equal('deletions');
        pendingResponse.body.data[0].should.have.property('id').and.equal(deletionPending._id.toString());

        const doneResponse: request.Response = await requester
            .get(`/api/v1/deletion`)
            .query({ status: 'done' })
            .set('Authorization', `Bearer ${token}`);

        doneResponse.status.should.equal(200);
        doneResponse.body.should.have.property('data').and.be.an('array').and.length(1);
        doneResponse.body.data[0].should.have.property('type').and.equal('deletions');
        doneResponse.body.data[0].should.have.property('id').and.equal(deletionDone._id.toString());
    });

    describe('Pagination', () => {
        it('Get paginated deletions should return a 200 and the paginated deletion data - Different pages', async () => {
            const deletions: HydratedDocument<IDeletion>[] = [];
            for (let i: number = 0; i < 25; i++) {
                deletions.push(await new DeletionModel(createDeletion()).save() as HydratedDocument<IDeletion>);
            }

            const token: string = mockValidJWT({ role: 'ADMIN' });

            const responsePageOne: request.Response = await requester
                .get(`/api/v1/deletion`)
                .query({ 'page[size]': 10, 'page[number]': 1 })
                .set('Authorization', `Bearer ${token}`);

            responsePageOne.status.should.equal(200);
            responsePageOne.body.should.have.property('data').and.be.an('array').and.length(10);
            responsePageOne.body.should.have.property('links').and.be.an('object');
            responsePageOne.body.links.should.have.property('self').and.equal(`http://127.0.0.1:${config.get('server.port')}/v1/deletion?page[number]=1&page[size]=10`);
            responsePageOne.body.links.should.have.property('prev').and.equal(`http://127.0.0.1:${config.get('server.port')}/v1/deletion?page[number]=1&page[size]=10`);
            responsePageOne.body.links.should.have.property('next').and.equal(`http://127.0.0.1:${config.get('server.port')}/v1/deletion?page[number]=2&page[size]=10`);
            responsePageOne.body.links.should.have.property('first').and.equal(`http://127.0.0.1:${config.get('server.port')}/v1/deletion?page[number]=1&page[size]=10`);
            responsePageOne.body.links.should.have.property('last').and.equal(`http://127.0.0.1:${config.get('server.port')}/v1/deletion?page[number]=3&page[size]=10`);

            const responsePageTwo: request.Response = await requester
                .get(`/api/v1/deletion`)
                .query({ 'page[size]': 10, 'page[number]': 2 })
                .set('Authorization', `Bearer ${token}`);

            responsePageTwo.status.should.equal(200);
            responsePageTwo.body.should.have.property('data').and.be.an('array').and.length(10);
            responsePageTwo.body.should.have.property('links').and.be.an('object');
            responsePageTwo.body.links.should.have.property('self').and.equal(`http://127.0.0.1:${config.get('server.port')}/v1/deletion?page[number]=2&page[size]=10`);
            responsePageTwo.body.links.should.have.property('prev').and.equal(`http://127.0.0.1:${config.get('server.port')}/v1/deletion?page[number]=1&page[size]=10`);
            responsePageTwo.body.links.should.have.property('next').and.equal(`http://127.0.0.1:${config.get('server.port')}/v1/deletion?page[number]=3&page[size]=10`);
            responsePageTwo.body.links.should.have.property('first').and.equal(`http://127.0.0.1:${config.get('server.port')}/v1/deletion?page[number]=1&page[size]=10`);
            responsePageTwo.body.links.should.have.property('last').and.equal(`http://127.0.0.1:${config.get('server.port')}/v1/deletion?page[number]=3&page[size]=10`);

            const responsePageThree: request.Response = await requester
                .get(`/api/v1/deletion`)
                .query({ 'page[size]': 10, 'page[number]': 3 })
                .set('Authorization', `Bearer ${token}`);

            responsePageThree.status.should.equal(200);
            responsePageThree.body.should.have.property('data').and.be.an('array').and.length(5);
            responsePageThree.body.should.have.property('links').and.be.an('object');
            responsePageThree.body.links.should.have.property('self').and.equal(`http://127.0.0.1:${config.get('server.port')}/v1/deletion?page[number]=3&page[size]=10`);
            responsePageThree.body.links.should.have.property('prev').and.equal(`http://127.0.0.1:${config.get('server.port')}/v1/deletion?page[number]=2&page[size]=10`);
            responsePageThree.body.links.should.have.property('next').and.equal(`http://127.0.0.1:${config.get('server.port')}/v1/deletion?page[number]=3&page[size]=10`);
            responsePageThree.body.links.should.have.property('first').and.equal(`http://127.0.0.1:${config.get('server.port')}/v1/deletion?page[number]=1&page[size]=10`);
            responsePageThree.body.links.should.have.property('last').and.equal(`http://127.0.0.1:${config.get('server.port')}/v1/deletion?page[number]=3&page[size]=10`);
        });

        it('Get paginated deletions with over 100 results per page should return a 400', async () => {
            const token: string = mockValidJWT({ role: 'ADMIN' });

            const response: request.Response = await requester
                .get(`/api/v1/deletion`)
                .query({ 'page[size]': 101 })
                .set('Authorization', `Bearer ${token}`);

            response.status.should.equal(400);
            response.body.should.have.property('errors').and.be.an('array').and.length(1);
            response.body.errors[0].should.have.property('status').and.equal(400);
            response.body.errors[0].should.have.property('detail').and.equal('"page.size" must be less than or equal to 100');
        });
    });

    afterEach(async () => {
        await DeletionModel.deleteMany({}).exec();

        if (!nock.isDone()) {
            throw new Error(`Not all nock interceptors were used: ${nock.pendingMocks()}`);
        }
    });
});
