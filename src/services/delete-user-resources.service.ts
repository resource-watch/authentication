import { RWAPIMicroservice } from "rw-api-microservice-node";
import logger from "logger";

type DeleteResourceResult = {
    deletedData?: Record<string, any>[]
    protectedData?: Record<string, any>[]
    count: number
    error?: string
}

export default class DeleteUserResourcesService {
    static async deleteDatasets(userId: string): Promise<DeleteResourceResult> {
        try {
            const response: Record<string, any> = await RWAPIMicroservice.requestToMicroservice({
                    uri: `/v1/dataset/by-user/${userId}`,
                    method: 'DELETE'
                }
            );

            const deletedData: Array<any> = Array.isArray(response.deletedDatasets) ? response.deletedDatasets : [response.deletedDatasets]

            return {
                deletedData,
                protectedData: Array.isArray(response.protectedDatasets) ? response.protectedDatasets : [response.protectedDatasets],
                count: deletedData.length
            };
        } catch (error) {
            logger.warn(`Error trying to delete dataset resources for user ID ${userId}. Error: ${error.toString()}`)
            return {
                error: error.toString(),
                count: -1
            };
        }
    }

    static async deleteLayers(userId: string): Promise<DeleteResourceResult> {
        try {
            const response: Record<string, any> = await RWAPIMicroservice.requestToMicroservice({
                    uri: `/v1/layer/by-user/${userId}`,
                    method: 'DELETE'
                }
            );

            const deletedData: Array<any> = Array.isArray(response.deletedLayers) ? response.deletedLayers : [response.deletedLayers]

            return {
                deletedData,
                protectedData: Array.isArray(response.protectedLayers) ? response.protectedLayers : [response.protectedLayers],
                count: deletedData.length
            };
        } catch (error) {
            logger.warn(`Error trying to delete layer resources for user ID ${userId}. Error: ${error.toString()}`)
            return {
                error: error.toString(),
                count: -1
            };
        }
    }

    static async deleteWidgets(userId: string): Promise<DeleteResourceResult> {
        try {
            const response: Record<string, any> = await RWAPIMicroservice.requestToMicroservice({
                    uri: `/v1/widget/by-user/${userId}`,
                    method: 'DELETE'
                }
            );

            const deletedData: Array<any> = Array.isArray(response.deletedWidgets) ? response.deletedWidgets : [response.deletedWidgets]

            return {
                deletedData,
                protectedData: Array.isArray(response.protectedWidgets) ? response.protectedWidgets : [response.protectedWidgets],
                count: deletedData.length
            };
        } catch (error) {
            logger.warn(`Error trying to delete widget resources for user ID ${userId}. Error: ${error.toString()}`)
            return {
                error: error.toString(),
                count: -1
            };
        }
    }

    static async deleteUserData(userId: string): Promise<DeleteResourceResult> {
        try {
            const response: Record<string, any> = await RWAPIMicroservice.requestToMicroservice({
                    uri: `/v2/user/${userId}`,
                    method: 'DELETE'
                }
            );

            return {
                deletedData: [response.data],
                count: Object.keys(response.data).length > 1 ? 1 : 0
            };
        } catch (error) {
            if (error.statusCode === 404 && error.response.data.errors[0].detail === 'User not found') {
                return {
                    deletedData: [],
                    count: 0
                };
            }
            logger.warn(`Error trying to delete user data resource for user ID ${userId}. Error: ${error.toString()}`)
            return {
                error: error.toString(),
                count: -1
            };
        }
    }

    static async deleteCollectionsData(userId: string): Promise<DeleteResourceResult> {
        try {
            const response: Record<string, any> = await RWAPIMicroservice.requestToMicroservice({
                    uri: `/v1/collection/by-user/${userId}`,
                    method: 'DELETE'
                }
            );

            return {
                deletedData: response.data,
                count: response.data.length
            };
        } catch (error) {
            logger.warn(`Error trying to delete collection resources for user ID ${userId}. Error: ${error.toString()}`)
            return {
                error: error.toString(),
                count: -1
            };
        }
    }

