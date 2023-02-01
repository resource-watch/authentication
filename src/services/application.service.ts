import ApplicationModel, { CreateApplicationsDto, IApplication, UpdateApplicationsDto } from 'models/application';
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

        if (applicationData.organization) {
            const organization: IOrganization = await OrganizationService.getOrganizationById(applicationData.organization)
            application.organization = organization;
        }

        const savedApplication: IApplication = await application.save();

        if (applicationData.organization) {
            const organization: IOrganization = await OrganizationService.getOrganizationById(applicationData.organization)
            organization.applications.push(savedApplication);
            await organization.save()
        }

        return savedApplication;
    }

    static async updateApplication(id: string, applicationData: Partial<UpdateApplicationsDto>, regenApiKey: boolean): Promise<IApplication> {
        const application: IApplication = await ApplicationService.getApplicationById(id);

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

        if ('organization' in applicationData) {
            if (application.organization) {
                const currentOrganization: IOrganization = await OrganizationService.getOrganizationById(application.organization.id)
                currentOrganization.applications = currentOrganization.applications.filter((orgApplication: IApplication) => {
                    return orgApplication.id !== application.id;
                });
                await currentOrganization.save();
            }

            if (applicationData.organization !== null) {
                const organization: IOrganization = await OrganizationService.getOrganizationById(applicationData.organization)
                application.organization = organization;
             } else {
                application.organization = null;
            }

        }

        const savedApplication: IApplication = await application.save();

        if (applicationData.organization) {
            const organization: IOrganization = await OrganizationService.getOrganizationById(applicationData.organization)
            organization.applications.push(savedApplication);
            await organization.save()
        }

        return savedApplication;
    }

    static async deleteApplication(id: string): Promise<IApplication> {
        const application: IApplication = await ApplicationService.getApplicationById(id);

        await APIGatewayAWSService.deleteApiKey(application.apiKeyId);

        if (application.organization) {
            const organization: IOrganization = await OrganizationService.getOrganizationById(application.organization.id)
            organization.applications = organization.applications.filter((orgApplication: IApplication) => {
                return orgApplication.id !== application.id;
            });
            await organization.save();
        }

        await application.remove();

        return application;
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

    static async getApplicationById(id: string): Promise<IApplication> {
        const application: IApplication = await ApplicationModel.findById(id.toString()).populate('organization');
        if (!application) {
            throw new ApplicationNotFoundError();
        }
        return application;
    }
}
