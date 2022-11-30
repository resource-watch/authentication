import ApplicationModel, { IApplication } from 'models/application';
import { FilterQuery, PaginateDocument, PaginateOptions, PaginateResult } from 'mongoose';
import ApplicationNotFoundError from 'errors/applicationNotFound.error';
import APIGatewayAWSService from "services/apigateway.aws.service";
import { CreateApiKeyCommandOutput, UpdateApiKeyCommandOutput } from "@aws-sdk/client-api-gateway";

export default class ApplicationService {
    static async createApplication(applicationData: Partial<IApplication>): Promise<IApplication> {
        const apiKeyResponse: CreateApiKeyCommandOutput = await APIGatewayAWSService.createApiKey(applicationData.name);

        const application: Partial<IApplication> = new ApplicationModel({
            ...applicationData,
            apiKeyId: apiKeyResponse.id,
            apiKeyValue: apiKeyResponse.value,
        });
        return application.save();
    }

    static async updateApplication(id: string, applicationData: Partial<IApplication>, regenApiKey: boolean): Promise<IApplication> {
        const application: IApplication = await ApplicationService.getApplicationById(id);

        application.set(applicationData);
        application.updatedAt = new Date();

        if (regenApiKey) {
            await APIGatewayAWSService.deleteApiKey(application.apiKeyId);
            const apiKeyResponse: CreateApiKeyCommandOutput = await APIGatewayAWSService.createApiKey(applicationData.name);
            application.set({
                apiKeyId: apiKeyResponse.id,
                apiKeyValue: apiKeyResponse.value,
            });
        } else if (applicationData.name) {
            await APIGatewayAWSService.updateApiKey(application.apiKeyId, applicationData.name);
        }

        return application.save();
    }

    static async deleteApplication(id: string): Promise<IApplication> {
        const application: IApplication = await ApplicationService.getApplicationById(id);

        await APIGatewayAWSService.deleteApiKey(application.apiKeyId);
        await application.remove();

        return application;
    }

    static async getApplications(query: FilterQuery<IApplication>, paginationOptions: PaginateOptions): Promise<PaginateResult<PaginateDocument<IApplication, unknown, PaginateOptions>>> {
        const applications: PaginateResult<PaginateDocument<IApplication, unknown, PaginateOptions>> = await ApplicationModel.paginate(query, paginationOptions);
        return applications;
    }

    static async getApplicationById(id: string): Promise<IApplication> {
        const application: IApplication = await ApplicationModel.findById(id.toString());
        if (!application) {
            throw new ApplicationNotFoundError();
        }
        return application;
    }

    static async getApplication(id: string): Promise<IApplication> {
        const application: IApplication = await ApplicationModel.findById(id);
        if (!application) {
            throw new ApplicationNotFoundError();
        }
        return application;
    }
}
