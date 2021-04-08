import nock from 'nock';
import chai from 'chai';
import type request from 'superagent';

import {JWTPayload, OktaUser} from 'services/okta.interfaces';
import CacheService from 'services/cache.service';
import { createTokenForUser } from '../utils/helpers';
import { closeTestAgent, getTestAgent } from '../utils/test-server';
import { generateRandomTokenPayload, getMockOktaUser, mockGetUserById, mockOktaGetUserByEmail } from './okta.mocks';
import Should = Chai.Should;

const should: Should = chai.should();

let requester: ChaiHttp.Agent;

nock.disableNetConnect();
nock.enableNetConnect(process.env.HOST_IP);

describe('[OKTA] Token validations test suite', () => {

    before(async () => {
        if (process.env.NODE_ENV !== 'test') {
            throw Error(`Running the test suite with NODE_ENV ${process.env.NODE_ENV} may result in permanent data loss. Please use NODE_ENV=test.`);
        }

        requester = await getTestAgent();
    });

    it('Making a request with a JWT token that is outdated returns 401 with the correct error message', async () => {
        const user: OktaUser = getMockOktaUser();
        const tokenPayload: JWTPayload = generateRandomTokenPayload({
            id: 'fakeId',
            email: user.profile.email,
            role: user.profile.role,
            extraUserData: { apps: user.profile.apps },
            // Token age older than 1h to trigger validation in Okta
            iat: new Date('01-01-2000').getTime() / 1000,
        });
        const token: string = createTokenForUser(tokenPayload);

        mockOktaGetUserByEmail(user.profile);

        const response: request.Response = await requester
            .get(`/auth/user/me`)
            .set('Authorization', `Bearer ${token}`);

        response.status.should.equal(401);
        response.body.should.have.property('errors').and.be.an('array');
        response.body.errors[0].should.have.property('detail').and.equal(`Your token is outdated. Please use /auth/login to login and /auth/generate-token to generate a new token.`);
    });

    it('Making a request with a JWT token that is valid but has "apps" ordered in a different way should be valid', async () => {
        const user: OktaUser = getMockOktaUser({ apps: ['gfw', 'rw'] });
        const tokenPayload: JWTPayload = generateRandomTokenPayload({
            id: user.profile.legacyId,
            email: user.profile.email,
            role: user.profile.role,
            extraUserData: { apps: ['rw', 'gfw'] },
            // Token age older than 1h to trigger validation in Okta
            iat: new Date('01-01-2000').getTime() / 1000,
        });

        const token: string = createTokenForUser({ ...tokenPayload, extraUserData: { apps: ['gfw', 'rw'] } });

        mockOktaGetUserByEmail({
            legacyId: tokenPayload.id,
            email: tokenPayload.email,
            role: tokenPayload.role,
            apps: tokenPayload.extraUserData.apps,
        });

        mockGetUserById(user);

        const response: request.Response = await requester
            .get(`/auth/user/me`)
            .set('Authorization', `Bearer ${token}`);

        response.status.should.equal(200);
    });

    it('Should fetch user information from Okta and store it in cache if it does not exist there yet', async () => {
        const user: OktaUser = getMockOktaUser({ apps: ['gfw', 'rw'] });

        // Assert value does not exist in cache before
        const value: OktaUser = await CacheService.get(`okta-user-${user.profile.legacyId}`);
        should.not.exist(value);

        const tokenPayload: JWTPayload = generateRandomTokenPayload({
            id: user.profile.legacyId,
            email: user.profile.email,
            role: user.profile.role,
            extraUserData: { apps: ['rw', 'gfw'] },
            // Token age older than 1h to trigger validation in Okta
            iat: new Date('01-01-2000').getTime() / 1000,
        });

        const token: string = createTokenForUser({ ...tokenPayload, extraUserData: { apps: ['gfw', 'rw'] } });

        mockOktaGetUserByEmail({
            legacyId: tokenPayload.id,
            email: tokenPayload.email,
            role: tokenPayload.role,
            apps: tokenPayload.extraUserData.apps,
        });

        mockGetUserById(user);

        const response: request.Response = await requester
            .get(`/auth/user/me`)
            .set('Authorization', `Bearer ${token}`);

        response.status.should.equal(200);

        // Assert value exists in cache after
        const value2: OktaUser = await CacheService.get(`okta-user-${user.profile.legacyId}`);
        should.exist(value2);
    });

    it('Should not fetch information from Okta if it already exists in cache', async () => {
        const user: OktaUser = getMockOktaUser({ apps: ['gfw', 'rw'] });

        // Assert value does not exist in cache before
        const value: OktaUser = await CacheService.get(`okta-user-${user.profile.legacyId}`);
        should.not.exist(value);

        // Store it in cache
        await CacheService.set(`okta-user-${user.profile.legacyId}`, user);
        const value2: OktaUser = await CacheService.get(`okta-user-${user.profile.legacyId}`);
        should.exist(value2);

        const tokenPayload: JWTPayload = generateRandomTokenPayload({
            id: user.profile.legacyId,
            email: user.profile.email,
            role: user.profile.role,
            extraUserData: { apps: ['rw', 'gfw'] },
            // Token age older than 1h to trigger validation in Okta
            iat: new Date('01-01-2000').getTime() / 1000,
        });

        const token: string = createTokenForUser({ ...tokenPayload, extraUserData: { apps: ['gfw', 'rw'] } });

        mockGetUserById(user);

        const response: request.Response = await requester
            .get(`/auth/user/me`)
            .set('Authorization', `Bearer ${token}`);

        response.status.should.equal(200);
    });

    after(async () => {
        await closeTestAgent();
    });

    afterEach(async () => {
        if (!nock.isDone()) {
            throw new Error(`Not all nock interceptors were used: ${nock.pendingMocks()}`);
        }

        await CacheService.clear();
    });
});
