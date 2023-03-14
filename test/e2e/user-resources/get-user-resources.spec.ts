import nock from 'nock';
import type request from 'superagent';
import { closeTestAgent, getTestAgent } from '../utils/test-server';
import { getMockOktaUser, mockOktaListUsers, mockValidJWT } from "../okta/okta.mocks";
import { OktaUser } from "services/okta.interfaces";
import chai from "chai";

let requester: ChaiHttp.Agent;
chai.should();

nock.disableNetConnect();
nock.enableNetConnect(process.env.HOST_IP);

describe('GET user resources', () => {

    before(async () => {
        if (process.env.NODE_ENV !== 'test') {
            throw Error(`Running the test suite with NODE_ENV ${process.env.NODE_ENV} may result in permanent data loss. Please use NODE_ENV=test.`);
        }

        requester = await getTestAgent();
    });

    it('Get user resources without being logged in returns a 401', async () => {
        const userId: string = '41224d776a326fb40f000001';

        const response: request.Response = await requester
            .get(`/auth/user/${userId}/resources`);

        response.status.should.equal(401);
    });

    it('Get user resources while being logged in as a regular user returns a 403 error', async () => {
        const userId: string = '41224d776a326fb40f000001';

        const token: string = mockValidJWT();
        const response: request.Response = await requester
            .get(`/auth/user/${userId}/resources`)
            .set('Authorization', `Bearer ${token}`);

        response.status.should.equal(403);
        response.body.should.have.property('errors').and.be.an('array');
        response.body.errors[0].should.have.property('detail').and.equal(`Not authorized`);
    });

    it('Get user resources with id of a user that exists returns the requested user (happy case)', async () => {
        const token: string = mockValidJWT({ role: 'ADMIN' });
        const user: OktaUser = getMockOktaUser();
        mockOktaListUsers({ limit: 1, search: `(profile.legacyId eq "${user.profile.legacyId}")` }, [user]);

        nock(process.env.GATEWAY_URL)
            .get('/v1/dataset')
            .query({ userId: user.profile.legacyId, env: "all" })
            .reply(200, {
                data: [{
                    id: "2b793c7f-4470-4342-9989-cec1fb18f7cf",
                    type: "dataset",
                    attributes: {
                        name: "Subnational Political Boundaries",
                        slug: "Subnational-Political-Boundaries",
                        type: null,
                        subtitle: null,
                        application: ["rw"],
                        dataPath: null,
                        attributesPath: null,
                        connectorType: "rest",
                        provider: "cartodb",
                        userId: user.profile.legacyId,
                        connectorUrl: "https://carto.com/tables/gadm28_adm1/public",
                        sources: [],
                        tableName: "gadm28_adm1",
                        status: "pending",
                        published: true,
                        overwrite: false,
                        mainDateField: null,
                        env: "production",
                        geoInfo: false,
                        protected: false,
                        legend: {
                            date: [],
                            region: [],
                            country: [],
                            nested: [],
                            integer: [],
                            short: [],
                            byte: [],
                            double: [],
                            float: [],
                            half_float: [],
                            scaled_float: [],
                            boolean: [],
                            binary: [],
                            text: [],
                            keyword: []
                        },
                        clonedHost: {},
                        errorMessage: "",
                        taskId: null,
                        createdAt: "2023-01-16T16:01:08.253Z",
                        updatedAt: "2023-01-16T16:01:08.366Z",
                        dataLastUpdated: null,
                        widgetRelevantProps: [],
                        layerRelevantProps: []
                    }
                }],
                links: {
                    self: `${process.env.GATEWAY_URL}/v1/dataset?userId=${user.profile.legacyId}&page[number]=1&page[size]=10`,
                    first: `${process.env.GATEWAY_URL}/v1/dataset?userId=${user.profile.legacyId}&page[number]=1&page[size]=10`,
                    last: `${process.env.GATEWAY_URL}/v1/dataset?userId=${user.profile.legacyId}&page[number]=1&page[size]=10`,
                    prev: `${process.env.GATEWAY_URL}/v1/dataset?userId=${user.profile.legacyId}&page[number]=1&page[size]=10`,
                    next: `${process.env.GATEWAY_URL}/v1/dataset?userId=${user.profile.legacyId}&page[number]=1&page[size]=10`
                },
                meta: { "total-pages": 1, "total-items": 1, size: 10 }
            });

        nock(process.env.GATEWAY_URL)
            .get('/v1/layer')
            .query({ userId: user.profile.legacyId, env: "all" })
            .reply(200, {
                data: [{
                    id: "c86d30eb-158f-4cbc-aca5-27db7a9ab92c",
                    type: "layer",
                    attributes: {
                        name: "Water stress",
                        slug: "Water-stress_2",
                        dataset: "54445abd-27bc-4629-b460-da1dc18ac3ce",
                        description: "water stress",
                        application: ["gfw"],
                        iso: [],
                        userId: user.profile.legacyId,
                        default: false,
                        protected: false,
                        published: true,
                        env: "staging",
                        layerConfig: {},
                        legendConfig: {},
                        interactionConfig: {},
                        applicationConfig: {},
                        staticImageConfig: {},
                        createdAt: "2021-02-22T13:30:56.632Z",
                        updatedAt: "2021-02-22T13:30:56.632Z"
                    }
                }, {
                    id: "8635e148-45e6-492d-8396-cc2fe09c6205",
                    type: "layer",
                    attributes: {
                        name: "Water stress",
                        slug: "Water-stress_1",
                        dataset: "54445abd-27bc-4629-b460-da1dc18ac3ce",
                        description: "water stress",
                        application: ["gfw"],
                        iso: [],
                        userId: user.profile.legacyId,
                        default: false,
                        protected: false,
                        published: true,
                        env: "production",
                        layerConfig: {},
                        legendConfig: {},
                        interactionConfig: {},
                        applicationConfig: {},
                        staticImageConfig: {},
                        createdAt: "2021-02-22T13:30:38.742Z",
                        updatedAt: "2021-02-22T13:30:38.742Z"
                    }
                }],
                links: {
                    self: `${process.env.GATEWAY_URL}/v1/layer?userId=57ac9f9e29309063404573a2&env=all&page[number]=1&page[size]=10`,
                    first: `${process.env.GATEWAY_URL}/v1/layer?userId=57ac9f9e29309063404573a2&env=all&page[number]=1&page[size]=10`,
                    last: `${process.env.GATEWAY_URL}/v1/layer?userId=57ac9f9e29309063404573a2&env=all&page[number]=1&page[size]=10`,
                    prev: `${process.env.GATEWAY_URL}/v1/layer?userId=57ac9f9e29309063404573a2&env=all&page[number]=1&page[size]=10`,
                    next: `${process.env.GATEWAY_URL}/v1/layer?userId=57ac9f9e29309063404573a2&env=all&page[number]=1&page[size]=10`
                },
                meta: { "total-pages": 1, "total-items": 3, size: 10 }
            });


        nock(process.env.GATEWAY_URL)
            .get('/v1/widget')
            .query({ userId: user.profile.legacyId, env: "all" })
            .reply(200, {
                data: [{
                    id: "0bf764d6-9bb8-4565-bd11-4d729d0fd004", type: "widget", attributes: {
                        name: "Temperature lows in Porto Alegre",
                        dataset: "62520fd2-2dfb-4a13-840b-35ac88fc7aa4",
                        slug: "temperature-lows-in-porto-alegre",
                        userId: user.profile.legacyId,
                        description: "Annual historic and projected temperature minimums in degrees Celsius derived from the NEX-GDDP downscaled data for the RCP4.5 and RCP 8.5 scenarios. In addition to seasonal fluctuation, this graph shows a trend of increased annual temperature lows from 1950 to 2100 for Porto Alegre. The RCP4.5 scenario, which assumes stabilization shortly after 2100, shows an increased high of about 2°C. The RCP8.5 scenario, characterized by relatively high greenhouse gas emissions, projects an almost 5°C increase.",
                        source: "",
                        sourceUrl: null,
                        authors: "",
                        application: ["prep"],
                        verified: false,
                        default: true,
                        protected: false,
                        defaultEditableWidget: false,
                        published: true,
                        freeze: false,
                        env: "production",
                        queryUrl: "query/62520fd2-2dfb-4a13-840b-35ac88fc7aa4?sql=select * from index_62520fd22dfb4a13840b35ac88fc7aa4",
                        widgetConfig: {},
                        template: false,
                        layerId: null,
                        createdAt: "2016-09-06T09:15:39.774Z",
                        updatedAt: "2017-03-21T14:19:36.673Z"
                    }
                }],
                links: {
                    self: `${process.env.GATEWAY_URL}/v1/widget/?userId=57ac9f9e29309063404573a2&env=all&page[number]=1&page[size]=10`,
                    first: `${process.env.GATEWAY_URL}/v1/widget/?userId=57ac9f9e29309063404573a2&env=all&page[number]=1&page[size]=10`,
                    last: `${process.env.GATEWAY_URL}/v1/widget/?userId=57ac9f9e29309063404573a2&env=all&page[number]=1&page[size]=10`,
                    prev: `${process.env.GATEWAY_URL}/v1/widget/?userId=57ac9f9e29309063404573a2&env=all&page[number]=1&page[size]=10`,
                    next: `${process.env.GATEWAY_URL}/v1/widget/?userId=57ac9f9e29309063404573a2&env=all&page[number]=1&page[size]=10`
                },
                meta: { "total-pages": 1, "total-items": 5, size: 10 }
            });

        nock(process.env.GATEWAY_URL)
            .get(`/v2/user/${user.profile.legacyId}`)
            .reply(200, {
                data: {
                    type: "user",
                    id: user.profile.legacyId,
                    attributes: {
                        fullName: "tiago garcia",
                        createdAt: "2023-03-09T14:40:11.046Z",
                        applicationData: {
                            gfw: {
                                howDoYouUse: [],
                                primaryResponsibilities: [],
                                signUpForTesting: false,
                                profileComplete: false,
                                interests: [],
                                signUpToNewsletter: false,
                                topics: [],
                                areaOrRegionOfInterest: null
                            }
                        }
                    }
                }
            });

        nock(process.env.GATEWAY_URL)
            .get('/v1/collection')
            .query({
                userId: user.profile.legacyId,
                env: "all",
                application: "all"
            })
            .reply(200, {
                    data: [{
                        id: "61a0f149eb8ef6001a57851e",
                        type: "collection",
                        attributes: {
                            name: "TML",
                            ownerId: user.profile.legacyId,
                            application: "rw",
                            env: "production",
                            resources: [{ id: "db84dd39-54e1-4a70-a9fc-ae90809cefa3", type: "dataset" }]
                        }
                    }],
                    links: {
                        self: `${process.env.GATEWAY_URL}/v1/collection?userId=57ac9f9e29309063404573a2&env=all&application=all&page[number]=1&page[size]=9999999`,
                        first: `${process.env.GATEWAY_URL}/v1/collection?userId=57ac9f9e29309063404573a2&env=all&application=all&page[number]=1&page[size]=9999999`,
                        last: `${process.env.GATEWAY_URL}/v1/collection?userId=57ac9f9e29309063404573a2&env=all&application=all&page[number]=1&page[size]=9999999`,
                        prev: `${process.env.GATEWAY_URL}/v1/collection?userId=57ac9f9e29309063404573a2&env=all&application=all&page[number]=1&page[size]=9999999`,
                        next: `${process.env.GATEWAY_URL}/v1/collection?userId=57ac9f9e29309063404573a2&env=all&application=all&page[number]=1&page[size]=9999999`
                    },
                    meta: { "total-pages": 1, "total-items": 2, size: 9999999 }
                }
            );

        nock(process.env.GATEWAY_URL)
            .post('/v1/favourite/find-by-user', { application: "all", userId: user.profile.legacyId })
            .query({ userId: user.profile.legacyId })
            .reply(200, {
                data: [{
                    id: "5a1c63f9de21ac1400dffa03",
                    type: "favourite",
                    attributes: {
                        userId: user.profile.legacyId,
                        resourceType: "dataset",
                        resourceId: "c0c71e67-0088-4d69-b375-85297f79ee75",
                        createdAt: "2017-11-27T19:14:01.585Z",
                        application: "rw"
                    }
                }]
            });

        nock(process.env.GATEWAY_URL)
            .get(`/v2/area/by-user/${user.profile.legacyId}`)
            .reply(200, {
                data: [
                    {
                        type: "area",
                        id: "6285d7d1a6c5c89109332431",
                        attributes: {
                            name: "catTestAreaThatCanBeDeletedAtAnyTime",
                            application: "gfw",
                            geostore: "b5d68ea6cbd71d18145cf6bbcf53bd62",
                            userId: user.profile.legacyId,
                            createdAt: "2022-05-19T05:38:25.780Z",
                            updatedAt: "2022-05-19T05:38:25.780Z",
                            image: "https://s3.amazonaws.com/146b-4b39-8523-1d151cb323e7.jpg",
                            datasets: [],
                            use: {},
                            env: "production",
                            iso: {},
                            admin: {},
                            tags: [],
                            status: "pending",
                            public: false,
                            fireAlerts: false,
                            deforestationAlerts: false,
                            webhookUrl: "",
                            monthlySummary: false,
                            subscriptionId: "",
                            email: "",
                            language: "en"
                        }
                    }, {
                        type: "area",
                        id: "6285f3849e28f4022b9c2114",
                        attributes: {
                            name: "catTestAreaThatCanBeDeletedAtAnyTime",
                            application: "gfw",
                            geostore: "b5d68ea6cbd71d18145cf6bbcf53bd62",
                            userId: user.profile.legacyId,
                            createdAt: "2022-05-19T07:36:36.697Z",
                            updatedAt: "2022-05-19T07:36:36.697Z",
                            image: "https://s3.amazonaws.com/fd81-4430-80f1-9649c32d597a.jpg",
                            datasets: [],
                            use: {},
                            env: "production",
                            iso: {},
                            admin: {},
                            tags: [],
                            status: "pending",
                            public: false,
                            fireAlerts: false,
                            deforestationAlerts: false,
                            webhookUrl: "",
                            monthlySummary: false,
                            subscriptionId: "",
                            email: "",
                            language: "en"
                        }
                    }, {
                        type: "area",
                        id: "628602be9d55f27cecf570fe",
                        attributes: {
                            name: "catTestAreaThatCanBeDeletedAtAnyTime",
                            application: "gfw",
                            geostore: "b5d68ea6cbd71d18145cf6bbcf53bd62",
                            userId: user.profile.legacyId,
                            createdAt: "2022-05-19T08:41:34.416Z",
                            updatedAt: "2022-05-19T08:41:34.416Z",
                            image: "https://s3.amazonaws.com/959d-4043-8a6e-9e811af2fc30.jpg",
                            datasets: [],
                            use: {},
                            env: "production",
                            iso: {},
                            admin: {},
                            tags: [],
                            status: "pending",
                            public: false,
                            fireAlerts: false,
                            deforestationAlerts: false,
                            webhookUrl: "",
                            monthlySummary: false,
                            subscriptionId: "",
                            email: "",
                            language: "en"
                        }
                    }]
            });

        nock(process.env.GATEWAY_URL)
            .get(`/v1/story/user/${user.profile.legacyId}`)
            .reply(200, {
                data: [
                    {
                        type: "story",
                        id: "132",
                        attributes: {
                            name: null,
                            title: "Test: My story - no name",
                            createdAt: "2016-08-25T11:43:58Z",
                            visible: true,
                            details: "Another est",
                            date: "2016-08-25T00:00:00Z",
                            email: null,
                            location: null,
                            media: [],
                            lat: 40.618652330904176,
                            lng: -2.8802813289062135,
                            hideUser: true
                        }
                    },
                    {
                        type: "story",
                        id: "124",
                        attributes: {
                            name: null,
                            title: "Testing hide",
                            createdAt: "2016-08-25T10:19:53Z",
                            visible: true,
                            details: null,
                            date: "2016-08-25T00:00:00Z",
                            email: null,
                            location: null,
                            media: [],
                            lat: 5.31660312,
                            lng: 14.2300415,
                            hideUser: true
                        }
                    }
                ]
            });

        nock(process.env.GATEWAY_URL)
            .get(`/v1/subscriptions/user/${user.profile.legacyId}`)
            .reply(200, {
                data: [{
                    type: "subscription",
                    id: "57bc7fc2b67c5da0020bac86",
                    attributes: {
                        name: null,
                        createdAt: "2015-12-15T19:26:08.573Z",
                        userId: user.profile.legacyId,
                        resource: { content: "julio.may@test.com", type: "EMAIL" },
                        datasets: ["Subscribe to alerts"],
                        params: { geostore: "54ad126f58951b4fcca7febb7b924d7c" },
                        confirmed: true,
                        language: "en",
                        datasetsQuery: [],
                        env: "production"
                    }
                }]
            });


        nock(process.env.GATEWAY_URL)
            .get('/v1/dashboard')
            .query({
                user: user.profile.legacyId,
                env: "all"
            })
            .reply(200, {
                data: [{
                    id: "510", type: "dashboards", attributes: {
                        name: "Ocean Watch Demo Reel",
                        slug: "ocean-watch-demo-reel",
                        summary: "Example widgets from upcoming Ocean Watch",
                        description: "Example widgets from upcoming Ocean Watch, including Coral Reef Global Profile and Regional Dashboards. Does not include all planned or implemented widgets. OW Country Page widgets are demo versions, typically focusing on Brazil.",
                        content: "",
                        published: false,
                        photo: {
                            cover: "/photos/cover/missing.png",
                            thumb: "/photos/thumb/missing.png",
                            original: "/photos/original/missing.png"
                        },
                        "user-id": user.profile.legacyId,
                        private: true,
                        env: "production",
                        user: null,
                        application: ["prep"],
                        "is-highlighted": false,
                        "is-featured": false,
                        "author-title": "",
                        "author-image": {
                            cover: "/author_images/cover/missing.png",
                            thumb: "/author_images/thumb/missing.png",
                            original: "/author_images/original/missing.png"
                        }
                    }
                }],
                links: {
                    self: `${process.env.GATEWAY_URL}/v1/dashboard?env=all&page%5Bnumber%5D=1&page%5Bsize%5D=10`,
                    prev: `${process.env.GATEWAY_URL}/v1/dashboard?env=all&page%5Bnumber%5D=1&page%5Bsize%5D=10`,
                    next: `${process.env.GATEWAY_URL}/v1/dashboard?env=all&page%5Bnumber%5D=1&page%5Bsize%5D=10`,
                    first: `${process.env.GATEWAY_URL}/v1/dashboard?env=all&page%5Bnumber%5D=1&page%5Bsize%5D=10`,
                    last: `${process.env.GATEWAY_URL}/v1/dashboard?env=all&page%5Bnumber%5D=1&page%5Bsize%5D=10`
                },
                meta: { "total-pages": 1, "total-items": 3, size: 10 }
            });


        nock(process.env.GATEWAY_URL)
            .get(`/v1/profile/${user.profile.legacyId}`)
            .reply(200, {
                data: {
                    id: "14",
                    type: "profiles",
                    attributes: {
                        "user-id": user.profile.legacyId,
                        avatar: {
                            thumbnail: "/system/profiles/avatars/000/000/014/thumbnail/data?1513178435",
                            medium: "/system/profiles/avatars/000/000/014/medium/data?1513178435",
                            original: "/system/profiles/avatars/000/000/014/original/data?1513178435"
                        },
                        "created-at": "2017-12-13T15:20:35.896Z",
                        "updated-at": "2017-12-13T15:20:35.896Z"
                    }
                }
            });

        nock(process.env.GATEWAY_URL)
            .get('/v1/topic')
            .query({
                user: user.profile.legacyId
            })
            .reply(200, {
                data: [{
                    id: "1",
                    type: "topics",
                    attributes: {
                        name: "Cities_old",
                        slug: "cities_old",
                        summary: "More than half the global population resides in cities, and another 2.4 billion people are expected to live in urban areas by 2050. Traditional models of city development can lock us into congestion, sprawl, and inefficient resource use. Better planning can pave the way for more connected and competitive cities with healthier, happier citizens.",
                        description: "",
                        content: "",
                        published: false,
                        photo: {
                            cover: "/system/topics/photos/000/000/001/cover/data?1576594380",
                            thumb: "/system/topics/photos/000/000/001/thumb/data?1576594380",
                            medium: "/system/topics/photos/000/000/001/medium/data?1576594380",
                            original: "/system/topics/photos/000/000/001/original/data?1576594380"
                        },
                        "user-id": user.profile.legacyId,
                        private: true,
                        user: null,
                        application: ["rw"]
                    }
                }]
            });

        const response: request.Response = await requester
            .get(`/auth/user/${user.profile.legacyId}/resources`)
            .set('Authorization', `Bearer ${token}`);

        response.status.should.equal(200);
        response.body.should.have.property('datasets').and.be.an('object').and.have.property('data').and.have.length(1);
        response.body.should.have.property('datasets').and.be.an('object').and.have.property('count').and.equal(1);
        response.body.should.have.property('layers').and.be.an('object').and.have.property('data').and.have.length(2);
        response.body.should.have.property('layers').and.be.an('object').and.have.property('count').and.equal(3);
        response.body.should.have.property('widgets').and.be.an('object').and.have.property('data').and.have.length(1);
        response.body.should.have.property('widgets').and.be.an('object').and.have.property('count').and.equal(5);
        response.body.should.have.property('userAccount').and.be.an('object').and.have.property('data');
        response.body.should.have.property('userAccount').and.be.an('object').and.not.have.property('count');
        response.body.should.have.property('userData').and.be.an('object').and.have.property('data');
        response.body.should.have.property('userData').and.be.an('object').and.not.have.property('count');
        response.body.should.have.property('collections').and.be.an('object').and.have.property('data').and.have.length(1);
        response.body.should.have.property('collections').and.be.an('object').and.have.property('count').and.equal(2);
        response.body.should.have.property('areas').and.be.an('object').and.have.property('data').and.have.length(3);
        response.body.should.have.property('areas').and.be.an('object').and.have.property('count').and.equal(3);
        response.body.should.have.property('stories').and.be.an('object').and.have.property('data').and.have.length(2);
        response.body.should.have.property('stories').and.be.an('object').and.have.property('count').and.equal(2);
        response.body.should.have.property('subscriptions').and.be.an('object').and.have.property('data').and.have.length(1);
        response.body.should.have.property('subscriptions').and.be.an('object').and.have.property('count').and.equal(1);
        response.body.should.have.property('dashboards').and.be.an('object').and.have.property('data').and.have.length(1);
        response.body.should.have.property('dashboards').and.be.an('object').and.have.property('count').and.equal(1);
        response.body.should.have.property('profiles').and.be.an('object').and.have.property('data');
        response.body.should.have.property('profiles').and.be.an('object').and.not.have.property('count');
        response.body.should.have.property('topics').and.be.an('object').and.have.property('data').and.have.length(1);
        response.body.should.have.property('topics').and.be.an('object').and.have.property('count').and.equal(1);
    });

    after(async () => {
        await closeTestAgent();
    });

    afterEach(() => {
        if (!nock.isDone()) {
            throw new Error(`Not all nock interceptors were used: ${nock.pendingMocks()}`);
        }
    });
});
