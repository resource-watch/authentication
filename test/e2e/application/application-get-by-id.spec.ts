import nock from 'nock';
import chai from 'chai';
import mongoose, { HydratedDocument } from 'mongoose';
import ApplicationModel, { IApplication } from 'models/application';
import chaiDateTime from 'chai-datetime';
import { getTestAgent } from '../utils/test-server';
import { createApplication } from '../utils/helpers';
import request from 'superagent';
import { mockValidJWT } from '../okta/okta.mocks';

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

        const response: request.Response = await requester
            .get(`/api/v1/application/${application._id.toString()}`);

        response.status.should.equal(401);
        response.body.should.have.property('errors').and.be.an('array').and.length(1);
        response.body.errors[0].should.have.property('status').and.equal(401);
        response.body.errors[0].should.have.property('detail').and.equal('Not authenticated');
    });

    it('Get application by id while being authenticated as a different should return a 403 \'Forbidden\' error', async () => {
        const token: string = mockValidJWT({ role: 'USER' });

        const application: HydratedDocument<IApplication> = await createApplication();

        const response: request.Response = await requester
            .get(`/api/v1/application/${application._id.toString()}`)
            .set('Authorization', `Bearer ${token}`);

        response.status.should.equal(403);
        response.body.should.have.property('errors').and.be.an('array').and.length(1);
        response.body.errors[0].should.have.property('status').and.equal(403);
        response.body.errors[0].should.have.property('detail').and.equal('Not authorized');
    });

    it('Get application by id while being authenticated as an ADMIN user should return a 200 and the user data (happy case)', async () => {
        const token: string = mockValidJWT({ role: 'ADMIN' });

        const application: HydratedDocument<IApplication> = await createApplication();

        const response: request.Response = await requester
            .get(`/api/v1/application/${application._id.toString()}`)
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

    it('Get application by id for an invalid id should return a 404 \'User not found\' error', async () => {
        const token: string = mockValidJWT({ role: 'ADMIN' });

        const response: request.Response = await requester
            .get(`/api/v1/application/1234`)
            .set('Authorization', `Bearer ${token}`);

        response.status.should.equal(404);
        response.body.should.have.property('errors').and.be.an('array').and.length(1);
        response.body.errors[0].should.have.property('status').and.equal(404);
        response.body.errors[0].should.have.property('detail').and.equal('Application not found');
    });

    it('Get application by id for an valid id that does not exist on the database should return a 404 \'User not found\' error', async () => {
        const token: string = mockValidJWT({ role: 'ADMIN' });

        const response: request.Response = await requester
            .get(`/api/v1/application/${new mongoose.Types.ObjectId()}`)
            .set('Authorization', `Bearer ${token}`);

        response.status.should.equal(404);
        response.body.should.have.property('errors').and.be.an('array').and.length(1);
        response.body.errors[0].should.have.property('status').and.equal(404);
        response.body.errors[0].should.have.property('detail').and.equal('Application not found');
    });

    afterEach(async () => {
        await ApplicationModel.deleteMany({}).exec();

        if (!nock.isDone()) {
            throw new Error(`Not all nock interceptors were used: ${nock.pendingMocks()}`);
        }
    });
});
