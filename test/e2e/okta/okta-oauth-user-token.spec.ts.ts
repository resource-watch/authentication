import nock from 'nock';
import chai from 'chai';
import type request from 'superagent';
import sinon, { SinonSandbox } from 'sinon';

import {JWTPayload, OktaUser} from 'services/okta.interfaces';
import { createTokenForUser, stubConfigValue } from '../utils/helpers';
import { closeTestAgent, getTestAgent } from '../utils/test-server';
import { generateRandomTokenPayload, getMockOktaUser, mockGetUserById, mockOktaGetUserByEmail } from './okta.mocks';

chai.should();

let requester: ChaiHttp.Agent;
let sandbox: SinonSandbox;

nock.disableNetConnect();
nock.enableNetConnect(process.env.HOST_IP);

describe('[OKTA] Token validations test suite', () => {

    before(async () => {
        if (process.env.NODE_ENV !== 'test') {
            throw Error(`Running the test suite with NODE_ENV ${process.env.NODE_ENV} may result in permanent data loss. Please use NODE_ENV=test.`);
        }

        sandbox = sinon.createSandbox();
        stubConfigValue(sandbox, { 'authProvider': 'OKTA' });

        requester = await getTestAgent();
    });

    it('Making a request with a JWT token that is outdated returns 401 with the correct error message', async () => {
        const user: OktaUser = getMockOktaUser();
        const tokenPayload: JWTPayload = generateRandomTokenPayload({
            id: 'fakeId',
            email: user.profile.email,
            role: user.profile.role,
            extraUserData: { apps: user.profile.apps }
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
            extraUserData: { apps: ['rw', 'gfw'] }
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

    after(async () => {
        sandbox.restore();
        await closeTestAgent();
    });

    afterEach(() => {
        if (!nock.isDone()) {
            throw new Error(`Not all nock interceptors were used: ${nock.pendingMocks()}`);
        }
    });
});
