import nock from 'nock';
import type request from 'superagent';
import { closeTestAgent, getTestAgent } from '../utils/test-server';
import { getMockOktaUser, mockGetUserById, mockOktaListUsers, mockValidJWT } from "../okta/okta.mocks";
import { OktaUser } from "services/okta.interfaces";
import chai from "chai";
import {
    mockGetResourcesCalls,
    mockValidateRequestWithApiKey,
    mockValidateRequestWithApiKeyAndUserToken
} from "../utils/mocks";
import { HydratedDocument } from "mongoose";
import application, { IApplication } from "models/application";
import { createApplication, createOrganization } from "../utils/helpers";
import ApplicationUserModel from "models/application-user";
import { IOrganization } from "models/organization";
import OrganizationUserModel, { ORGANIZATION_ROLES } from "models/organization-user";

let requester: ChaiHttp.Agent;
chai.should();

nock.disableNetConnect();
nock.enableNetConnect(process.env.HOST_IP);

describe('GET user resources', () => {

    before(async () => {
        if (process.env.NODE_ENV !== 'test') {
            throw Error(`Running the test suite with NODE_ENV ${process.env.NODE_ENV} may result in permanent data loss. Please use NODE_ENV=test.`);
        }
    });

    beforeEach(async () => {
        requester = await getTestAgent();
    });

    it('Get user resources without being logged in returns a 401', async () => {
        mockValidateRequestWithApiKey({});
        const userId: string = '41224d776a326fb40f000001';

        const response: request.Response = await requester
            .get(`/auth/user/${userId}/resources`)
            .set('x-api-key', 'api-key-test');

        response.status.should.equal(401);
    });

    it('Get user resources while being logged in as a regular user returns a 403 error', async () => {
        const userId: string = '41224d776a326fb40f000001';

        const token: string = mockValidJWT();
        mockValidateRequestWithApiKeyAndUserToken({ token });
        const response: request.Response = await requester
            .get(`/auth/user/${userId}/resources`)
            .set('x-api-key', 'api-key-test')
            .set('Authorization', `Bearer ${token}`);

        response.status.should.equal(403);
        response.body.should.have.property('errors').and.be.an('array');
        response.body.errors[0].should.have.property('detail').and.equal(`Not authorized`);
    });

    it('Get user resources with id of a user that exists returns the requested user (happy case)', async () => {
        const token: string = mockValidJWT({ role: 'ADMIN' });
        const user: OktaUser = getMockOktaUser();
        mockOktaListUsers({ limit: 1, search: `(profile.legacyId eq "${user.profile.legacyId}")` }, [user]);

        mockGetResourcesCalls(user.profile.legacyId);

        const testApplication: HydratedDocument<IApplication> = await createApplication();
        const testOrganization: HydratedDocument<IOrganization> = await createOrganization();

        await new ApplicationUserModel({
            userId: user.profile.legacyId,
            application: testApplication
        }).save();
        await new OrganizationUserModel({
            role: ORGANIZATION_ROLES.ORG_MEMBER,
            userId: user.profile.legacyId,
            organization: testOrganization
        }).save();

        mockGetUserById(user, 2);
        mockValidateRequestWithApiKeyAndUserToken({ token });

        const response: request.Response = await requester
            .get(`/auth/user/${user.profile.legacyId}/resources`)
            .set('Content-Type', 'application/json')
            .set('x-api-key', 'api-key-test')
            .set('Authorization', `Bearer ${token}`);

        response.status.should.equal(200);
        response.body.should.have.property('datasets').and.be.an('object').and.have.property('data').and.have.length(1);
        response.body.should.have.property('datasets').and.be.an('object').and.have.property('count').and.equal(1);
        response.body.should.have.property('layers').and.be.an('object').and.have.property('data').and.have.length(2);
        response.body.should.have.property('layers').and.be.an('object').and.have.property('count').and.equal(3);
        response.body.should.have.property('widgets').and.be.an('object').and.have.property('data').and.have.length(1);
        response.body.should.have.property('widgets').and.be.an('object').and.have.property('count').and.equal(5);
        response.body.should.have.property('userAccount').and.be.an('object').and.have.property('data');
        response.body.should.have.property('userAccount').and.be.an('object').and.have.property('count').and.equal(1);
        response.body.should.have.property('userData').and.be.an('object').and.have.property('data');
        response.body.should.have.property('userData').and.be.an('object').and.have.property('count').and.equal(1);
        response.body.should.have.property('collections').and.be.an('object').and.have.property('data').and.have.length(1);
        response.body.should.have.property('collections').and.be.an('object').and.have.property('count').and.equal(2);
        response.body.should.have.property('applications').and.be.an('object').and.have.property('data').and.have.length(1);
        response.body.should.have.property('applications').and.be.an('object').and.have.property('count').and.equal(1);
        response.body.should.have.property('organizations').and.be.an('object').and.have.property('data').and.have.length(1);
        response.body.should.have.property('organizations').and.be.an('object').and.have.property('count').and.equal(1);
        response.body.should.have.property('areas').and.be.an('object').and.have.property('data').and.have.length(3);
        response.body.should.have.property('areas').and.be.an('object').and.have.property('count').and.equal(3);
        response.body.should.have.property('stories').and.be.an('object').and.have.property('data').and.have.length(2);
        response.body.should.have.property('stories').and.be.an('object').and.have.property('count').and.equal(2);
        response.body.should.have.property('subscriptions').and.be.an('object').and.have.property('data').and.have.length(1);
        response.body.should.have.property('subscriptions').and.be.an('object').and.have.property('count').and.equal(1);
        response.body.should.have.property('dashboards').and.be.an('object').and.have.property('data').and.have.length(1);
        response.body.should.have.property('dashboards').and.be.an('object').and.have.property('count').and.equal(1);
        response.body.should.have.property('profiles').and.be.an('object').and.have.property('data');
        response.body.should.have.property('profiles').and.be.an('object').and.have.property('count').and.equal(1);
        response.body.should.have.property('topics').and.be.an('object').and.have.property('data').and.have.length(1);
        response.body.should.have.property('topics').and.be.an('object').and.have.property('count').and.equal(1);
    });

    afterEach(async () => {
        if (!nock.isDone()) {
            throw new Error(`Not all nock interceptors were used: ${nock.pendingMocks()}`);
        }

        await closeTestAgent();
    });
});
