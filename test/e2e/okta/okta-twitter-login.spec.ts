import nock from 'nock';
import chai from 'chai';
import ChaiHttp from 'chai-http';
import ChaiString from 'chai-string';

import Settings from 'services/settings.service';

import { closeTestAgent, getTestAgent } from '../utils/test-server';
import request from 'superagent';
import {OktaOAuthProvider, OktaUser} from 'services/okta.interfaces';
import {getMockOktaUser, mockOktaListUsers} from './okta.mocks';

chai.should();
chai.use(ChaiString);
chai.use(ChaiHttp);

let requester:ChaiHttp.Agent;

nock.disableNetConnect();
nock.enableNetConnect(process.env.HOST_IP);

describe('[OKTA] Twitter migrate endpoint tests - Login and migration start', () => {

    before(async () => {
        if (process.env.NODE_ENV !== 'test') {
            throw Error(`Running the test suite with NODE_ENV ${process.env.NODE_ENV} may result in permanent data loss. Please use NODE_ENV=test.`);
        }
    });

    beforeEach(async () => {
        requester = await getTestAgent(true);
    });

    it('Visiting /auth/twitter while not being logged in should redirect to the start page', async () => {
        const response: request.Response = await requester.get(`/auth/twitter`).redirects(0);
        response.status.should.equal(302);
        response.should.redirectTo(`${Settings.getSettings().publicUrl}/auth/twitter/start`);
    });

    it('Visiting /auth/twitter/callback while not being logged in should redirect to the twitter login page', async () => {
        nock('https://api.twitter.com')
            .post('/oauth/request_token')
            .reply(200, 'oauth_token=OAUTH_TOKEN&oauth_token_secret=OAUTH_TOKEN_SECRET&oauth_callback_confirmed=true');

        const response: request.Response = await requester
            .get(`/auth/twitter/callback`)
            .redirects(0);

        response.status.should.equal(302);
        response.should.redirectTo('https://api.twitter.com/oauth/authenticate?oauth_token=OAUTH_TOKEN');
    });

    it('Visiting /auth/twitter/callback with the correct oauth data for a user that does not exist locally should return an error message', async () => {
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

        // Mock non-existing user
        mockOktaListUsers({
            limit: 1,
            search: `(profile.provider eq "${OktaOAuthProvider.TWITTER}") and (profile.providerId eq "113994825016233013735")`
        }, []);

        await requester.get(`/auth/twitter/auth`);

        const response: request.Response = await requester
            .get(`/auth/twitter/callback?oauth_token=OAUTH_TOKEN&oauth_verifier=OAUTH_TOKEN_VERIFIER`)
            .redirects(0);

        response.status.should.equal(302);
        response.should.redirectTo('/auth/twitter/fail');
    });

    it('Visiting /auth/twitter/callback with the correct oauth data for a user that does exists locally should redirect to the migrate page', async () => {
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

        const providerId: string = '113994825016233013735';
        const user: OktaUser = getMockOktaUser({
            email: 'john.doe@vizzuality.com',
            displayName: 'John Doe',
            provider: OktaOAuthProvider.TWITTER,
            providerId,
        });

        mockOktaListUsers({
            limit: 1,
            search: `(profile.provider eq "${OktaOAuthProvider.TWITTER}") and (profile.providerId eq "${providerId}")`
        }, [user]);

        await requester.get(`/auth/twitter/auth`);

        const response: request.Response = await requester
            .get(`/auth/twitter/callback?oauth_token=OAUTH_TOKEN&oauth_verifier=OAUTH_TOKEN_VERIFIER`)
            .redirects(0);

        response.should.redirect;
        response.should.redirectTo(/\/auth\/twitter\/migrate$/);
    });

    afterEach(async () => {
        if (!nock.isDone()) {
            throw new Error(`Not all nock interceptors were used: ${nock.pendingMocks()}`);
        }

        await closeTestAgent();
    });
});
