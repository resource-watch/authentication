import chai from 'chai';
import nock from 'nock';
import type request from 'superagent';

import { IUser } from 'models/user.model';
import { OktaUser } from 'services/okta.interfaces';
import { closeTestAgent, getTestAgent } from '../utils/test-server';
import { ensureHasOktaPaginationElements, ensureHasPaginationElements } from '../utils/helpers';
import { getMockOktaUser, mockOktaListUsers, mockValidJWT } from './okta.mocks';

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
        const response: request.Response = await requester
            .get(`/auth/user`)
            .set('Content-Type', 'application/json')
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
        const response: request.Response = await requester
            .get(`/auth/user?page[size]=2`)
            .set('Content-Type', 'application/json')
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

        const after: string = '00ua8rmi6MKcs91GB5d6';

        // Initial request that returns after cursor, used in the second request
        mockOktaListUsers(
            { limit: 2, search: '((profile.apps eq "rw"))' },
            [userOne, userTwo],
            200,
            { 'link': `<https://dev-42303109.okta.com/api/v1/users?limit=2&search=%28%28profile.apps+eq+%22gfw%22%29+or+%28profile.apps+eq+%22rw%22%29%29>; rel="self", <https://dev-42303109.okta.com/api/v1/users?after=${after}&limit=2&search=%28%28profile.apps+eq+%22gfw%22%29+or+%28profile.apps+eq+%22rw%22%29%29>; rel="next"` }
        );

        mockOktaListUsers({ limit: 2, search: '((profile.apps eq "rw"))', after }, [userThree, userFour]);

        const token: string = mockValidJWT({ role: 'ADMIN' });
        const response: request.Response = await requester
            .get(`/auth/user?page[size]=2&page[number]=2`)
            .set('Content-Type', 'application/json')
            .set('Authorization', `Bearer ${token}`);

        response.status.should.equal(200);
        response.body.should.have.property('data').and.be.an('array').and.have.length(2);
        response.body.data.map((u: IUser) => u.id).should.deep.equal([userThree.profile.legacyId, userFour.profile.legacyId]);
        ensureHasPaginationElements(response);
    });

    it('With strategy="cursor", fetching the first page returns the user list and the correct pagination links', async () => {
        const userOne: OktaUser = getMockOktaUser({});
        const userTwo: OktaUser = getMockOktaUser({});

        const cursor: string = '00ua8rmi6MKcs91GB5d6';

        mockOktaListUsers(
            { limit: 10, search: '((profile.apps eq "rw"))' },
            [userOne, userTwo],
            200,
            { 'link': `<https://dev-42303109.okta.com/api/v1/users?limit=2&search=%28%28profile.apps+eq+%22gfw%22%29+or+%28profile.apps+eq+%22rw%22%29%29>; rel="self", <https://dev-42303109.okta.com/api/v1/users?after=${cursor}&limit=2&search=%28%28profile.apps+eq+%22gfw%22%29+or+%28profile.apps+eq+%22rw%22%29%29>; rel="next"` }
        );

        const token: string = mockValidJWT({ role: 'ADMIN' });
        const response: request.Response = await requester
            .get(`/auth/user?strategy=cursor`)
            .set('Content-Type', 'application/json')
            .set('Authorization', `Bearer ${token}`);

        response.status.should.equal(200);
        response.body.should.have.property('data').and.be.an('array').and.have.length(2);
        response.body.data.map((u: IUser) => u.id).should.deep.equal([userOne.profile.legacyId, userTwo.profile.legacyId]);
        ensureHasOktaPaginationElements(response, 10, cursor);
    });

    it('With strategy="cursor", providing the cursor in the "after" query parameter fetches the page after the cursor provided, returning the user list and the correct pagination links', async () => {
        const userOne: OktaUser = getMockOktaUser({});
        const userTwo: OktaUser = getMockOktaUser({});

        const cursor: string = '00ua8rmi6MKcs91GB5d6';
        const newCursor: string = '00ua8rmi6MKcs91GB5d6';

        mockOktaListUsers(
            { limit: 10, search: '((profile.apps eq "rw"))', after: cursor },
            [userOne, userTwo],
            200,
            { 'link': `<https://dev-42303109.okta.com/api/v1/users?limit=2&search=%28%28profile.apps+eq+%22gfw%22%29+or+%28profile.apps+eq+%22rw%22%29%29>; rel="self", <https://dev-42303109.okta.com/api/v1/users?after=${newCursor}&limit=2&search=%28%28profile.apps+eq+%22gfw%22%29+or+%28profile.apps+eq+%22rw%22%29%29>; rel="next"` }
        );

        const token: string = mockValidJWT({ role: 'ADMIN' });
        const response: request.Response = await requester
            .get(`/auth/user?strategy=cursor&page[after]=${cursor}`)
            .set('Content-Type', 'application/json')
            .set('Authorization', `Bearer ${token}`);

        response.status.should.equal(200);
        response.body.should.have.property('data').and.be.an('array').and.have.length(2);
        response.body.data.map((u: IUser) => u.id).should.deep.equal([userOne.profile.legacyId, userTwo.profile.legacyId]);
        ensureHasOktaPaginationElements(response, 10, newCursor);
    });

    it('With strategy="cursor", providing the cursor in the "before" query parameter fetches the page before the cursor provided, returning the user list and the correct pagination links', async () => {
        const userOne: OktaUser = getMockOktaUser({});
        const userTwo: OktaUser = getMockOktaUser({});

        const cursor: string = '00ua8rmi6MKcs91GB5d6';
        const newCursor: string = '00ua8rmi6MKcs91GB5d6';

        mockOktaListUsers(
            { limit: 10, search: '((profile.apps eq "rw"))', before: cursor },
            [userOne, userTwo],
            200,
            { 'link': `<https://dev-42303109.okta.com/api/v1/users?limit=2&search=%28%28profile.apps+eq+%22gfw%22%29+or+%28profile.apps+eq+%22rw%22%29%29>; rel="self", <https://dev-42303109.okta.com/api/v1/users?after=${newCursor}&limit=2&search=%28%28profile.apps+eq+%22gfw%22%29+or+%28profile.apps+eq+%22rw%22%29%29>; rel="next"` }
        );

        const token: string = mockValidJWT({ role: 'ADMIN' });
        const response: request.Response = await requester
            .get(`/auth/user?strategy=cursor&page[before]=${cursor}`)
            .set('Content-Type', 'application/json')
            .set('Authorization', `Bearer ${token}`);

        response.status.should.equal(200);
        response.body.should.have.property('data').and.be.an('array').and.have.length(2);
        response.body.data.map((u: IUser) => u.id).should.deep.equal([userOne.profile.legacyId, userTwo.profile.legacyId]);
        ensureHasOktaPaginationElements(response, 10, newCursor);
    });

    after(async () => {
        await closeTestAgent();
    });

    afterEach(async () => {
        if (!nock.isDone()) {
            throw new Error(`Not all nock interceptors were used: ${nock.pendingMocks()}`);
        }
    });
});
