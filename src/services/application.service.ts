import ApplicationModel, {
    CreateApplicationsDto,
    IApplication,
    IApplicationId,
    UpdateApplicationsDto
} from 'models/application';
import {
    Aggregate, AggregatePaginateResult,
    FilterQuery,
    PaginateOptions,
    PipelineStage,
} from 'mongoose';
import ApplicationNotFoundError from 'errors/applicationNotFound.error';
import APIGatewayAWSService from "services/apigateway.aws.service";
import { CreateApiKeyCommandOutput } from "@aws-sdk/client-api-gateway";
import OrganizationService from "services/organization.service";
import organization, { IOrganization } from "models/organization";
import { pick } from "lodash";
import { IUser, IUserLegacyId } from "services/okta.interfaces";
import OktaService from "services/okta.service";
import PermissionError from "errors/permission.error";
import ApplicationOrphanedError from "errors/applicationOrphaned.error";

export default class ApplicationService {
    static async createApplication(applicationData: Partial<CreateApplicationsDto>, requestUser: IUser): Promise<IApplication> {
        if (!('user' in applicationData)) {
            applicationData.user = requestUser.id;
        }

        if (requestUser.role !== 'ADMIN' && 'user' in applicationData && applicationData.user !== null && applicationData.user !== requestUser.id) {
            throw new PermissionError('User can only create applications for themselves');
        }

        const apiKeyResponse: CreateApiKeyCommandOutput = await APIGatewayAWSService.createApiKey(applicationData.name);

        const application: Partial<IApplication> = new ApplicationModel({
            ...applicationData,
            apiKeyId: apiKeyResponse.id,
            apiKeyValue: apiKeyResponse.value,
        });

        if ('organization' in applicationData && applicationData.organization !== null) {
            const currentOrganization: IOrganization = await OrganizationService.getOrganizationById(applicationData.organization)
            await application.associateWithOrganization(currentOrganization);
        } else if ('user' in applicationData && applicationData.user !== null) {
            const user: IUser = await OktaService.getUserById(applicationData.user as IUserLegacyId);
            await application.associateWithUser(user);
        } else {
            throw new Error('Application must be associated with either an user or an organization');
        }

        return application.save();
    }

    static async updateApplication(id: IApplicationId, applicationData: Partial<UpdateApplicationsDto>, regenApiKey: boolean): Promise<IApplication> {
        const application: IApplication = await ApplicationService.getApplicationById(id);

        if ('organization' in applicationData || 'user' in applicationData) {
            let futureOrganization: IOrganization
            let futureUser: IUser
            if ('organization' in applicationData) {
                futureOrganization = await OrganizationService.getOrganizationById(applicationData.organization)
            } else {
                futureOrganization = application.organization;
            }
            if ('user' in applicationData) {
                futureUser = await OktaService.getUserById(applicationData.user as IUserLegacyId);
            } else {
                futureUser = application.user;
            }
            if (!futureOrganization && !futureUser) {
                throw new ApplicationOrphanedError();
            }
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

        if ('user' in applicationData && applicationData.user !== null) {
            const user: IUser = await OktaService.getUserById(applicationData.user as IUserLegacyId);
            await application.associateWithUser(user);
        }

        return application.save();
    }

    static async deleteApplication(id: string): Promise<IApplication> {
        const application: IApplication = await ApplicationService.getApplicationById(id);
        const returnApplication: IApplication = await ApplicationModel.hydrate(application);

        await APIGatewayAWSService.deleteApiKey(application.apiKeyId);

        await application.clearAssociations();

        await application.remove();

        return returnApplication;
    }

    static async getPaginatedApplications(query: FilterQuery<IApplication>, paginationOptions: PaginateOptions, loggedUserId: IUserLegacyId = null): Promise<AggregatePaginateResult<IApplication>> {

        let aggregateCriteria: PipelineStage[] = [
            { $match: query },
        ];

        if (loggedUserId !== null) {
            aggregateCriteria = aggregateCriteria.concat([
                {
                    $lookup: {
                        from: "applicationusers",
                        localField: "_id",
                        foreignField: "application",
                        as: "applicationusers"
                    }
                },
                { $unwind: "$applicationusers" },
                {
                    $match: {
                        "applicationusers.userId": loggedUserId
                    }
                }]);
        }

        const aggregate: Aggregate<Array<any>> = ApplicationModel.aggregate(aggregateCriteria)

        const applications: AggregatePaginateResult<IApplication> = await ApplicationModel.aggregatePaginate(aggregate, {
            ...paginationOptions,
            populate: ['organization', 'user'],
        });

        applications.docs = await Promise.all(applications.docs.map((application: IApplication) => {
            return (new ApplicationModel(application)).hydrate();
        }));

        return applications;
    }

    static async getApplicationById(id: IApplicationId): Promise<IApplication> {
        let application: IApplication = await ApplicationModel.findById(id.toString());
        if (!application) {
            throw new ApplicationNotFoundError();
        }

        application = await ApplicationModel.hydrate(application.toObject()).hydrate();

        return application;
    }
}
