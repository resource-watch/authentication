import nock from 'nock';
import chai from 'chai';
import type request from 'superagent';
import { OktaUser } from 'services/okta.interfaces';
import { assertOktaTokenInfo, createApplication, createOrganization } from '../utils/helpers';
import { closeTestAgent, getTestAgent } from '../utils/test-server';
import { getMockOktaUser, mockOktaListUsers, mockValidJWT } from './okta.mocks';
import ApplicationModel, { IApplication } from "models/application";
import ApplicationUserModel from "models/application-user";
import OrganizationModel, { IOrganization } from "models/organization";
import OrganizationUserModel from "models/organization-user";
import OrganizationApplicationModel from "models/organization-application";

chai.should();

let requester: ChaiHttp.Agent;

nock.disableNetConnect();
nock.enableNetConnect(process.env.HOST_IP);

describe('[OKTA] GET current user details', () => {

    before(async () => {
        if (process.env.NODE_ENV !== 'test') {
            throw Error(`Running the test suite with NODE_ENV ${process.env.NODE_ENV} may result in permanent data loss. Please use NODE_ENV=test.`);
        }

        requester = await getTestAgent();
    });

    it('Getting my user without being logged in returns a 401', async () => {
        const response: request.Response = await requester.get(`/auth/user/me`);
        response.status.should.equal(401);
    });

    it('Getting my user while being logged in with USER role returns the user', async () => {
        const user: OktaUser = getMockOktaUser();
        const token: string = mockValidJWT({
            id: user.profile.legacyId,
            email: user.profile.email,
            role: user.profile.role,
            extraUserData: { apps: user.profile.apps },
        });
        mockOktaListUsers({ limit: 1, search: `(profile.legacyId eq "${user.profile.legacyId}")` }, [user]);

        const response: request.Response = await requester.get(`/auth/user/me`).set('Authorization', `Bearer ${token}`);
        assertOktaTokenInfo(response, user);
    });

    it('Getting my user while being logged in with MANAGER role returns the user', async () => {
        const user: OktaUser = getMockOktaUser({ role: 'MANAGER' });
        const token: string = mockValidJWT({
            id: user.profile.legacyId,
            email: user.profile.email,
            role: user.profile.role,
            extraUserData: { apps: user.profile.apps },
        });
        mockOktaListUsers({ limit: 1, search: `(profile.legacyId eq "${user.profile.legacyId}")` }, [user]);

        const response: request.Response = await requester.get(`/auth/user/me`).set('Authorization', `Bearer ${token}`);
        assertOktaTokenInfo(response, user);
    });

    it('Getting my user while being logged in with ADMIN role returns the user', async () => {
        const user: OktaUser = getMockOktaUser({ role: 'ADMIN' });
        const token: string = mockValidJWT({
            id: user.profile.legacyId,
            email: user.profile.email,
            role: user.profile.role,
            extraUserData: { apps: user.profile.apps },
        });
        mockOktaListUsers({ limit: 1, search: `(profile.legacyId eq "${user.profile.legacyId}")` }, [user]);

        const response: request.Response = await requester.get(`/auth/user/me`).set('Authorization', `Bearer ${token}`);
        assertOktaTokenInfo(response, user);
    });

    it('Getting my user while being logged in with MICROSERVICE id returns the user', async () => {
        const user: OktaUser = getMockOktaUser({ role: 'MICROSERVICE' });
        const token: string = mockValidJWT({
            id: user.profile.legacyId,
            email: user.profile.email,
            role: user.profile.role,
            extraUserData: { apps: user.profile.apps },
        });
        mockOktaListUsers({ limit: 1, search: `(profile.legacyId eq "${user.profile.legacyId}")` }, [user]);

        const response: request.Response = await requester.get(`/auth/user/me`).set('Authorization', `Bearer ${token}`);
        assertOktaTokenInfo(response, user);
    });

    describe('with associated applications', () => {
        it('Getting an user with associated applications should be successful and get the association', async () => {
            const user: OktaUser = getMockOktaUser({ role: 'ADMIN' });
            const token: string = mockValidJWT({
                id: user.profile.legacyId,
                email: user.profile.email,
                role: user.profile.role,
                extraUserData: { apps: user.profile.apps },
            });

            const testApplication: IApplication = await createApplication();

            await new ApplicationUserModel({
                userId: user.profile.legacyId,
                application: testApplication
            }).save();

            mockOktaListUsers({ limit: 1, search: `(profile.legacyId eq "${user.profile.legacyId}")` }, [user]);

            const response: request.Response = await requester
                .get(`/auth/user/me`)
                .set('Content-Type', 'application/json')
                .set('Authorization', `Bearer ${token}`);

            response.status.should.equal(200);
            response.body.should.have.property('name').and.equal(user.profile.displayName);
            response.body.should.have.property('photo').and.equal(user.profile.photo);
            response.body.should.have.property('extraUserData').and.be.an('object').and.deep.eql({ apps: user.profile.apps });
            response.body.should.have.property('role').and.equal(user.profile.role);
            response.body.should.have.property('id').and.equal(user.profile.legacyId);
            response.body.should.have.property('email').and.equal(user.profile.email);
            response.body.should.have.property('applications').and.eql([{
                id: testApplication.id,
                name: testApplication.name,
            }]);
            response.body.should.have.property('createdAt');
            response.body.should.have.property('updatedAt');
        });
    })

    describe('with associated organizations', () => {
        it('Getting an user with associated organizations should be successful and get the association', async () => {
            const user: OktaUser = getMockOktaUser({ role: 'ADMIN' });
            const token: string = mockValidJWT({
                id: user.profile.legacyId,
                email: user.profile.email,
                role: user.profile.role,
                extraUserData: { apps: user.profile.apps },
            });

            const testOrganization: IOrganization = await createOrganization();

            await new OrganizationUserModel({
                userId: user.profile.legacyId,
                organization: testOrganization,
                role: 'ORG_ADMIN'
            }).save();

            mockOktaListUsers({ limit: 1, search: `(profile.legacyId eq "${user.profile.legacyId}")` }, [user]);

            const response: request.Response = await requester
                .get(`/auth/user/me`)
                .set('Content-Type', 'application/json')
                .set('Authorization', `Bearer ${token}`);

            response.status.should.equal(200);
            response.body.should.have.property('name').and.equal(user.profile.displayName);
            response.body.should.have.property('photo').and.equal(user.profile.photo);
            response.body.should.have.property('extraUserData').and.be.an('object').and.deep.eql({ apps: user.profile.apps });
            response.body.should.have.property('role').and.equal(user.profile.role);
            response.body.should.have.property('id').and.equal(user.profile.legacyId);
            response.body.should.have.property('email').and.equal(user.profile.email);
            response.body.should.have.property('organizations').and.eql([{
                id: testOrganization.id,
                name: testOrganization.name,
                role: 'ORG_ADMIN'
            }]);
            response.body.should.have.property('createdAt');
            response.body.should.have.property('updatedAt');
        });
    })

    after(async () => {
        await closeTestAgent();
    });

    afterEach(async () => {
        await ApplicationModel.deleteMany({}).exec();
        await OrganizationModel.deleteMany({}).exec();
        await OrganizationApplicationModel.deleteMany({}).exec();
        await OrganizationUserModel.deleteMany({}).exec();
        await ApplicationUserModel.deleteMany({}).exec();

        if (!nock.isDone()) {
            throw new Error(`Not all nock interceptors were used: ${nock.pendingMocks()}`);
        }
    });
});
