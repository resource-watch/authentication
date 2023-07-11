import nock from 'nock';
import chai from 'chai';
import mongoose, { HydratedDocument } from 'mongoose';
import DeletionModel, { IDeletion } from 'models/deletion';
import chaiDateTime from 'chai-datetime';
import { getTestAgent } from '../utils/test-server';
import { createDeletion } from '../utils/helpers';
import request from 'superagent';
import { mockValidJWT } from '../okta/okta.mocks';
import { mockValidateRequestWithApiKey, mockValidateRequestWithApiKeyAndUserToken } from "../utils/mocks";

chai.should();
chai.use(chaiDateTime);

let requester: ChaiHttp.Agent;

nock.disableNetConnect();
nock.enableNetConnect(process.env.HOST_IP);

describe('Get deletion by id tests', () => {

    before(async () => {
        if (process.env.NODE_ENV !== 'test') {
            throw Error(`Running the test suite with NODE_ENV ${process.env.NODE_ENV} may result in permanent data loss. Please use NODE_ENV=test.`);
        }

        requester = await getTestAgent();
    });

    beforeEach(async () => {
        await DeletionModel.deleteMany({}).exec();
    });

    it('Get deletion by id without being authenticated should return a 401 \'Unauthorized\' error', async () => {
        const deletion: HydratedDocument<IDeletion> = await new DeletionModel(createDeletion()).save() as HydratedDocument<IDeletion>;

        mockValidateRequestWithApiKey({});

        const response: request.Response = await requester
            .get(`/api/v1/deletion/${deletion._id.toString()}`)
            .set('x-api-key', 'api-key-test');

        response.status.should.equal(401);
        response.body.should.have.property('errors').and.be.an('array').and.length(1);
        response.body.errors[0].should.have.property('status').and.equal(401);
        response.body.errors[0].should.have.property('detail').and.equal('Not authenticated');
    });

    it('Get deletion by id while being authenticated as a different should return a 403 \'Forbidden\' error', async () => {
        const token: string = mockValidJWT({ role: 'USER' });

        const deletion: HydratedDocument<IDeletion> = await new DeletionModel(createDeletion()).save() as HydratedDocument<IDeletion>;

        mockValidateRequestWithApiKeyAndUserToken({ token });

        const response: request.Response = await requester
            .get(`/api/v1/deletion/${deletion._id.toString()}`)
            .set('x-api-key', 'api-key-test')
            .set('Authorization', `Bearer ${token}`);

        response.status.should.equal(403);
        response.body.should.have.property('errors').and.be.an('array').and.length(1);
        response.body.errors[0].should.have.property('status').and.equal(403);
        response.body.errors[0].should.have.property('detail').and.equal('Not authorized');
    });

    it('Get deletion by id while being authenticated as an ADMIN user should return a 200 and the user data (happy case)', async () => {
        const token: string = mockValidJWT({ role: 'ADMIN' });

        const deletion: HydratedDocument<IDeletion> = await new DeletionModel(createDeletion()).save() as HydratedDocument<IDeletion>;

        mockValidateRequestWithApiKeyAndUserToken({ token });

        const response: request.Response = await requester
            .get(`/api/v1/deletion/${deletion._id.toString()}`)
            .set('x-api-key', 'api-key-test')
            .set('Authorization', `Bearer ${token}`);

        response.status.should.equal(200);
        response.body.should.have.property('data').and.be.an('object');
        response.body.data.should.have.property('type').and.equal('deletions');
        response.body.data.should.have.property('id').and.equal(deletion._id.toString());
        response.body.data.should.have.property('attributes').and.be.an('object');
        response.body.data.attributes.should.have.property('userId').and.equal(deletion.userId);
        response.body.data.attributes.should.have.property('requestorUserId').and.equal(deletion.requestorUserId);
        response.body.data.attributes.should.have.property('createdAt');
        new Date(response.body.data.attributes.createdAt).should.equalDate(deletion.createdAt);
        response.body.data.attributes.should.have.property('updatedAt');
        new Date(response.body.data.attributes.updatedAt).should.equalDate(deletion.updatedAt);
        response.body.data.attributes.should.have.property('status').and.equal(deletion.status);
        response.body.data.attributes.should.have.property('datasetsDeleted').and.equal(deletion.datasetsDeleted);
        response.body.data.attributes.should.have.property('layersDeleted').and.equal(deletion.layersDeleted);
        response.body.data.attributes.should.have.property('widgetsDeleted').and.equal(deletion.widgetsDeleted);
        response.body.data.attributes.should.have.property('userAccountDeleted').and.equal(deletion.userAccountDeleted);
        response.body.data.attributes.should.have.property('userDataDeleted').and.equal(deletion.userDataDeleted);
        response.body.data.attributes.should.have.property('collectionsDeleted').and.equal(deletion.collectionsDeleted);
        response.body.data.attributes.should.have.property('favouritesDeleted').and.equal(deletion.favouritesDeleted);
        response.body.data.attributes.should.have.property('areasDeleted').and.equal(deletion.areasDeleted);
        response.body.data.attributes.should.have.property('applicationsDeleted').and.equal(deletion.applicationsDeleted);
        response.body.data.attributes.should.have.property('storiesDeleted').and.equal(deletion.storiesDeleted);
        response.body.data.attributes.should.have.property('subscriptionsDeleted').and.equal(deletion.subscriptionsDeleted);
        response.body.data.attributes.should.have.property('dashboardsDeleted').and.equal(deletion.dashboardsDeleted);
        response.body.data.attributes.should.have.property('profilesDeleted').and.equal(deletion.profilesDeleted);
        response.body.data.attributes.should.have.property('topicsDeleted').and.equal(deletion.topicsDeleted);
    });

    it('Get deletion by id for an invalid id should return a 404 \'User not found\' error', async () => {
        const token: string = mockValidJWT({ role: 'ADMIN' });

        mockValidateRequestWithApiKeyAndUserToken({ token });

        const response: request.Response = await requester
            .get(`/api/v1/deletion/1234`)
            .set('x-api-key', 'api-key-test')
            .set('Authorization', `Bearer ${token}`);

        response.status.should.equal(404);
        response.body.should.have.property('errors').and.be.an('array').and.length(1);
        response.body.errors[0].should.have.property('status').and.equal(404);
        response.body.errors[0].should.have.property('detail').and.equal('Deletion not found');
    });

    it('Get deletion by id for an valid id that does not exist on the database should return a 404 \'User not found\' error', async () => {
        const token: string = mockValidJWT({ role: 'ADMIN' });

        mockValidateRequestWithApiKeyAndUserToken({ token });

        const response: request.Response = await requester
            .get(`/api/v1/deletion/${new mongoose.Types.ObjectId()}`)
            .set('x-api-key', 'api-key-test')
            .set('Authorization', `Bearer ${token}`);

        response.status.should.equal(404);
        response.body.should.have.property('errors').and.be.an('array').and.length(1);
        response.body.errors[0].should.have.property('status').and.equal(404);
        response.body.errors[0].should.have.property('detail').and.equal('Deletion not found');
    });

    afterEach(async () => {
        await DeletionModel.deleteMany({}).exec();

        if (!nock.isDone()) {
            throw new Error(`Not all nock interceptors were used: ${nock.pendingMocks()}`);
        }
    });
});
