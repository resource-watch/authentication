import nock from 'nock';
import chai from 'chai';
import ApplicationModel, { IApplication } from 'models/application';
import chaiDateTime from 'chai-datetime';
import { getTestAgent } from '../utils/test-server';
import request from 'superagent';
import { mockValidJWT } from '../okta/okta.mocks';
import { mockCreateAWSAPIGatewayAPIKey } from "./aws.mocks";
import { createApplication, createOrganization } from "../utils/helpers";
import OrganizationModel, { IOrganization } from "../../../src/models/organization";

chai.should();
chai.use(chaiDateTime);

let requester: ChaiHttp.Agent;

nock.disableNetConnect();
nock.enableNetConnect(process.env.HOST_IP);

const sendCreateApplicationRequest: (token: string, application?: Partial<IApplication>) => Promise<request.Response> = async (token: string, application: Partial<IApplication> = {}) => requester
    .post(`/api/v1/application`)
    .set('Authorization', `Bearer ${token}`)
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
            .send({});

        response.status.should.equal(401);
        response.body.should.have.property('errors').and.be.an('array').and.length(1);
        response.body.errors[0].should.have.property('status', 401);
        response.body.errors[0].should.have.property('detail', 'Not authenticated');
    });

    it('Create a application while being logged in as USER should return a 403', async () => {
        const token: string = mockValidJWT({ role: 'USER' });

        const response: request.Response = await sendCreateApplicationRequest(token);

        response.status.should.equal(403);
        response.body.should.have.property('errors').and.be.an('array').and.length(1);
        response.body.errors[0].should.have.property('status').and.equal(403);
        response.body.errors[0].should.have.property('detail').and.equal('Not authorized');
    });

    it('Create a application while being logged in as ADMIN without the required fields should return a 400 \'Unauthorized\' error', async () => {
        const token: string = mockValidJWT({ role: 'ADMIN' });

        const response: request.Response = await sendCreateApplicationRequest(token);

        response.status.should.equal(400);
        response.body.should.have.property('errors').and.be.an('array').and.length(1);
        response.body.errors[0].should.have.property('status', 400);
        response.body.errors[0].should.have.property('detail', '"name" is required');
    });

    it('Create a application while being logged in as ADMIN should return a 200 (happy case)', async () => {
        const token: string = mockValidJWT({ role: 'ADMIN' });

        const apiKey = mockCreateAWSAPIGatewayAPIKey();

        const response: request.Response = await sendCreateApplicationRequest(token, { name: "my application" });
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
        it('Create an application with associated organization should be successful', async () => {
            const token: string = mockValidJWT({ role: 'ADMIN' });
            const apiKey = mockCreateAWSAPIGatewayAPIKey();

            const testOrganization: IOrganization = await createOrganization();

            const response: request.Response = await sendCreateApplicationRequest(token, {
                name: "my application",
                organization: testOrganization.id
            });
            response.status.should.equal(200);

            const databaseApplication: IApplication = await ApplicationModel.findById(response.body.data.id);

            response.body.data.should.have.property('type').and.equal('applications');
            response.body.data.should.have.property('id').and.equal(databaseApplication._id.toString());
            response.body.data.should.have.property('attributes').and.be.an('object');
            response.body.data.attributes.should.have.property('name').and.equal(databaseApplication.name);
            response.body.data.attributes.should.have.property('organization').and.eql({
                id: testOrganization.id,
                name: testOrganization.name,
            });
            response.body.data.attributes.should.have.property('apiKeyValue').and.equal(apiKey);
            response.body.data.attributes.should.have.property('createdAt');
            new Date(response.body.data.attributes.createdAt).should.equalDate(databaseApplication.createdAt);
            response.body.data.attributes.should.have.property('updatedAt');
            new Date(response.body.data.attributes.updatedAt).should.equalDate(databaseApplication.updatedAt);
        });
    })

    afterEach(async () => {
        await ApplicationModel.deleteMany({}).exec();

        if (!nock.isDone()) {
            throw new Error(`Not all nock interceptors were used: ${nock.pendingMocks()}`);
        }
    });
});
