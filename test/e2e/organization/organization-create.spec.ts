import nock from 'nock';
import chai from 'chai';
import OrganizationModel, { CreateOrganizationsDto, IOrganization } from 'models/organization';
import chaiDateTime from 'chai-datetime';
import { getTestAgent } from '../utils/test-server';
import request from 'superagent';
import { mockValidJWT } from '../okta/okta.mocks';
import { createApplication } from "../utils/helpers";
import ApplicationModel, { IApplication } from "models/application";

chai.should();
chai.use(chaiDateTime);

let requester: ChaiHttp.Agent;

nock.disableNetConnect();
nock.enableNetConnect(process.env.HOST_IP);

const sendCreateOrganizationRequest: (token: string, organization?: Partial<CreateOrganizationsDto>) => Promise<request.Response> = async (token: string, organization: Partial<CreateOrganizationsDto> = {}) => requester
    .post(`/api/v1/organization`)
    .set('Authorization', `Bearer ${token}`)
    .send({ ...organization });

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

    it('Create a organization while being logged in as ADMIN should return a 200 (happy case)', async () => {
        const token: string = mockValidJWT({ role: 'ADMIN' });

        const response: request.Response = await sendCreateOrganizationRequest(token, { name: "my organization" });
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
            const token: string = mockValidJWT({ role: 'ADMIN' });
            const testApplication: IApplication = await createApplication();

            const response: request.Response = await sendCreateOrganizationRequest(token, {
                name: "my organization",
                applications: [testApplication.id]
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
        });
    })

    afterEach(async () => {
        await ApplicationModel.deleteMany({}).exec();
        await OrganizationModel.deleteMany({}).exec();

        if (!nock.isDone()) {
            throw new Error(`Not all nock interceptors were used: ${nock.pendingMocks()}`);
        }
    });
});
