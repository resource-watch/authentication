import nock from 'nock';
import chai from 'chai';
import DeletionModel, { IDeletion } from 'models/deletion';
import chaiDateTime from 'chai-datetime';
import { getTestAgent } from '../utils/test-server';
import request from 'superagent';
import { mockValidJWT } from '../okta/okta.mocks';
import mongoose, { HydratedDocument } from 'mongoose';
import { createDeletion } from '../utils/helpers';

chai.should();
chai.use(chaiDateTime);

let requester: ChaiHttp.Agent;

nock.disableNetConnect();
nock.enableNetConnect(process.env.HOST_IP);

const sendCreateDeletionRequest: (token: string, deletion?: Partial<IDeletion>) => Promise<request.Response> = async (token: string, deletion: Partial<IDeletion> = {}) => requester
    .post(`/api/v1/deletion`)
    .set('Authorization', `Bearer ${token}`)
    .send({ ...deletion });

describe('Create deletion tests', () => {

    before(async () => {
        if (process.env.NODE_ENV !== 'test') {
            throw Error(`Running the test suite with NODE_ENV ${process.env.NODE_ENV} may result in permanent data loss. Please use NODE_ENV=test.`);
        }

        requester = await getTestAgent();
    });

    beforeEach(async () => {
        await DeletionModel.deleteMany({}).exec();
    });

    it('Create a deletion while not being logged in should return a 401 \'Unauthorized\' error', async () => {
        const response: request.Response = await requester
            .post(`/api/v1/deletion`)
            .send({});

        response.status.should.equal(401);
        response.body.should.have.property('errors').and.be.an('array').and.length(1);
        response.body.errors[0].should.have.property('status', 401);
        response.body.errors[0].should.have.property('detail', 'Not authenticated');
    });

    it('Create a deletion while being logged in as USER should return a 403', async () => {
        const token: string = mockValidJWT({ role: 'USER' });

        const response: request.Response = await sendCreateDeletionRequest(token);

        response.status.should.equal(403);
        response.body.should.have.property('errors').and.be.an('array').and.length(1);
        response.body.errors[0].should.have.property('status').and.equal(403);
        response.body.errors[0].should.have.property('detail').and.equal('Not authorized');
    });

    it('Create a deletion for a userId that already exists should return an error', async () => {
        const deletion: HydratedDocument<IDeletion> = await new DeletionModel(createDeletion()).save() as HydratedDocument<IDeletion>;

        const token: string = mockValidJWT({ id: deletion.userId, role: 'ADMIN' });
        const response: request.Response = await sendCreateDeletionRequest(token);

        response.status.should.equal(400);
        response.body.should.have.property('errors').and.be.an('array').and.length(1);
        response.body.errors[0].should.have.property('status').and.equal(400);
        response.body.errors[0].should.have.property('detail').and.equal('Deletion already exists for this user');
    });

    it('Create a deletion while being logged in as ADMIN should return a 200 (happy case - no deletion data)', async () => {
        const token: string = mockValidJWT({ role: 'ADMIN' });

        const response: request.Response = await sendCreateDeletionRequest(token);
        response.status.should.equal(200);

        const databaseDeletion: IDeletion = await DeletionModel.findById(response.body.data.id);

        response.body.data.should.have.property('type').and.equal('deletions');
        response.body.data.should.have.property('id').and.equal(databaseDeletion._id.toString());
        response.body.data.should.have.property('attributes').and.be.an('object');
        response.body.data.attributes.should.have.property('userId').and.equal(databaseDeletion.userId);
        response.body.data.attributes.should.have.property('requestorUserId').and.equal(databaseDeletion.requestorUserId);
        response.body.data.attributes.should.have.property('createdAt');
        new Date(response.body.data.attributes.createdAt).should.equalDate(databaseDeletion.createdAt);
        response.body.data.attributes.should.have.property('updatedAt');
        new Date(response.body.data.attributes.updatedAt).should.equalDate(databaseDeletion.updatedAt);
        response.body.data.attributes.should.have.property('status').and.equal(databaseDeletion.status);
        response.body.data.attributes.should.have.property('datasetsDeleted').and.equal(databaseDeletion.datasetsDeleted).and.equal(false);
        response.body.data.attributes.should.have.property('layersDeleted').and.equal(databaseDeletion.layersDeleted).and.equal(false);
        response.body.data.attributes.should.have.property('widgetsDeleted').and.equal(databaseDeletion.widgetsDeleted).and.equal(false);
        response.body.data.attributes.should.have.property('userAccountDeleted').and.equal(databaseDeletion.userAccountDeleted).and.equal(false);
        response.body.data.attributes.should.have.property('userDataDeleted').and.equal(databaseDeletion.userDataDeleted).and.equal(false);
        response.body.data.attributes.should.have.property('graphDataDeleted').and.equal(databaseDeletion.graphDataDeleted).and.equal(false);
        response.body.data.attributes.should.have.property('collectionsDeleted').and.equal(databaseDeletion.collectionsDeleted).and.equal(false);
        response.body.data.attributes.should.have.property('favouritesDeleted').and.equal(databaseDeletion.favouritesDeleted).and.equal(false);
        response.body.data.attributes.should.have.property('vocabulariesDeleted').and.equal(databaseDeletion.vocabulariesDeleted).and.equal(false);
        response.body.data.attributes.should.have.property('areasDeleted').and.equal(databaseDeletion.areasDeleted).and.equal(false);
        response.body.data.attributes.should.have.property('storiesDeleted').and.equal(databaseDeletion.storiesDeleted).and.equal(false);
        response.body.data.attributes.should.have.property('subscriptionsDeleted').and.equal(databaseDeletion.subscriptionsDeleted).and.equal(false);
        response.body.data.attributes.should.have.property('dashboardsDeleted').and.equal(databaseDeletion.dashboardsDeleted).and.equal(false);
        response.body.data.attributes.should.have.property('profilesDeleted').and.equal(databaseDeletion.profilesDeleted).and.equal(false);
        response.body.data.attributes.should.have.property('topicsDeleted').and.equal(databaseDeletion.topicsDeleted).and.equal(false);
    });

    it('Create a deletion while being logged as ADMIN in should return a 200 (happy case - complete deletion data)', async () => {
        const token: string = mockValidJWT({ role: 'ADMIN' });

        const response: request.Response = await sendCreateDeletionRequest(token, {
            userId: new mongoose.Types.ObjectId().toString(),
            datasetsDeleted: true,
            layersDeleted: true,
            widgetsDeleted: true,
            userAccountDeleted: true,
            userDataDeleted: true,
            graphDataDeleted: true,
            collectionsDeleted: true,
            favouritesDeleted: true,
            vocabulariesDeleted: true,
            areasDeleted: true,
            storiesDeleted: true,
            subscriptionsDeleted: true,
            dashboardsDeleted: true,
            profilesDeleted: true,
            topicsDeleted: true
        });

        const databaseDeletion: IDeletion = await DeletionModel.findById(response.body.data.id);

        response.status.should.equal(200);
        response.body.data.should.have.property('type').and.equal('deletions');
        response.body.data.should.have.property('id').and.equal(databaseDeletion._id.toString());
        response.body.data.should.have.property('attributes').and.be.an('object');
        response.body.data.attributes.should.have.property('userId').and.equal(databaseDeletion.userId);
        response.body.data.attributes.should.have.property('requestorUserId').and.equal(databaseDeletion.requestorUserId);
        response.body.data.attributes.should.have.property('createdAt');
        new Date(response.body.data.attributes.createdAt).should.equalDate(databaseDeletion.createdAt);
        response.body.data.attributes.should.have.property('updatedAt');
        new Date(response.body.data.attributes.updatedAt).should.equalDate(databaseDeletion.updatedAt);
        response.body.data.attributes.should.have.property('status').and.equal(databaseDeletion.status);
        response.body.data.attributes.should.have.property('datasetsDeleted').and.equal(databaseDeletion.datasetsDeleted).and.equal(true);
        response.body.data.attributes.should.have.property('layersDeleted').and.equal(databaseDeletion.layersDeleted).and.equal(true);
        response.body.data.attributes.should.have.property('widgetsDeleted').and.equal(databaseDeletion.widgetsDeleted).and.equal(true);
        response.body.data.attributes.should.have.property('userAccountDeleted').and.equal(databaseDeletion.userAccountDeleted).and.equal(true);
        response.body.data.attributes.should.have.property('userDataDeleted').and.equal(databaseDeletion.userDataDeleted).and.equal(true);
        response.body.data.attributes.should.have.property('graphDataDeleted').and.equal(databaseDeletion.graphDataDeleted).and.equal(true);
        response.body.data.attributes.should.have.property('collectionsDeleted').and.equal(databaseDeletion.collectionsDeleted).and.equal(true);
        response.body.data.attributes.should.have.property('favouritesDeleted').and.equal(databaseDeletion.favouritesDeleted).and.equal(true);
        response.body.data.attributes.should.have.property('vocabulariesDeleted').and.equal(databaseDeletion.vocabulariesDeleted).and.equal(true);
        response.body.data.attributes.should.have.property('areasDeleted').and.equal(databaseDeletion.areasDeleted).and.equal(true);
        response.body.data.attributes.should.have.property('storiesDeleted').and.equal(databaseDeletion.storiesDeleted).and.equal(true);
        response.body.data.attributes.should.have.property('subscriptionsDeleted').and.equal(databaseDeletion.subscriptionsDeleted).and.equal(true);
        response.body.data.attributes.should.have.property('dashboardsDeleted').and.equal(databaseDeletion.dashboardsDeleted).and.equal(true);
        response.body.data.attributes.should.have.property('profilesDeleted').and.equal(databaseDeletion.profilesDeleted).and.equal(true);
        response.body.data.attributes.should.have.property('topicsDeleted').and.equal(databaseDeletion.topicsDeleted).and.equal(true);
    });

    it('Create a deletion that already exists should return a 400 \'Deletion already exists for this user\' error', async () => {
        const deletion: HydratedDocument<IDeletion> = await new DeletionModel(createDeletion()).save() as HydratedDocument<IDeletion>;

        const token: string = mockValidJWT({ role: 'ADMIN' });

        const response: request.Response = await sendCreateDeletionRequest(token, { userId: deletion.userId });
        response.status.should.equal(400);
        response.body.should.have.property('errors').and.be.an('array').and.length(1);
        response.body.errors[0].should.have.property('status', 400);
        response.body.errors[0].should.have.property('detail', 'Deletion already exists for this user');
    });

    afterEach(async () => {
        await DeletionModel.deleteMany({}).exec();

        if (!nock.isDone()) {
            throw new Error(`Not all nock interceptors were used: ${nock.pendingMocks()}`);
        }
    });
});
