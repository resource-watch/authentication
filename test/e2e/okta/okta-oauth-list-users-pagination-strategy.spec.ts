import chai from 'chai';
import nock from 'nock';
import type request from 'superagent';

import { IUser, OktaUser } from 'services/okta.interfaces';
import { closeTestAgent, getTestAgent } from '../utils/test-server';
import {
    createApplication,
    createOrganization,
    ensureHasOktaPaginationElements,
    ensureHasPaginationElements
} from '../utils/helpers';
import { getMockOktaUser, mockOktaListUsers, mockValidJWT } from './okta.mocks';
import { IApplication } from "models/application";
import ApplicationUserModel from "models/application-user";
import { IOrganization } from "models/organization";
import OrganizationUserModel from "models/organization-user";
import { mockValidateRequestWithApiKeyAndUserToken } from "../utils/mocks";

chai.should();

let requester: ChaiHttp.Agent;

nock.disableNetConnect();
nock.enableNetConnect(process.env.HOST_IP);

describe('[OKTA] Pagination strategy test suite for list user endpoints', () => {

    before(async () => {
        if (process.env.NODE_ENV !== 'test') {
            throw Error(`Running the test suite with NODE_ENV ${process.env.NODE_ENV} may result in permanent data loss. Please use NODE_ENV=test.`);
        }

        requester = await getTestAgent();
    });

    it('Getting the users list with no query parameter provided uses strategy="offset" by default', async () => {
        const user: OktaUser = getMockOktaUser({});
        mockOktaListUsers({ limit: 10, search: '((profile.apps eq "rw"))' }, [user]);

        const token: string = mockValidJWT({ role: 'ADMIN' });
        mockValidateRequestWithApiKeyAndUserToken({ token });

        const response: request.Response = await requester
            .get(`/auth/user`)
            .set('Content-Type', 'application/json')
            .set('x-api-key', 'api-key-test')
            .set('Authorization', `Bearer ${token}`);

        response.status.should.equal(200);
        response.body.should.have.property('data').and.be.an('array').and.have.length(1);
        response.body.data[0].should.have.property('id').and.equal(user.profile.legacyId);
        response.body.data[0].should.have.property('email').and.equal(user.profile.email);
        response.body.data[0].should.have.property('role').and.equal(user.profile.role);
        ensureHasPaginationElements(response);
    });

    it('With strategy="offset", changing the page[size] query parameter works as expected', async () => {
        const userOne: OktaUser = getMockOktaUser({});
        const userTwo: OktaUser = getMockOktaUser({});

        mockOktaListUsers({ limit: 2, search: '((profile.apps eq "rw"))' }, [userOne, userTwo]);

        const token: string = mockValidJWT({ role: 'ADMIN' });
        mockValidateRequestWithApiKeyAndUserToken({ token });
        const response: request.Response = await requester
            .get(`/auth/user?page[size]=2`)
            .set('Content-Type', 'application/json')
            .set('x-api-key', 'api-key-test')
            .set('Authorization', `Bearer ${token}`);

        response.status.should.equal(200);
        response.body.should.have.property('data').and.be.an('array').and.have.length(2);
        response.body.data.map((u: IUser) => u.id).should.deep.equal([userOne.profile.legacyId, userTwo.profile.legacyId]);
        ensureHasPaginationElements(response);
    });

    it('With strategy="offset", changing the page[number] query parameter makes the expected number of requests to Okta\'s API to obtain the correct page', async () => {
        const userOne: OktaUser = getMockOktaUser({});
        const userTwo: OktaUser = getMockOktaUser({});
        const userThree: OktaUser = getMockOktaUser({});
        const userFour: OktaUser = getMockOktaUser({});

        const cursor1: string = 'cursor1';
        const cursor2: string = 'cursor2';

        // Initial request that returns after cursor, used in the second request
        mockOktaListUsers(
            { limit: 2, search: '((profile.apps eq "rw"))' },
            [userOne, userTwo],
            200,
            { link: `https://dev-42303109.okta.com/api/v1/users?after=${cursor1}&limit=2&search=%28%28profile.apps+eq+%22gfw%22%29+or+%28profile.apps+eq+%22rw%22%29%29; rel="self", https://dev-42303109.okta.com/api/v1/users?after=${cursor2}&limit=2&search=%28%28profile.apps+eq+%22gfw%22%29+or+%28profile.apps+eq+%22rw%22%29%29; rel="next"` }
        );

        mockOktaListUsers(
            { limit: 2, search: '((profile.apps eq "rw"))', after: cursor2 },
            [userThree, userFour]
        );

        const token: string = mockValidJWT({ role: 'ADMIN' });
        mockValidateRequestWithApiKeyAndUserToken({ token });
        const response: request.Response = await requester
            .get(`/auth/user?page[size]=2&page[number]=2`)
            .set('Content-Type', 'application/json')
            .set('x-api-key', 'api-key-test')
            .set('Authorization', `Bearer ${token}`);

        response.status.should.equal(200);
        response.body.should.have.property('data').and.be.an('array').and.have.length(2);
        response.body.data.map((u: IUser) => u.id).should.deep.equal([userThree.profile.legacyId, userFour.profile.legacyId]);
        ensureHasPaginationElements(response);
    });

    it('With strategy="cursor", fetching the first page returns the user list and the correct pagination links', async () => {
        const userOne: OktaUser = getMockOktaUser({});
        const userTwo: OktaUser = getMockOktaUser({});

        const cursor1: string = 'cursor1';
        const cursor2: string = 'cursor2';

        mockOktaListUsers(
            { limit: 10, search: '((profile.apps eq "rw"))' },
            [userOne, userTwo],
            200,
            { link: `https://dev-42303109.okta.com/api/v1/users?after=${cursor1}&limit=2&search=%28%28profile.apps+eq+%22gfw%22%29+or+%28profile.apps+eq+%22rw%22%29%29; rel="self", https://dev-42303109.okta.com/api/v1/users?after=${cursor2}&limit=2&search=%28%28profile.apps+eq+%22gfw%22%29+or+%28profile.apps+eq+%22rw%22%29%29; rel="next"` }
        );

        const token: string = mockValidJWT({ role: 'ADMIN' });
        mockValidateRequestWithApiKeyAndUserToken({ token });
        const response: request.Response = await requester
            .get(`/auth/user?strategy=cursor`)
            .set('Content-Type', 'application/json')
            .set('x-api-key', 'api-key-test')
            .set('Authorization', `Bearer ${token}`);

        response.status.should.equal(200);
        response.body.should.have.property('data').and.be.an('array').and.have.length(2);
        response.body.data.map((u: IUser) => u.id).should.deep.equal([userOne.profile.legacyId, userTwo.profile.legacyId]);
        ensureHasOktaPaginationElements(response, 10, cursor2);
    });

    it('With strategy="cursor", providing the cursor in the "after" query parameter fetches the page after the cursor provided, returning the user list and the correct pagination links', async () => {
        const userOne: OktaUser = getMockOktaUser({});
        const userTwo: OktaUser = getMockOktaUser({});

        const cursor1: string = 'cursor1';
        const cursor2: string = 'cursor2';

        mockOktaListUsers(
            { limit: 10, search: '((profile.apps eq "rw"))', after: cursor1 },
            [userOne, userTwo],
            200,
            { link: `https://dev-42303109.okta.com/api/v1/users?cursor=${cursor1}&limit=2&search=%28%28profile.apps+eq+%22gfw%22%29+or+%28profile.apps+eq+%22rw%22%29%29; rel="self", https://dev-42303109.okta.com/api/v1/users?after=${cursor2}&limit=2&search=%28%28profile.apps+eq+%22gfw%22%29+or+%28profile.apps+eq+%22rw%22%29%29; rel="next"` }
        );

        const token: string = mockValidJWT({ role: 'ADMIN' });
        mockValidateRequestWithApiKeyAndUserToken({ token });
        const response: request.Response = await requester
            .get(`/auth/user?strategy=cursor&page[after]=${cursor1}`)
            .set('Content-Type', 'application/json')
            .set('x-api-key', 'api-key-test')
            .set('Authorization', `Bearer ${token}`);

        response.status.should.equal(200);
        response.body.should.have.property('data').and.be.an('array').and.have.length(2);
        response.body.data.map((u: IUser) => u.id).should.deep.equal([userOne.profile.legacyId, userTwo.profile.legacyId]);
        ensureHasOktaPaginationElements(response, 10, cursor2);
    });

    it('With strategy="cursor", providing the cursor in the "before" query parameter fetches the page before the cursor provided, returning the user list and the correct pagination links', async () => {
        const userOne: OktaUser = getMockOktaUser({});
        const userTwo: OktaUser = getMockOktaUser({});

        const cursor1: string = 'cursor1';

        mockOktaListUsers(
            { limit: 10, search: '((profile.apps eq "rw"))', before: cursor1 },
            [userOne, userTwo],
            200,
            { link: `https://dev-42303109.okta.com/api/v1/users?before=${cursor1}&limit=2&search=%28%28profile.apps+eq+%22gfw%22%29+or+%28profile.apps+eq+%22rw%22%29%29; rel="self", https://dev-42303109.okta.com/api/v1/users?after=${cursor1}&limit=2&search=%28%28profile.apps+eq+%22gfw%22%29+or+%28profile.apps+eq+%22rw%22%29%29; rel="next"` }
        );

        const token: string = mockValidJWT({ role: 'ADMIN' });
        mockValidateRequestWithApiKeyAndUserToken({ token });
        const response: request.Response = await requester
            .get(`/auth/user?strategy=cursor&page[before]=${cursor1}`)
            .set('Content-Type', 'application/json')
            .set('x-api-key', 'api-key-test')
            .set('Authorization', `Bearer ${token}`);

        response.status.should.equal(200);
        response.body.should.have.property('data').and.be.an('array').and.have.length(2);
        response.body.data.map((u: IUser) => u.id).should.deep.equal([userOne.profile.legacyId, userTwo.profile.legacyId]);
        ensureHasOktaPaginationElements(response, 10, cursor1);
    });

    it('Get users with x-rw-domain header should be successful and use that header on the links on the response', async () => {
        const userOne: OktaUser = getMockOktaUser({});
        const userTwo: OktaUser = getMockOktaUser({});
        mockOktaListUsers({ limit: 10, search: '((profile.apps eq "rw"))' }, [userOne, userTwo]);

        const token: string = mockValidJWT({ role: 'ADMIN' });
        mockValidateRequestWithApiKeyAndUserToken({ token });
        const response: request.Response = await requester
            .get(`/auth/user`)
            .set('Content-Type', 'application/json')
            .set('Authorization', `Bearer ${token}`)
            .set('x-api-key', 'api-key-test')
            .set('x-rw-domain', `potato.com`);

        response.status.should.equal(200);
        response.body.should.have.property('data').and.be.an('array');
        response.body.should.have.property('links').and.be.an('object');
        response.body.links.should.have.property('self').and.equal('http://potato.com/auth/user?page[number]=1&page[size]=10');
        response.body.links.should.have.property('prev').and.equal('http://potato.com/auth/user?page[number]=1&page[size]=10');
        response.body.links.should.have.property('next').and.equal('http://potato.com/auth/user?page[number]=2&page[size]=10');
        response.body.links.should.have.property('first').and.equal('http://potato.com/auth/user?page[number]=1&page[size]=10');
    });

    it('Get users with x-rw-domain and referer headers should be successful and use the x-rw-domain header on the links on the response', async () => {
        const userOne: OktaUser = getMockOktaUser({});
        const userTwo: OktaUser = getMockOktaUser({});
        mockOktaListUsers({ limit: 10, search: '((profile.apps eq "rw"))' }, [userOne, userTwo]);

        const token: string = mockValidJWT({ role: 'ADMIN' });
        mockValidateRequestWithApiKeyAndUserToken({ token });
        const response: request.Response = await requester
            .get(`/auth/user`)
            .set('Content-Type', 'application/json')
            .set('Authorization', `Bearer ${token}`)
            .set('x-rw-domain', `potato.com`)
            .set('x-api-key', 'api-key-test')
            .set('referer', `https://tomato.com/get-me-all-the-data`);

        response.status.should.equal(200);
        response.body.should.have.property('data').and.be.an('array');
        response.body.should.have.property('links').and.be.an('object');
        response.body.links.should.have.property('self').and.equal('http://potato.com/auth/user?page[number]=1&page[size]=10');
        response.body.links.should.have.property('prev').and.equal('http://potato.com/auth/user?page[number]=1&page[size]=10');
        response.body.links.should.have.property('next').and.equal('http://potato.com/auth/user?page[number]=2&page[size]=10');
        response.body.links.should.have.property('first').and.equal('http://potato.com/auth/user?page[number]=1&page[size]=10');
    });

    describe('with associated applications', () => {
        it('Getting an user with associated applications should be successful and get the association', async () => {
            const user: OktaUser = getMockOktaUser();
            const token: string = mockValidJWT({ role: 'ADMIN' });
            mockValidateRequestWithApiKeyAndUserToken({ token });

            const testApplication: IApplication = await createApplication();

            await new ApplicationUserModel({
                userId: user.profile.legacyId,
                application: testApplication
            }).save();

            mockOktaListUsers({ limit: 10, search: `((profile.apps eq "rw"))` }, [user]);

            const response: request.Response = await requester
                .get(`/auth/user`)
                .set('Content-Type', 'application/json')
                .set('x-api-key', 'api-key-test')
                .set('Authorization', `Bearer ${token}`);

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
            const token: string = mockValidJWT({ role: 'ADMIN' });
            mockValidateRequestWithApiKeyAndUserToken({ token });

            const testOrganization: IOrganization = await createOrganization();

            await new OrganizationUserModel({
                userId: user.profile.legacyId,
                organization: testOrganization,
                role: 'ORG_ADMIN'
            }).save();

            mockOktaListUsers({ limit: 10, search: `((profile.apps eq "rw"))` }, [user]);

            const response: request.Response = await requester
                .get(`/auth/user`)
                .set('Content-Type', 'application/json')
                .set('x-api-key', 'api-key-test')
                .set('Authorization', `Bearer ${token}`);

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

    afterEach(async () => {
        if (!nock.isDone()) {
            throw new Error(`Not all nock interceptors were used: ${nock.pendingMocks()}`);
        }
    });
});
