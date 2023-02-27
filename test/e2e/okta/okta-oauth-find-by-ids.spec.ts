import nock from 'nock';
import chai from 'chai';
import type request from 'superagent';

import { OktaUser } from 'services/okta.interfaces';
import { closeTestAgent, getTestAgent } from '../utils/test-server';
import { TOKENS } from '../utils/test.constants';
import { getMockOktaUser, mockOktaListUsers, mockValidJWT } from './okta.mocks';
import { IApplication } from "models/application";
import { createApplication, createOrganization } from "../utils/helpers";
import ApplicationUserModel from "models/application-user";
import { IOrganization } from "models/organization";
import OrganizationUserModel from "models/organization-user";

chai.should();

let requester: ChaiHttp.Agent;

nock.disableNetConnect();
nock.enableNetConnect(process.env.HOST_IP);

describe('[OKTA] Find users by id', () => {

    before(async () => {
        if (process.env.NODE_ENV !== 'test') {
            throw Error(`Running the test suite with NODE_ENV ${process.env.NODE_ENV} may result in permanent data loss. Please use NODE_ENV=test.`);
        }

        requester = await getTestAgent();
    });

    it('Find users without being logged in returns a 401', async () => {
        const response: request.Response = await requester
            .post(`/auth/user/find-by-ids`)
            .send({});

        response.status.should.equal(401);
    });

    it('Find users while being logged in as a regular user returns a 401 error', async () => {
        const token: string = mockValidJWT();

        const response: request.Response = await requester
            .post(`/auth/user/find-by-ids`)
            .set('Authorization', `Bearer ${token}`)
            .send({});

        response.status.should.equal(403);
        response.body.should.have.property('errors').and.be.an('array');
        response.body.errors[0].should.have.property('detail').and.equal(`Not authorized`);
    });

    it('Find users without ids in body returns a 400 error', async () => {
        const response: request.Response = await requester
            .post(`/auth/user/find-by-ids`)
            .set('Authorization', `Bearer ${TOKENS.MICROSERVICE}`)
            .send({});

        response.status.should.equal(400);
        response.body.should.have.property('errors').and.be.an('array');
        response.body.errors[0].should.have.property('detail').and.equal(`Ids objects required`);
    });

    it('Find users with id list containing non-object ids returns an empty list (invalid ids are ignored)', async () => {
        mockOktaListUsers({ limit: 200, search: `((profile.legacyId eq "123"))` }, []);

        const response: request.Response = await requester
            .post(`/auth/user/find-by-ids`)
            .set('Authorization', `Bearer ${TOKENS.MICROSERVICE}`)
            .send({ ids: ['123'] });

        response.status.should.equal(200);
        response.body.should.have.property('data').and.be.an('array').and.length(0);
    });

    it('Find users with id list containing user that does not exist returns an empty list (empty db)', async () => {
        mockOktaListUsers({ limit: 200, search: `((profile.legacyId eq "58333dcfd9f39b189ca44c75"))` }, []);

        const response: request.Response = await requester
            .post(`/auth/user/find-by-ids`)
            .set('Authorization', `Bearer ${TOKENS.MICROSERVICE}`)
            .send({ ids: ['58333dcfd9f39b189ca44c75'] });

        response.status.should.equal(200);
        response.body.should.have.property('data').and.be.an('array').and.length(0);
    });

    it('Find users with id list containing a user that exists returns only the listed user', async () => {
        const user: OktaUser = getMockOktaUser();
        mockOktaListUsers({ limit: 200, search: `((profile.legacyId eq "${user.id}"))` }, [user]);

        const response: request.Response = await requester
            .post(`/auth/user/find-by-ids`)
            .set('Authorization', `Bearer ${TOKENS.MICROSERVICE}`)
            .send({ ids: [user.id] });

        response.status.should.equal(200);
        response.body.should.have.property('data').and.be.an('array').and.length(1);

        const responseUserOne: Record<string, any> = response.body.data[0];

        responseUserOne.should.have.property('_id').and.equal(user.profile.legacyId);
        responseUserOne.should.have.property('extraUserData').and.be.an('object');
        responseUserOne.extraUserData.should.have.property('apps').and.be.an('array').and.deep.equal(user.profile.apps);
        responseUserOne.should.have.property('email').and.equal(user.profile.email);
        responseUserOne.should.have.property('createdAt');
        responseUserOne.should.have.property('role').and.equal(user.profile.role);
        responseUserOne.should.have.property('provider').and.equal(user.profile.provider);
    });

    it('Find users with id list containing users that exist returns the listed users', async () => {
        const userOne: OktaUser = getMockOktaUser();
        const userTwo: OktaUser = getMockOktaUser();
        mockOktaListUsers(
            { limit: 200, search: `((profile.legacyId eq "${userOne.id}") or (profile.legacyId eq "${userTwo.id}"))` },
            [userOne, userTwo]
        );

        const response: request.Response = await requester
            .post(`/auth/user/find-by-ids`)
            .set('Authorization', `Bearer ${TOKENS.MICROSERVICE}`)
            .send({ ids: [userOne.id, userTwo.id] });

        response.status.should.equal(200);
        response.body.should.have.property('data').and.be.an('array').and.length(2);

        const responseUserOne: Record<string, any> = response.body.data[0];
        const responseUserTwo: Record<string, any> = response.body.data[1];

        responseUserOne.should.have.property('_id').and.equal(userOne.profile.legacyId);
        responseUserOne.should.have.property('extraUserData').and.be.an('object');
        responseUserOne.extraUserData.should.have.property('apps').and.be.an('array').and.deep.equal(userOne.profile.apps);
        responseUserOne.should.have.property('email').and.equal(userOne.profile.email);
        responseUserOne.should.have.property('createdAt');
        responseUserOne.should.have.property('role').and.equal(userOne.profile.role);
        responseUserOne.should.have.property('provider').and.equal(userOne.profile.provider);

        responseUserTwo.should.have.property('_id').and.equal(userTwo.profile.legacyId);
        responseUserTwo.should.have.property('extraUserData').and.be.an('object');
        responseUserTwo.extraUserData.should.have.property('apps').and.be.an('array').and.deep.equal(userTwo.profile.apps);
        responseUserTwo.should.have.property('email').and.equal(userTwo.profile.email);
        responseUserTwo.should.have.property('createdAt');
        responseUserTwo.should.have.property('role').and.equal(userTwo.profile.role);
        responseUserTwo.should.have.property('provider').and.equal(userTwo.profile.provider);
    });

    it('Find users with id list containing users that exist returns the listed users (id query param is useless)', async () => {
        const userOne: OktaUser = getMockOktaUser();
        mockOktaListUsers(
            { limit: 200, search: `((profile.legacyId eq "${userOne.id}"))` },
            [userOne]
        );

        const response: request.Response = await requester
            .post(`/auth/user/find-by-ids?ids=123333`)
            .set('Authorization', `Bearer ${TOKENS.MICROSERVICE}`)
            .send({ ids: [userOne.id] });

        response.status.should.equal(200);
        response.body.should.have.property('data').and.be.an('array').and.length(1);

        const responseUserOne: Record<string, any> = response.body.data[0];

        responseUserOne.should.have.property('_id').and.equal(userOne.profile.legacyId);
        responseUserOne.should.have.property('extraUserData').and.be.an('object');
        responseUserOne.extraUserData.should.have.property('apps').and.be.an('array').and.deep.equal(userOne.profile.apps);
        responseUserOne.should.have.property('email').and.equal(userOne.profile.email);
        responseUserOne.should.have.property('createdAt');
        responseUserOne.should.have.property('role').and.equal(userOne.profile.role);
        responseUserOne.should.have.property('provider').and.equal(userOne.profile.provider);
    });

    describe('with associated applications', () => {
        it('Getting an user with associated applications should be successful and get the association', async () => {
            const user: OktaUser = getMockOktaUser();

            const testApplication: IApplication = await createApplication();

            await new ApplicationUserModel({
                userId: user.profile.legacyId,
                application: testApplication
            }).save();

            mockOktaListUsers(
                { limit: 200, search: `((profile.legacyId eq "${user.id}"))` },
                [user]
            );

            const response: request.Response = await requester
                .post(`/auth/user/find-by-ids`)
                .set('Authorization', `Bearer ${TOKENS.MICROSERVICE}`)
                .send({ ids: [user.id] });

            response.status.should.equal(200);
            response.body.data[0].should.have.property('name').and.equal(user.profile.displayName);
            response.body.data[0].should.have.property('photo').and.equal(user.profile.photo);
            response.body.data[0].should.have.property('extraUserData').and.be.an('object').and.deep.eql({ apps: user.profile.apps });
            response.body.data[0].should.have.property('role').and.equal(user.profile.role);
            response.body.data[0].should.have.property('id').and.equal(user.profile.legacyId);
            response.body.data[0].should.have.property('email').and.equal(user.profile.email);
            response.body.data[0].should.have.property('applications').and.eql([{
                id: testApplication.id,
                name: testApplication.name,
            }]);
            response.body.data[0].should.have.property('createdAt');
            response.body.data[0].should.have.property('updatedAt');
        });
    })

    describe('with associated organizations', () => {
        it('Getting an user with associated organizations should be successful and get the association', async () => {
            const user: OktaUser = getMockOktaUser();

            const testOrganization: IOrganization = await createOrganization();

            await new OrganizationUserModel({
                userId: user.profile.legacyId,
                organization: testOrganization,
                role: 'ORG_ADMIN'
            }).save();

            mockOktaListUsers(
                { limit: 200, search: `((profile.legacyId eq "${user.id}"))` },
                [user]
            );
            
            const response: request.Response = await requester
                .post(`/auth/user/find-by-ids`)
                .set('Authorization', `Bearer ${TOKENS.MICROSERVICE}`)
                .send({ ids: [user.id] });

            response.status.should.equal(200);
            response.body.data[0].should.have.property('name').and.equal(user.profile.displayName);
            response.body.data[0].should.have.property('photo').and.equal(user.profile.photo);
            response.body.data[0].should.have.property('extraUserData').and.be.an('object').and.deep.eql({ apps: user.profile.apps });
            response.body.data[0].should.have.property('role').and.equal(user.profile.role);
            response.body.data[0].should.have.property('id').and.equal(user.profile.legacyId);
            response.body.data[0].should.have.property('email').and.equal(user.profile.email);
            response.body.data[0].should.have.property('organizations').and.eql([{
                id: testOrganization.id,
                name: testOrganization.name,
                role: 'ORG_ADMIN'
            }]);
            response.body.data[0].should.have.property('createdAt');
            response.body.data[0].should.have.property('updatedAt');
        });
    })

    after(async () => {
        await closeTestAgent();
    });

    afterEach(() => {
        if (!nock.isDone()) {
            throw new Error(`Not all nock interceptors were used: ${nock.pendingMocks()}`);
        }
    });
});
