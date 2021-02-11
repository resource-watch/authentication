import nock from 'nock';
import chai from 'chai';
import ChaiHttp from 'chai-http';
import ChaiString from 'chai-string';

import UserModel from 'models/user.model';

import { closeTestAgent, getTestAgent } from '../utils/test-server';
import { createUserInDB } from '../utils/helpers';
import request from 'superagent';

chai.should();
chai.use(ChaiString);
chai.use(ChaiHttp);

let requester:ChaiHttp.Agent;

nock.disableNetConnect();
nock.enableNetConnect(process.env.HOST_IP);

describe('[OKTA] Twitter migrate endpoint tests - Finish page', () => {

    before(async () => {
        if (process.env.NODE_ENV !== 'test') {
            throw Error(`Running the test suite with NODE_ENV ${process.env.NODE_ENV} may result in permanent data loss. Please use NODE_ENV=test.`);
        }

        requester = await getTestAgent(true);

        await UserModel.deleteMany({}).exec();

        nock.cleanAll();
    });

    beforeEach(async () => {
        requester = await getTestAgent(true);
    });

    it('Visiting /auth/twitter/finished while not being logged in should redirect to the start page', async () => {
        const response: request.Response = await requester
            .get(`/auth/twitter/finished`)
            .redirects(0);

        response.status.should.equal(302);
        response.should.redirectTo('/auth/twitter/start');
    });

    it('Visiting /auth/twitter/finished after a successful migration should display the finished page (happy case)', async () => {
        await createUserInDB({
            email: 'john.doe@vizzuality.com',
            provider: 'twitter',
            providerId: '113994825016233013735'
        });

        nock('https://api.twitter.com')
            .get('/oauth/authenticate?oauth_token=OAUTH_TOKEN')
            .reply(200, 'hello world');

        nock('https://api.twitter.com', { encodedQueryParams: true })
            .post('/oauth/request_token')
            .reply(200, 'oauth_token=OAUTH_TOKEN&oauth_token_secret=OAUTH_TOKEN_SECRET&oauth_callback_confirmed=true');

        nock('https://api.twitter.com:443', { encodedQueryParams: true })
            .post('/oauth/access_token')
            .reply(200, 'oauth_token=OAUTH_TOKEN&oauth_token_secret=OAUTH_TOKEN_SECRET&user_id=281468859&screen_name=tiagojsag');

        nock('https://api.twitter.com:443', { encodedQueryParams: true })
            .get('/1.1/account/verify_credentials.json')
            .query({ include_email: 'true' })
            .reply(200, {
                id: 113994825016233013735,
                id_str: '113994825016233013735',
                name: 'John Doe',
                screen_name: 'johndoe',
                location: 'Mars',
                description: 'Web developer at @vizzuality',
                url: null,
                entities: { description: { urls: [] } },
                protected: false,
                followers_count: 213,
                friends_count: 507,
                listed_count: 13,
                created_at: 'Wed Apr 13 10:33:09 +0000 2011',
                favourites_count: 626,
                utc_offset: null,
                time_zone: null,
                geo_enabled: false,
                verified: false,
                statuses_count: 1497,
                lang: null,
                contributors_enabled: false,
                is_translator: false,
                is_translation_enabled: false,
                profile_background_color: 'EBEBEB',
                profile_background_image_url: 'http://images.pexels.com/photos/20787/pexels-photo.jpg?auto=compress&cs=tinysrgb&h=750&w=1260',
                profile_background_image_url_https: 'https://images.pexels.com/photos/20787/pexels-photo.jpg?auto=compress&cs=tinysrgb&h=750&w=1260',
                profile_background_tile: false,
                profile_image_url: 'http://images.pexels.com/photos/20787/pexels-photo.jpg?auto=compress&cs=tinysrgb&h=750&w=1260',
                profile_image_url_https: 'https://images.pexels.com/photos/20787/pexels-photo.jpg?auto=compress&cs=tinysrgb&h=750&w=1260',
                profile_link_color: '990000',
                profile_sidebar_border_color: 'DFDFDF',
                profile_sidebar_fill_color: 'F3F3F3',
                profile_text_color: '333333',
                profile_use_background_image: true,
                has_extended_profile: false,
                default_profile: false,
                default_profile_image: false,
                following: false,
                follow_request_sent: false,
                notifications: false,
                translator_type: 'none',
                suspended: false,
                needs_phone_verification: false,
                email: 'john.doe@vizzuality.com'
            });

        // start session, with oauth data
        await requester
            .get(`/auth/twitter/auth`);

        // twitter callback, which sets the user data to sessions
        await requester
            .get(`/auth/twitter/callback?oauth_token=OAUTH_TOKEN&oauth_verifier=OAUTH_TOKEN_VERIFIER`);

        // migrate the user
        await requester
            .post(`/auth/twitter/migrate`)
            .send({
                email: 'john.doe@vizzuality.com',
                password: 'bar',
                repeatPassword: 'bar'
            });

        const response: request.Response = await requester
            .get(`/auth/twitter/finished`);

        response.text.should.include(`Migration finished`);
        response.text.should.include(`Your account has been migrated`);
    });

    afterEach(() => {
        if (!nock.isDone()) {
            throw new Error(`Not all nock interceptors were used: ${nock.pendingMocks()}`);
        }

        UserModel.deleteMany({})
            .exec();

        closeTestAgent();
    });
});
