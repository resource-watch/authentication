import nock from "nock";
import { IUserLegacyId } from "services/okta.interfaces";

export const mockGetResourcesCalls =
    (userId: IUserLegacyId) => {
        nock(process.env.GATEWAY_URL)
            .get('/v1/dataset')
            .query({ userId: (userId as string), env: "all" })
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
                        userId: userId,
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
                    self: `${process.env.GATEWAY_URL}/v1/dataset?userId=${userId}&page[number]=1&page[size]=10`,
                    first: `${process.env.GATEWAY_URL}/v1/dataset?userId=${userId}&page[number]=1&page[size]=10`,
                    last: `${process.env.GATEWAY_URL}/v1/dataset?userId=${userId}&page[number]=1&page[size]=10`,
                    prev: `${process.env.GATEWAY_URL}/v1/dataset?userId=${userId}&page[number]=1&page[size]=10`,
                    next: `${process.env.GATEWAY_URL}/v1/dataset?userId=${userId}&page[number]=1&page[size]=10`
                },
                meta: { "total-pages": 1, "total-items": 1, size: 10 }
            });

        nock(process.env.GATEWAY_URL)
            .get('/v1/layer')
            .query({ userId: (userId as string), env: "all" })
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
                        userId: userId,
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
                        userId: userId,
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
            .query({ userId: (userId as string), env: "all" })
            .reply(200, {
                data: [{
                    id: "0bf764d6-9bb8-4565-bd11-4d729d0fd004", type: "widget", attributes: {
                        name: "Temperature lows in Porto Alegre",
                        dataset: "62520fd2-2dfb-4a13-840b-35ac88fc7aa4",
                        slug: "temperature-lows-in-porto-alegre",
                        userId: userId,
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
            .get(`/v2/user/${userId}`)
            .reply(200, {
                data: {
                    type: "user",
                    id: userId,
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
                userId: (userId as string),
                env: "all",
                application: "all"
            })
            .reply(200, {
                    data: [{
                        id: "61a0f149eb8ef6001a57851e",
                        type: "collection",
                        attributes: {
                            name: "TML",
                            ownerId: userId,
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
            .post('/v1/favourite/find-by-user', { application: "all", userId: (userId as string) })
            .query({ userId: (userId as string) })
            .reply(200, {
                data: [{
                    id: "5a1c63f9de21ac1400dffa03",
                    type: "favourite",
                    attributes: {
                        userId: userId,
                        resourceType: "dataset",
                        resourceId: "c0c71e67-0088-4d69-b375-85297f79ee75",
                        createdAt: "2017-11-27T19:14:01.585Z",
                        application: "rw"
                    }
                }]
            });

        nock(process.env.GATEWAY_URL)
            .get(`/v2/area/by-user/${userId}`)
            .reply(200, {
                data: [
                    {
                        type: "area",
                        id: "6285d7d1a6c5c89109332431",
                        attributes: {
                            name: "catTestAreaThatCanBeDeletedAtAnyTime",
                            application: "gfw",
                            geostore: "b5d68ea6cbd71d18145cf6bbcf53bd62",
                            userId: userId,
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
                            userId: userId,
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
                            userId: userId,
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
            .get(`/v1/story/user/${userId}`)
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
            .get(`/v1/subscriptions/user/${userId}`)
            .reply(200, {
                data: [{
                    type: "subscription",
                    id: "57bc7fc2b67c5da0020bac86",
                    attributes: {
                        name: null,
                        createdAt: "2015-12-15T19:26:08.573Z",
                        userId: userId,
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
                user: (userId as string),
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
                        "user-id": userId,
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
            .get(`/v1/profile/${userId}`)
            .reply(200, {
                data: {
                    id: "14",
                    type: "profiles",
                    attributes: {
                        "user-id": userId,
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
                user: (userId as string)
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
                        "user-id": userId,
                        private: true,
                        user: null,
                        application: ["rw"]
                    }
                }]
            });
    }

export const mockDeleteResourcesCalls = (userId: IUserLegacyId) => {
    nock(process.env.GATEWAY_URL)
        .delete(`/v1/dataset/by-user/${userId}`)
        .reply(200, {
            deletedDatasets: {
                id: "2b793c7f-4470-4342-9989-cec1fb18f7cf",
                type: "dataset",
                attributes: {
                    name: "Subnational Political Boundaries",
                    slug: "Subnational-Political-Boundaries",
                    type: null,
                    subtitle: null,
                    application: [],
                    dataPath: null,
                    attributesPath: null,
                    connectorType: "rest",
                    provider: "cartodb",
                    userId,
                    connectorUrl: "https://carto.com/public",
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
            },
            protectedDatasets: []
        });

    nock(process.env.GATEWAY_URL)
        .delete(`/v1/layer/by-user/${userId}`)
        .reply(200, {
            deletedLayers: [
                {
                    id: "c86d30eb-158f-4cbc-aca5-27db7a9ab92c",
                    type: "layer",
                    attributes: {
                        name: "Water stress",
                        slug: "Water-stress_2",
                        dataset: "54445abd-27bc-4629-b460-da1dc18ac3ce",
                        description: "water stress",
                        application: [
                            "gfw"
                        ],
                        iso: [],
                        userId,
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
                },
                {
                    id: "8635e148-45e6-492d-8396-cc2fe09c6205",
                    type: "layer",
                    attributes: {
                        name: "Water stress",
                        slug: "Water-stress_1",
                        dataset: "54445abd-27bc-4629-b460-da1dc18ac3ce",
                        description: "water stress",
                        application: [
                            "gfw"
                        ],
                        iso: [],
                        userId,
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
                }
            ],
            protectedLayers: []
        });

    nock(process.env.GATEWAY_URL)
        .delete(`/v1/widget/by-user/${userId}`)
        .reply(200, {
            deletedWidgets: [
                {
                    id: "0bf764d6-9bb8-4565-bd11-4d729d0fd004",
                    type: "widget",
                    attributes: {
                        name: "Temperature lows in Porto Alegre",
                        dataset: "62520fd2-2dfb-4a13-840b-35ac88fc7aa4",
                        slug: "temperature-lows-in-porto-alegre",
                        userId,
                        description: "Annual historic and projected temperature minimums in degrees Celsius derived from the NEX-GDDP downscaled data for the RCP4.5 and RCP 8.5 scenarios. In addition to seasonal fluctuation, this graph shows a trend of increased annual temperature lows from 1950 to 2100 for Porto Alegre. The RCP4.5 scenario, which assumes stabilization shortly after 2100, shows an increased high of about 2°C. The RCP8.5 scenario, characterized by relatively high greenhouse gas emissions, projects an almost 5°C increase.",
                        source: "",
                        sourceUrl: null,
                        authors: "",
                        application: [
                            "prep"
                        ],
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
                }
            ],
            protectedWidgets: []
        });

    nock(process.env.GATEWAY_URL)
        .delete(`/v2/user/${userId}`)
        .reply(200, {
            data: {
                type: "user",
                id: userId,
                attributes: {
                    fullName: "john doe",
                    createdAt: "2023-03-09T14:40:11.046Z",
                    primaryResponsibilities: [],
                    interests: [],
                    howDoYouUse: [],
                    signUpForTesting: false,
                    signUpToNewsletter: false,
                    topics: [],
                    profileComplete: false
                }
            }
        });

    nock(process.env.GATEWAY_URL)
        .delete(`/v1/collection/by-user/${userId}`)
        .reply(200, {
            data: [
                {
                    id: "61a0f149eb8ef6001a57851e",
                    type: "collection",
                    attributes: {
                        name: "TML",
                        ownerId: userId,
                        application: "rw",
                        env: "production",
                        resources: [
                            {
                                id: "db84dd39-51e1-4a70-a9fc-ae90809cefa4",
                                type: "dataset"
                            }
                        ]
                    }
                }
            ]
        });

    nock(process.env.GATEWAY_URL)
        .delete(`/v1/favourite/by-user/${userId}`)
        .reply(200, {
            data: [
                {
                    id: "5a1c63f9de21ac1400dffa03",
                    type: "favourite",
                    attributes: {
                        userId,
                        resourceType: "dataset",
                        resourceId: "c0c71e67-0088-4d69-b375-85297f79ee75",
                        createdAt: "2017-11-27T19:14:01.585Z",
                        application: "rw"
                    }
                }
            ]
        });

    nock(process.env.GATEWAY_URL)
        .delete(`/v2/area/by-user/${userId}`)
        .reply(200, {
            data: [
                {
                    type: "area",
                    id: "6285d7d1a6c5c89109332431",
                    attributes: {
                        name: "catTestAreaThatCanBeDeletedAtAnyTime",
                        application: "gfw",
                        geostore: "b5d68ea6cbd71d18145cf6bbcf53bd62",
                        userId,
                        createdAt: "2022-05-19T05:38:25.780Z",
                        updatedAt: "2022-05-19T05:38:25.780Z",
                        image: "https://s3.amazonaws.com/9f9abebf-146b-4b39-8523-1d151cb323e7.jpg",
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
                },
                {
                    type: "area",
                    id: "6285f3849e28f4022b9c2114",
                    attributes: {
                        name: "catTestAreaThatCanBeDeletedAtAnyTime",
                        application: "gfw",
                        geostore: "b5d68ea6cbd71d18145cf6bbcf53bd62",
                        userId,
                        createdAt: "2022-05-19T07:36:36.697Z",
                        updatedAt: "2022-05-19T07:36:36.697Z",
                        image: "https://s3.amazonaws.com/f7f12975-fd81-4430-80f1-9649c32d597a.jpg",
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
                }
            ]
        });

    nock(process.env.GATEWAY_URL)
        .delete(`/v1/story/by-user/${userId}`)
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
        .delete(`/v1/subscriptions/by-user/${userId}`)
        .reply(200, {
            data: [
                {
                    type: "subscription",
                    id: "57bc7fc2b6765da0026bac86",
                    attributes: {
                        name: null,
                        createdAt: "2015-12-15T19:26:08.573Z",
                        userId,
                        resource: {
                            content: "julio.doe@sample.com",
                            type: "EMAIL"
                        },
                        datasets: [
                            "Subscribe to alerts"
                        ],
                        params: {
                            geostore: "54ad526f58951b4fcc27febb7b924d7c"
                        },
                        confirmed: true,
                        language: "en",
                        datasetsQuery: [],
                        env: "production"
                    }
                }
            ]
        });


    nock(process.env.GATEWAY_URL)
        .delete(`/v1/dashboard/by-user/${userId}`)
        .reply(200, {
            data: [
                {
                    id: "427",
                    type: "dashboards",
                    attributes: {
                        name: "GCBR Land Cover and Vegetation Analysis",
                        slug: "gcbr-land-cover-and-vegetation-analysis",
                        summary: "This dashboard explores land cover across the twelve management units within GCBR and land cover in historic vegetation areas within the twelve management units.",
                        description: "",
                        content: "",
                        published: false,
                        photo: {
                            cover: "/photos/cover/missing.png",
                            thumb: "/photos/thumb/missing.png",
                            original: "/photos/original/missing.png"
                        },
                        "user-id": userId,
                        private: true,
                        env: "production",
                        user: null,
                        application: [
                            "rw"
                        ],
                        "is-highlighted": false,
                        "is-featured": false,
                        "author-title": "",
                        "author-image": {
                            cover: "/author_images/cover/missing.png",
                            thumb: "/author_images/thumb/missing.png",
                            original: "/author_images/original/missing.png"
                        }
                    }
                },
                {
                    id: "428",
                    type: "dashboards",
                    attributes: {
                        name: "Test",
                        slug: "test-83c0ed33-634d-4dd3-af06-68571f113e82",
                        summary: "",
                        description: "",
                        content: "",
                        published: false,
                        photo: {
                            cover: "/photos/cover/missing.png",
                            thumb: "/photos/thumb/missing.png",
                            original: "/photos/original/missing.png"
                        },
                        "user-id": userId,
                        private: true,
                        env: "production",
                        user: null,
                        application: [
                            "rw"
                        ],
                        "is-highlighted": false,
                        "is-featured": false,
                        "author-title": "",
                        "author-image": {
                            cover: "/author_images/cover/missing.png",
                            thumb: "/author_images/thumb/missing.png",
                            original: "/author_images/original/missing.png"
                        }
                    }
                },
                {
                    id: "510",
                    type: "dashboards",
                    attributes: {
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
                        "user-id": userId,
                        private: true,
                        env: "production",
                        user: null,
                        application: [
                            "rw"
                        ],
                        "is-highlighted": false,
                        "is-featured": false,
                        "author-title": "",
                        "author-image": {
                            cover: "/author_images/cover/missing.png",
                            thumb: "/author_images/thumb/missing.png",
                            original: "/author_images/original/missing.png"
                        }
                    }
                }
            ]
        });

    nock(process.env.GATEWAY_URL)
        .delete(`/v1/profile/${userId}`)
        .reply(204);

    nock(process.env.GATEWAY_URL)
        .delete(`/v1/topic/by-user/${userId}`)
        .reply(200, {
            data: [
                {
                    id: "2",
                    type: "topics",
                    attributes: {
                        name: "Biodiversity",
                        slug: "biodiversity",
                        summary: "",
                        description: "",
                        content: "",
                        published: false,
                        photo: {
                            cover: "/photos/cover/missing.png",
                            thumb: "/photos/thumb/missing.png",
                            medium: "/photos/medium/missing.png",
                            original: "/photos/original/missing.png"
                        },
                        "user-id": userId,
                        private: true,
                        user: null,
                        application: [
                            "rw"
                        ]
                    }
                },
                {
                    id: "3",
                    type: "topics",
                    attributes: {
                        name: "Food",
                        slug: "food",
                        summary: "Food is a constant and vital necessity for every person on the planet. Food and agriculture underpin many of the Sustainable Development Goals and are also closely linked to global resource issues such as ecosystems and biodiversity, water, energy, and climate change.",
                        description: "",
                        content: "",
                        published: true,
                        photo: {
                            cover: "/photos/cover/missing.png",
                            thumb: "/photos/thumb/missing.png",
                            medium: "/photos/medium/missing.png",
                            original: "/photos/original/missing.png"
                        },
                        "user-id": userId,
                        private: true,
                        user: null,
                        application: [
                            "rw"
                        ]
                    }
                }
            ]
        });
}
