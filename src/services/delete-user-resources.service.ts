import { RWAPIMicroservice } from "rw-api-microservice-node";
import logger from "logger";

type ResourceResult = {
    data: Record<string, any>[]
    count: number
}

export default class DeleteUserResourcesService {
    static async deleteDatasets(userId: string): Promise<ResourceResult> {
        try {
            const response: Record<string, any> = await RWAPIMicroservice.requestToMicroservice({
                    params: {
                        userId,
                        env: "all"
                    },
                    uri: '/v1/dataset',
                    method: 'DELETE'
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

    static async deleteLayers(userId: string): Promise<ResourceResult> {
        try {
            const response: Record<string, any> = await RWAPIMicroservice.requestToMicroservice({
                    params: {
                        userId,
                        env: "all"
                    },
                    uri: '/v1/layer',
                    method: 'DELETE'
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

    static async deleteWiddeletes(userId: string): Promise<ResourceResult> {
        try {
            const response: Record<string, any> = await RWAPIMicroservice.requestToMicroservice({
                    params: {
                        userId,
                        env: "all"
                    },
                    uri: '/v1/widdelete',
                    method: 'DELETE'
                }
            );

            return {
                data: response.data,
                count: response.meta['total-items']
            };
        } catch (error) {
            logger.warn(`Error trying to load widdelete resources for user ID ${userId}. Error: ${error.toString()}`)
            return {
                data: [],
                count: -1
            };
        }
    }

    static async deleteUserData(userId: string): Promise<Record<string, any>> {
        try {
            const response: Record<string, any> = await RWAPIMicroservice.requestToMicroservice({
                    uri: `/v2/user/${userId}`,
                    method: 'DELETE'
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

    static async deleteCollectionsData(userId: string): Promise<Record<string, any>> {
        try {
            const response: Record<string, any> = await RWAPIMicroservice.requestToMicroservice({
                    params: {
                        userId,
                        env: "all",
                        application: "all"
                    },
                    uri: `/v1/collection`,
                    method: 'DELETE'
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

    static async deleteFavouritesData(userId: string): Promise<Record<string, any>> {
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

    static async deleteAreas(userId: string): Promise<Record<string, any>> {
        try {
            const response: Record<string, any> = await RWAPIMicroservice.requestToMicroservice({
                    uri: `/v2/area/by-user/${userId}`,
                    method: 'DELETE',
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

    static async deleteStories(userId: string): Promise<Record<string, any>> {
        try {
            const response: Record<string, any> = await RWAPIMicroservice.requestToMicroservice({
                    uri: `/v1/story/user/${userId}`,
                    method: 'DELETE',
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

    static async deleteSubscriptions(userId: string): Promise<Record<string, any>> {
        try {
            const response: Record<string, any> = await RWAPIMicroservice.requestToMicroservice({
                    uri: `/v1/subscriptions/user/${userId}`,
                    method: 'DELETE',

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

    static async deleteDashboards(userId: string): Promise<Record<string, any>> {
        try {
            const response: Record<string, any> = await RWAPIMicroservice.requestToMicroservice({
                    params: {
                        user: userId,
                        env: "all"
                    },
                    uri: `/v1/dashboard`,
                    method: 'DELETE',
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

    static async deleteProfile(userId: string): Promise<Record<string, any>> {
        try {
            const response: Record<string, any> = await RWAPIMicroservice.requestToMicroservice({
                    uri: `/v1/profile/${userId}`,
                    method: 'DELETE',
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

    static async deleteTopics(userId: string): Promise<Record<string, any>> {
        try {
            const response: Record<string, any> = await RWAPIMicroservice.requestToMicroservice({
                    params: {
                        user: userId,
                    },
                    uri: `/v1/topic`,
                    method: 'DELETE',
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
