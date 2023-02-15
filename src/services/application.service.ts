import ApplicationModel, {
    CreateApplicationsDto,
    IApplication,
    IApplicationId,
    UpdateApplicationsDto
} from 'models/application';
import { FilterQuery, PaginateDocument, PaginateOptions, PaginateResult } from 'mongoose';
import ApplicationNotFoundError from 'errors/applicationNotFound.error';
import APIGatewayAWSService from "services/apigateway.aws.service";
import { CreateApiKeyCommandOutput } from "@aws-sdk/client-api-gateway";
import OrganizationService from "services/organization.service";
import { IOrganization } from "models/organization";
import { pick } from "lodash";

export default class ApplicationService {
    static async createApplication(applicationData: Partial<CreateApplicationsDto>): Promise<IApplication> {
        const apiKeyResponse: CreateApiKeyCommandOutput = await APIGatewayAWSService.createApiKey(applicationData.name);

        const application: Partial<IApplication> = new ApplicationModel({
            ...applicationData,
            apiKeyId: apiKeyResponse.id,
            apiKeyValue: apiKeyResponse.value,
        });

        if ('organization' in applicationData && applicationData.organization !== null) {
            const currentOrganization: IOrganization = await OrganizationService.getOrganizationById(applicationData.organization)
            await application.associateWithOrganization(currentOrganization);
        }

        return application.save();
    }

    static async updateApplication(id: IApplicationId, applicationData: Partial<UpdateApplicationsDto>, regenApiKey: boolean): Promise<IApplication> {
        const application: IApplication = await ApplicationService.getApplicationById(id);

        if ('organization' in applicationData || 'user' in applicationData) {
            await application.clearAssociations();
        }

        application.set(pick(applicationData, ['name']));
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

        if ('organization' in applicationData && applicationData.organization !== null) {
            const currentOrganization: IOrganization = await OrganizationService.getOrganizationById(applicationData.organization)
            await application.associateWithOrganization(currentOrganization);
        }

        return application.save();
    }

    static async deleteApplication(id: string): Promise<IApplication> {
        const application: IApplication = await ApplicationService.getApplicationById(id);

        const returnApplication:IApplication = ApplicationModel.hydrate(application.toObject())
        returnApplication.organization = application.organization;

        await APIGatewayAWSService.deleteApiKey(application.apiKeyId);

        await application.clearAssociations();

        await application.remove();

        return returnApplication;
    }

    static async getApplications(query: FilterQuery<IApplication>): Promise<IApplication[]> {
        return ApplicationModel.find(query);
    }

    static async getPaginatedApplications(query: FilterQuery<IApplication>, paginationOptions: PaginateOptions): Promise<PaginateResult<PaginateDocument<IApplication, unknown, PaginateOptions>>> {
        const applications: PaginateResult<PaginateDocument<IApplication, unknown, PaginateOptions>> = await ApplicationModel.paginate(query, {
            ...paginationOptions,
            populate: ['organization']
        });
        return applications;
    }

    static async getApplicationById(id: IApplicationId): Promise<IApplication> {
        const application: IApplication = await ApplicationModel.findById(id.toString()).populate('organization');
        if (!application) {
            throw new ApplicationNotFoundError();
        }
        return application;
    }
}
