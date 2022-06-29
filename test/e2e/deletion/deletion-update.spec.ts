import nock from 'nock';
import chai from 'chai';
import DeletionModel, { IDeletion } from 'models/deletion';
import chaiDateTime from 'chai-datetime';
import { getTestAgent } from '../utils/test-server';
import { createDeletion } from '../utils/helpers';
import request from 'superagent';
import { mockValidJWT } from '../okta/okta.mocks';
import mongoose, { HydratedDocument } from 'mongoose';

chai.should();
chai.use(chaiDateTime);

let requester: ChaiHttp.Agent;

nock.disableNetConnect();
nock.enableNetConnect(process.env.HOST_IP);

describe('Update deletion tests', () => {

    before(async () => {
        if (process.env.NODE_ENV !== 'test') {
            throw Error(`Running the test suite with NODE_ENV ${process.env.NODE_ENV} may result in permanent data loss. Please use NODE_ENV=test.`);
        }

        requester = await getTestAgent();
    });

    beforeEach(async () => {
        await DeletionModel.deleteMany({}).exec();
    });

    it('Update a deletion while not being logged in should return a 401 \'Unauthorized\' error', async () => {
        const deletion: HydratedDocument<IDeletion> = await new DeletionModel(createDeletion()).save() as HydratedDocument<IDeletion>;

        const response: request.Response = await requester
            .patch(`/api/v1/deletion/${deletion._id.toString()}`)
            .send({});

        response.status.should.equal(401);
        response.body.should.have.property('errors').and.be.an('array').and.length(1);
        response.body.errors[0].should.have.property('status').and.equal(401);
        response.body.errors[0].should.have.property('detail').and.equal('Unauthorized');
    });

    it('Update a deletion while being logged in as USER should return a 403 \'Forbidden\' error', async () => {
        const token: string = mockValidJWT({ role: 'USER' });

        const deletion: HydratedDocument<IDeletion> = await new DeletionModel(createDeletion()).save() as HydratedDocument<IDeletion>;

        const response: request.Response = await requester
            .patch(`/api/v1/deletion/${deletion._id.toString()}`)
            .set('Authorization', `Bearer ${token}`)
            .send({});

        response.status.should.equal(403);
        response.body.should.have.property('errors').and.be.an('array').and.length(1);
        response.body.errors[0].should.have.property('status').and.equal(403);
        response.body.errors[0].should.have.property('detail').and.equal('Not authorized');
    });

    it('Update a deletion that does not exist while being logged in as ADMIN user should return a 404 \'Deletion not found\' error', async () => {
        const token: string = mockValidJWT({ role: 'ADMIN' });

        const response: request.Response = await requester
            .patch(`/api/v1/deletion/${new mongoose.Types.ObjectId().toString()}`)
            .set('Authorization', `Bearer ${token}`)
            .send({});

        response.status.should.equal(404);
        response.body.should.have.property('errors').and.be.an('array').and.length(1);
        response.body.errors[0].should.have.property('status').and.equal(404);
        response.body.errors[0].should.have.property('detail').and.equal('Deletion not found');
    });

    it('Update a deletion while being logged in as ADMIN should return a 200 and the user data (happy case - no user data provided)', async () => {
        const token: string = mockValidJWT({ role: 'ADMIN' });

        const deletion: HydratedDocument<IDeletion> = await new DeletionModel(createDeletion()).save() as HydratedDocument<IDeletion>;

        const response: request.Response = await requester
            .patch(`/api/v1/deletion/${deletion._id.toString()}`)
            .set('Authorization', `Bearer ${token}`)
            .send({});

        response.status.should.equal(200);
        response.body.should.have.property('data').and.be.an('object');

        const responseDeletion: Record<string, any> = response.body.data;

        responseDeletion.should.have.property('type').and.equal('deletions');
        responseDeletion.should.have.property('id').and.equal(deletion._id.toString());
        responseDeletion.should.have.property('attributes').and.be.an('object');
        responseDeletion.attributes.should.have.property('userId').and.equal(deletion.userId);
        responseDeletion.attributes.should.have.property('requestorUserId').and.equal(deletion.requestorUserId);
        responseDeletion.attributes.should.have.property('createdAt');
        new Date(responseDeletion.attributes.createdAt).should.equalDate(deletion.createdAt);
        responseDeletion.attributes.should.have.property('updatedAt');
        new Date(responseDeletion.attributes.updatedAt).should.equalDate(deletion.updatedAt);
        responseDeletion.attributes.should.have.property('status').and.equal(deletion.status);
        responseDeletion.attributes.should.have.property('datasetsDeleted').and.equal(deletion.datasetsDeleted);
        responseDeletion.attributes.should.have.property('layersDeleted').and.equal(deletion.layersDeleted);
        responseDeletion.attributes.should.have.property('widgetsDeleted').and.equal(deletion.widgetsDeleted);
        responseDeletion.attributes.should.have.property('userAccountDeleted').and.equal(deletion.userAccountDeleted);
        responseDeletion.attributes.should.have.property('userDataDeleted').and.equal(deletion.userDataDeleted);
        responseDeletion.attributes.should.have.property('graphDataDeleted').and.equal(deletion.graphDataDeleted);
        responseDeletion.attributes.should.have.property('collectionsDeleted').and.equal(deletion.collectionsDeleted);
        responseDeletion.attributes.should.have.property('favouritesDeleted').and.equal(deletion.favouritesDeleted);
        responseDeletion.attributes.should.have.property('vocabulariesDeleted').and.equal(deletion.vocabulariesDeleted);
        responseDeletion.attributes.should.have.property('areasDeleted').and.equal(deletion.areasDeleted);
        responseDeletion.attributes.should.have.property('storiesDeleted').and.equal(deletion.storiesDeleted);
        responseDeletion.attributes.should.have.property('subscriptionsDeleted').and.equal(deletion.subscriptionsDeleted);
        responseDeletion.attributes.should.have.property('dashboardsDeleted').and.equal(deletion.dashboardsDeleted);
        responseDeletion.attributes.should.have.property('profilesDeleted').and.equal(deletion.profilesDeleted);
        responseDeletion.attributes.should.have.property('topicsDeleted').and.equal(deletion.topicsDeleted);
    });

    it('Update a deletion while being logged in should return a 200 and the updated user data (happy case)', async () => {
        const token: string = mockValidJWT({ role: 'ADMIN' });

        const deletion: HydratedDocument<IDeletion> = await new DeletionModel(createDeletion()).save() as HydratedDocument<IDeletion>;

        const response: request.Response = await requester
            .patch(`/api/v1/deletion/${deletion._id.toString()}`)
            .set('Authorization', `Bearer ${token}`)
            .send({
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
        response.body.should.have.property('data').and.be.an('object');
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

    afterEach(async () => {
        await DeletionModel.deleteMany({}).exec();

        if (!nock.isDone()) {
            throw new Error(`Not all nock interceptors were used: ${nock.pendingMocks()}`);
        }
    });
});
