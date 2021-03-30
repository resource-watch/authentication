import nock from 'nock';
import chai from 'chai';
import type request from 'superagent';

import { OktaUser } from 'services/okta.interfaces';
import { closeTestAgent, getTestAgent } from '../utils/test-server';
import {getMockOktaUser, mockGetUserById, mockOktaUpdateUser, mockValidJWT} from './okta.mocks';

chai.should();

let requester: ChaiHttp.Agent;

nock.disableNetConnect();
nock.enableNetConnect(process.env.HOST_IP);

describe('[OKTA] Auth endpoints tests - Update user', () => {

    before(async () => {
        if (process.env.NODE_ENV !== 'test') {
            throw Error(`Running the test suite with NODE_ENV ${process.env.NODE_ENV} may result in permanent data loss. Please use NODE_ENV=test.`);
        }

        requester = await getTestAgent();
    });

    it('Updating my profile while not logged in should return a 401', async () => {
        const response: request.Response = await requester
            .patch(`/auth/user/me`)
            .set('Content-Type', 'application/json');

        response.status.should.equal(401);
        response.body.should.have.property('errors').and.be.an('array');
        response.body.errors[0].status.should.equal(401);
        response.body.errors[0].detail.should.equal('Not authenticated');
    });

    it('Updating my profile while logged in as the user should return a 200 (no actual data changes)', async () => {
        const user: OktaUser = getMockOktaUser();
        const token: string = mockValidJWT({
            id: user.profile.legacyId,
            email: user.profile.email,
            role: user.profile.role,
            extraUserData: { apps: user.profile.apps },
        });

        mockGetUserById(user);
        mockOktaUpdateUser(user, {});

        const response: request.Response = await requester
            .patch(`/auth/user/me`)
            .set('Content-Type', 'application/json')
            .set('Authorization', `Bearer ${token}`);

        response.status.should.equal(200);
        response.body.data.should.have.property('id').and.equal(user.profile.legacyId);
        response.body.data.should.have.property('email').and.equal(user.profile.email);
        response.body.data.should.have.property('name').and.equal(user.profile.displayName);
        response.body.data.should.have.property('photo').and.equal(user.profile.photo);
        response.body.data.should.have.property('role').and.equal(user.profile.role);
        response.body.data.should.have.property('extraUserData').and.eql({ apps: user.profile.apps });
    });

    it('Updating my profile while logged in as the user with role USER should return a 200 with updated name and photo', async () => {
        const user: OktaUser = getMockOktaUser();
        const token: string = mockValidJWT({
            id: user.profile.legacyId,
            email: user.profile.email,
            role: user.profile.role,
            extraUserData: { apps: user.profile.apps },
        });

        mockGetUserById(user);
        mockOktaUpdateUser(user, {
            displayName: 'changed name',
            photo: 'http://www.changed-photo.com',
        });

        const response: request.Response = await requester
            .patch(`/auth/user/me`)
            .set('Content-Type', 'application/json')
            .set('Authorization', `Bearer ${token}`)
            .send({
                email: 'changed-email@example.com',
                password: 'changedPassword',
                salt: 'changedSalt',
                extraUserData: {
                    apps: ['changed-apps'],
                    foo: 'bar'
                },
                _id: 'changed-id',
                userToken: 'changedToken',
                createdAt: '2000-01-01T00:00:00.000Z',
                updatedAt: '2000-01-01T00:00:00.000Z',
                role: 'ADMIN',
                provider: 'changedProvider',
                name: 'changed name',
                photo: 'http://www.changed-photo.com'
            });

        response.status.should.equal(200);
        response.body.data.should.have.property('name').and.equal('changed name');
        response.body.data.should.have.property('photo').and.equal('http://www.changed-photo.com');
        response.body.data.should.have.property('id').and.equal(user.profile.legacyId);
        response.body.data.should.have.property('email').and.equal(user.profile.email);
        response.body.data.should.have.property('role').and.equal(user.profile.role);
        response.body.data.should.have.property('extraUserData').and.deep.eql({ apps: user.profile.apps });
        response.body.data.should.have.property('createdAt');
        response.body.data.should.have.property('updatedAt');
    });

    it('Updating my profile while logged in as the user with role ADMIN should return a 200 with updated name, photo, role and apps', async () => {
        const user: OktaUser = getMockOktaUser({ role: 'ADMIN' });
        const token: string = mockValidJWT({
            id: user.profile.legacyId,
            email: user.profile.email,
            role: user.profile.role,
            extraUserData: { apps: user.profile.apps },
        });

        mockGetUserById(user);
        mockOktaUpdateUser(user, {
            displayName: 'changed name',
            photo: 'http://www.changed-photo.com',
            role: 'MANAGER',
            apps: ['changed-apps'],
        });

        const response: request.Response = await requester
            .patch(`/auth/user/me`)
            .set('Content-Type', 'application/json')
            .set('Authorization', `Bearer ${token}`)
            .send({
                email: 'changed-email@example.com',
                password: 'changedPassword',
                salt: 'changedSalt',
                extraUserData: {
                    apps: ['changed-apps'],
                    foo: 'bar'
                },
                _id: 'changed-id',
                userToken: 'changedToken',
                createdAt: '2000-01-01T00:00:00.000Z',
                updatedAt: '2000-01-01T00:00:00.000Z',
                role: 'MANAGER',
                provider: 'changedProvider',
                name: 'changed name',
                photo: 'http://www.changed-photo.com'
            });

        response.status.should.equal(200);
        response.body.data.should.have.property('name').and.equal('changed name');
        response.body.data.should.have.property('photo').and.equal('http://www.changed-photo.com');
        response.body.data.should.have.property('extraUserData').and.be.an('object').and.deep.eql({ apps: ['changed-apps'] });
        response.body.data.should.have.property('role').and.equal('MANAGER');
        response.body.data.should.have.property('id').and.equal(user.profile.legacyId);
        response.body.data.should.have.property('email').and.equal(user.profile.email);
        response.body.data.should.have.property('createdAt');
        response.body.data.should.have.property('updatedAt');
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