    static async deleteFavouritesData(userId: string): Promise<DeleteResourceResult> {
        try {
            const response: Record<string, any> = await RWAPIMicroservice.requestToMicroservice({
                    uri: `/v1/favourite/by-user/${userId}`,
                    method: 'DELETE',
                }
            );

            return {
                deletedData: response.data,
                count: response.data.length
            };
        } catch (error) {
            logger.warn(`Error trying to delete favourite resources for user ID ${userId}. Error: ${error.toString()}`)
            return {
                error: error.toString(),
                count: -1
            };
        }
    }

    static async deleteAreas(userId: string): Promise<DeleteResourceResult> {
        try {
            const response: Record<string, any> = await RWAPIMicroservice.requestToMicroservice({
                    uri: `/v2/area/by-user/${userId}`,
                    method: 'DELETE',
                }
            );

            return {
                deletedData: response.data,
                count: response.data.length
            };
        } catch (error) {
            logger.warn(`Error trying to delete area resources for user ID ${userId}. Error: ${error.toString()}`)
            return {
                error: error.toString(),
                count: -1
            };
        }
    }

    static async deleteStories(userId: string): Promise<DeleteResourceResult> {
        try {
            const response: Record<string, any> = await RWAPIMicroservice.requestToMicroservice({
                    uri: `/v1/story/by-user/${userId}`,
                    method: 'DELETE',
                }
            );

            return {
                deletedData: response.data,
                count: response.data.length
            };
        } catch (error) {
            logger.warn(`Error trying to delete story resources for user ID ${userId}. Error: ${error.toString()}`)
            return {
                error: error.toString(),
                count: -1
            };
        }
    }

    static async deleteSubscriptions(userId: string): Promise<DeleteResourceResult> {
        try {
            const response: Record<string, any> = await RWAPIMicroservice.requestToMicroservice({
                    uri: `/v1/subscriptions/by-user/${userId}`,
                    method: 'DELETE',

                }
            );

            return {
                deletedData: response.data,
                count: response.data.length
            };
        } catch (error) {
            logger.warn(`Error trying to delete subscription resources for user ID ${userId}. Error: ${error.toString()}`)
            return {
                error: error.toString(),
                count: -1
            };
        }
    }

    static async deleteDashboards(userId: string): Promise<DeleteResourceResult> {
        try {
            const response: Record<string, any> = await RWAPIMicroservice.requestToMicroservice({
                    uri: `/v1/dashboard/by-user/${userId}`,
                    method: 'DELETE',
                }
            );

            return {
                deletedData: response.data,
                count: response.data.length
            };
        } catch (error) {
            logger.warn(`Error trying to delete dashboard resources for user ID ${userId}. Error: ${error.toString()}`)
            return {
                error: error.toString(),
                count: -1
            };
        }
    }

    static async deleteProfile(userId: string): Promise<DeleteResourceResult> {
        try {
            const response: Record<string, any> = await RWAPIMicroservice.requestToMicroservice({
                    uri: `/v1/profile/${userId}`,
                    method: 'DELETE'
                }
            );

            return {
                deletedData: [],
                count: 1
            };
        } catch (error) {
            if (error.statusCode === 404 && error.response.data.errors[0].detail === 'Wrong ID provided') {
                return {
                    deletedData: [],
                    count: 0
                };
            }
            logger.warn(`Error trying to delete profile resources for user ID ${userId}. Error: ${error.toString()}`)
            return {
                error: error.toString(),
                count: -1
            };
        }
    }

    static async deleteTopics(userId: string): Promise<DeleteResourceResult> {
        try {
            const response: Record<string, any> = await RWAPIMicroservice.requestToMicroservice({
                    uri: `/v1/topic/by-user/${userId}`,
                    method: 'DELETE',
                }
            );

            return {
                deletedData: response.data,
                count: response.data.length
            };
        } catch (error) {
            logger.warn(`Error trying to delete topic resources for user ID ${userId}. Error: ${error.toString()}`)
            return {
                error: error.toString(),
                count: -1
            };
        }
    }

}
