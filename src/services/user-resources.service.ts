import { RWAPIMicroservice } from "rw-api-microservice-node";
import logger from "logger";

type ResourceResult = {
    data: Record<string, any>[]
    count: number
}

export default class UserResourcesService {
    static async getDatasets(userId: string): Promise<ResourceResult> {
        try {
            const response: Record<string, any> = await RWAPIMicroservice.requestToMicroservice({
                    params: {
                        userId,
                        env: "all"
                    },
                    uri: '/v1/dataset',
                    method: 'GET'
                }
            );

            return {
                data: response.data,
                count: response.meta['total-items']
            };
        } catch (error) {
            logger.warn(`Error trying to load dataset resources for user ID ${userId}. Error: ${error.toString()}`)
            return {
                data: [],
                count: -1
            };
        }
    }

    static async getLayers(userId: string): Promise<ResourceResult> {
        try {
            const response: Record<string, any> = await RWAPIMicroservice.requestToMicroservice({
                    params: {
                        userId,
                        env: "all"
                    },
                    uri: '/v1/layer',
                    method: 'GET'
                }
            );

            return {
                data: response.data,
                count: response.meta['total-items']
            };
        } catch (error) {
            logger.warn(`Error trying to load layer resources for user ID ${userId}. Error: ${error.toString()}`)
            return {
                data: [],
                count: -1
            };
        }
    }

    static async getWidgets(userId: string): Promise<ResourceResult> {
        try {
            const response: Record<string, any> = await RWAPIMicroservice.requestToMicroservice({
                    params: {
                        userId,
                        env: "all"
                    },
                    uri: '/v1/widget',
                    method: 'GET'
                }
            );

            return {
                data: response.data,
                count: response.meta['total-items']
            };
        } catch (error) {
            logger.warn(`Error trying to load widget resources for user ID ${userId}. Error: ${error.toString()}`)
            return {
                data: [],
                count: -1
            };
        }
    }

    static async getUserData(userId: string): Promise<Record<string, any>> {
        try {
            const response: Record<string, any> = await RWAPIMicroservice.requestToMicroservice({
                    uri: `/v2/user/${userId}`,
                    method: 'GET'
                }
            );

            return {
                data: response.data,
                count: Object.keys(response.data).length > 1 ? 1 : 0
            };
        } catch (error) {
            logger.warn(`Error trying to load user data resource for user ID ${userId}. Error: ${error.toString()}`)
            return {
                data: [],
                count: -1
            };
        }
    }

    static async getCollectionsData(userId: string): Promise<Record<string, any>> {
        try {
            const response: Record<string, any> = await RWAPIMicroservice.requestToMicroservice({
                    params: {
                        userId,
                        env: "all",
                        application: "all"
                    },
                    uri: `/v1/collection`,
                    method: 'GET'
                }
            );

            return {
                data: response.data,
                count: response.meta['total-items']
            };
        } catch (error) {
            logger.warn(`Error trying to load collection resources for user ID ${userId}. Error: ${error.toString()}`)
            return {
                data: [],
                count: -1
            };
        }
    }

    static async getFavouritesData(userId: string): Promise<Record<string, any>> {
        try {
            const response: Record<string, any> = await RWAPIMicroservice.requestToMicroservice({
                    params: {
                        userId
                    },
                    uri: `/v1/favourite/find-by-user`,
                    method: 'POST',
                    body: {
                        application: 'all',
                        userId
                    }
                }
            );

            return {
                data: response.data,
                count: response.data.length
            };
        } catch (error) {
            logger.warn(`Error trying to load favourite resources for user ID ${userId}. Error: ${error.toString()}`)
            return {
                data: [],
                count: -1
            };
        }
    }

    static async getAreas(userId: string): Promise<Record<string, any>> {
        try {
            const response: Record<string, any> = await RWAPIMicroservice.requestToMicroservice({
                    uri: `/v2/area/by-user/${userId}`,
                    method: 'GET',
                }
            );

            return {
                data: response.data,
                count: response.data.length
            };
        } catch (error) {
            logger.warn(`Error trying to load area resources for user ID ${userId}. Error: ${error.toString()}`)
            return {
                data: [],
                count: -1
            };
        }
    }

    static async getStories(userId: string): Promise<Record<string, any>> {
        try {
            const response: Record<string, any> = await RWAPIMicroservice.requestToMicroservice({
                    uri: `/v1/story/user/${userId}`,
                    method: 'GET',
                }
            );

            return {
                data: response.data,
                count: response.data.length
            };
        } catch (error) {
            logger.warn(`Error trying to load story resources for user ID ${userId}. Error: ${error.toString()}`)
            return {
                data: [],
                count: -1
            };
        }
    }

    static async getSubscriptions(userId: string): Promise<Record<string, any>> {
        try {
            const response: Record<string, any> = await RWAPIMicroservice.requestToMicroservice({
                    uri: `/v1/subscriptions/user/${userId}`,
                    method: 'GET',

                }
            );

            return {
                data: response.data,
                count: response.data.length
            };
        } catch (error) {
            logger.warn(`Error trying to load subscription resources for user ID ${userId}. Error: ${error.toString()}`)
            return {
                data: [],
                count: -1
            };
        }
    }

    static async getDashboards(userId: string): Promise<Record<string, any>> {
        try {
            const response: Record<string, any> = await RWAPIMicroservice.requestToMicroservice({
                    params: {
                        user: userId,
                        env: "all"
                    },
                    uri: `/v1/dashboard`,
                    method: 'GET',
                }
            );

            return {
                data: response.data,
                count: response.data.length
            };
        } catch (error) {
            logger.warn(`Error trying to load dashboard resources for user ID ${userId}. Error: ${error.toString()}`)
            return {
                data: [],
                count: -1
            };
        }
    }

    static async getProfile(userId: string): Promise<Record<string, any>> {
        try {
            const response: Record<string, any> = await RWAPIMicroservice.requestToMicroservice({
                    uri: `/v1/profile/${userId}`,
                    method: 'GET',
                    resolveWithFullResponse: false
                }
            );

            return {
                data: [response.data],
                count: Object.keys(response.data).length > 1 ? 1 : 0
            };
        } catch (error) {
            if (error.statusCode === 404 && error.response.data.errors[0].detail === 'Wrong ID provided') {
                return {
                    data: [],
                    count: 0
                };
            }
            logger.warn(`Error trying to load profile resources for user ID ${userId}. Error: ${error.toString()}`)
            return {
                data: [],
                count: -1
            };
        }
    }

    static async getTopics(userId: string): Promise<Record<string, any>> {
        try {
            const response: Record<string, any> = await RWAPIMicroservice.requestToMicroservice({
                    params: {
                        user: userId,
                    },
                    uri: `/v1/topic`,
                    method: 'GET',
                }
            );

            return {
                data: response.data,
                count: response.data.length
            };
        } catch (error) {
            logger.warn(`Error trying to load topic resources for user ID ${userId}. Error: ${error.toString()}`)
            return {
                data: [],
                count: -1
            };
        }
    }

}
