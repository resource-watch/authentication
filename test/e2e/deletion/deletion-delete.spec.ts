import nock from 'nock';
import chai from 'chai';
import DeletionModel, { IDeletion } from 'models/deletion';
import { getTestAgent } from '../utils/test-server';
import { createDeletion } from '../utils/helpers';
import chaiDateTime from 'chai-datetime';
import request from 'superagent';
import mongoose, { HydratedDocument } from 'mongoose';
import { mockValidJWT } from '../okta/okta.mocks';
import { mockValidateRequestWithApiKey, mockValidateRequestWithApiKeyAndUserToken } from "../utils/mocks";

chai.should();
chai.use(chaiDateTime);

let requester: ChaiHttp.Agent;

nock.disableNetConnect();
nock.enableNetConnect(process.env.HOST_IP);

describe('Delete deletion tests', () => {

    before(async () => {
        if (process.env.NODE_ENV !== 'test') {
            throw Error(`Running the test suite with NODE_ENV ${process.env.NODE_ENV} may result in permanent data loss. Please use NODE_ENV=test.`);
        }

        requester = await getTestAgent();
    });

    beforeEach(async () => {
        await DeletionModel.deleteMany({}).exec();
    });

    it('Delete a deletion while not being logged in should return a 401 \'Unauthorized\' error', async () => {
        const deletion: HydratedDocument<IDeletion> = await new DeletionModel(createDeletion()).save() as HydratedDocument<IDeletion>;

        mockValidateRequestWithApiKey({});

        const response: request.Response = await requester
            .delete(`/api/v1/deletion/${deletion._id.toString()}`)
            .set('x-api-key', 'api-key-test');

        response.status.should.equal(401);
        response.body.should.have.property('errors').and.be.an('array').and.length(1);
        response.body.errors[0].should.have.property('status').and.equal(401);
        response.body.errors[0].should.have.property('detail').and.equal('Not authenticated');
    });

    it('Delete a deletion while being logged in as USER user should return a 403 \'Forbidden\' error', async () => {
        const token: string = mockValidJWT({ role: 'USER' });

        const deletion: HydratedDocument<IDeletion> = await new DeletionModel(createDeletion()).save() as HydratedDocument<IDeletion>;

        mockValidateRequestWithApiKeyAndUserToken({ token });

        const response: request.Response = await requester
            .delete(`/api/v1/deletion/${deletion._id.toString()}`)
            .set('x-api-key', 'api-key-test')
            .set('Authorization', `Bearer ${token}`)
            .send({});

        response.status.should.equal(403);
        response.body.should.have.property('errors').and.be.an('array').and.length(1);
        response.body.errors[0].should.have.property('status').and.equal(403);
        response.body.errors[0].should.have.property('detail').and.equal('Not authorized');
    });

    it('Delete a deletion that does not exist while being logged in as ADMIN user should return a 404 \'Deletion not found\' error', async () => {
        const token: string = mockValidJWT({ role: 'ADMIN' });

        mockValidateRequestWithApiKeyAndUserToken({ token });

        const response: request.Response = await requester
            .patch(`/api/v1/deletion/${new mongoose.Types.ObjectId().toString()}`)
            .set('x-api-key', 'api-key-test')
            .set('Authorization', `Bearer ${token}`)
            .send({});

        response.status.should.equal(404);
        response.body.should.have.property('errors').and.be.an('array').and.length(1);
        response.body.errors[0].should.have.property('status').and.equal(404);
        response.body.errors[0].should.have.property('detail').and.equal('Deletion not found');
    });

    it('Delete a deletion while being logged in with that user should return a 200 and the user data (happy case)', async () => {
        const token: string = mockValidJWT({ role: 'ADMIN' });

        const deletion: HydratedDocument<IDeletion> = await new DeletionModel(createDeletion()).save() as HydratedDocument<IDeletion>;

        mockValidateRequestWithApiKeyAndUserToken({ token });

        const response: request.Response = await requester
            .delete(`/api/v1/deletion/${deletion._id.toString()}`)
            .set('x-api-key', 'api-key-test')
            .set('Authorization', `Bearer ${token}`)
            .send({});

        response.status.should.equal(200);

        const responseDeletion: Record<string, any> = response.body.data;
        const databaseDeletion: IDeletion = await DeletionModel.findById(responseDeletion.id);
        chai.expect(databaseDeletion).to.be.null;

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
        responseDeletion.attributes.should.have.property('collectionsDeleted').and.equal(deletion.collectionsDeleted);
        responseDeletion.attributes.should.have.property('favouritesDeleted').and.equal(deletion.favouritesDeleted);
        responseDeletion.attributes.should.have.property('areasDeleted').and.equal(deletion.areasDeleted);
        responseDeletion.attributes.should.have.property('applicationsDeleted').and.equal(deletion.applicationsDeleted);
        responseDeletion.attributes.should.have.property('storiesDeleted').and.equal(deletion.storiesDeleted);
        responseDeletion.attributes.should.have.property('subscriptionsDeleted').and.equal(deletion.subscriptionsDeleted);
        responseDeletion.attributes.should.have.property('dashboardsDeleted').and.equal(deletion.dashboardsDeleted);
        responseDeletion.attributes.should.have.property('profilesDeleted').and.equal(deletion.profilesDeleted);
        responseDeletion.attributes.should.have.property('topicsDeleted').and.equal(deletion.topicsDeleted);
    });

    afterEach(async () => {
        await DeletionModel.deleteMany({}).exec();

        if (!nock.isDone()) {
            throw new Error(`Not all nock interceptors were used: ${nock.pendingMocks()}`);
        }
    });
});
