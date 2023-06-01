import OrganizationModel, {
    CreateOrganizationsDto,
    IOrganization,
    IOrganizationId,
} from 'models/organization';
import {
    Aggregate,
    AggregatePaginateResult,
    FilterQuery,
    PaginateOptions,
    PipelineStage
} from 'mongoose';
import OrganizationNotFoundError from 'errors/organizationNotFound.error';
import { pick } from "lodash";
import { IUser, IUserLegacyId } from "services/okta.interfaces";
import ApplicationModel, { IApplication, IApplicationId } from "models/application";
import PermissionError from "errors/permission.error";

export default class OrganizationService {
    static async createOrganization(organizationData: Partial<CreateOrganizationsDto>): Promise<IOrganization> {
        const organization: Partial<IOrganization> = new OrganizationModel(pick(
            organizationData,
            [
                'name',
            ]
        ));

        if ('applications' in organizationData && Array.isArray(organizationData.applications) && organizationData.applications.length > 0) {
            await organization.associateWithApplicationIds(organizationData.applications)
        }

        if ('users' in organizationData && Array.isArray(organizationData.users) && organizationData.users.length > 0) {
            await organization.associateWithUsers(organizationData.users)
        }

        return organization.save();
    }

    static async updateOrganization(id: IOrganizationId, organizationData: Partial<CreateOrganizationsDto>, requestUser: IUser): Promise<IOrganization> {
        const organization: IOrganization = await OrganizationService.getOrganizationById(id);

        if ('applications' in organizationData) {
            if (requestUser.role !== 'ADMIN') {
                await Promise.all(organizationData.applications.map(async (applicationId: IApplicationId) => {
                    let application: IApplication = await ApplicationModel.findById(applicationId);
                    application = await ApplicationModel.hydrate(application.toObject()).hydrate();

                    const canAssociateWithOrg: boolean = application.user?.id === requestUser.id || application.organization?.id === organization.id;

                    if (!canAssociateWithOrg) {
                        throw new PermissionError(`You don't have permissions to associate application ${application.name} with organization ${organization.name}`);
                    }
                }));
            }
            await organization.clearApplicationAssociations();
        }
        if ('users' in organizationData) {
            await organization.clearUserAssociations();
        }

        organization.set(pick(organizationData, ['name']));
        organization.updatedAt = new Date();

        if ('applications' in organizationData && Array.isArray(organizationData.applications) && organizationData.applications.length > 0) {
            await organization.associateWithApplicationIds(organizationData.applications)
        }

        if ('users' in organizationData && Array.isArray(organizationData.users) && organizationData.users.length > 0) {
            await organization.associateWithUsers(organizationData.users)
        }

        return organization.save();
    }

    static async deleteOrganization(id: IOrganizationId): Promise<IOrganization> {
        const organization: IOrganization = await OrganizationService.getOrganizationById(id);

        const returnOrganization: IOrganization = await OrganizationModel.hydrate(organization.toObject()).hydrate();

        await organization.clearAssociations();

        await organization.deleteOne();

        return returnOrganization;
    }

    static async getPaginatedOrganizations(query: FilterQuery<IOrganization>, paginationOptions: PaginateOptions, loggedUserId: IUserLegacyId = null): Promise<AggregatePaginateResult<IOrganization>> {
        let aggregateCriteria: PipelineStage[] = [
            { $match: query },
        ];

        if (loggedUserId !== null) {
            aggregateCriteria = aggregateCriteria.concat([
                {
                    $lookup: {
                        from: "organizationusers",
                        localField: "_id",
                        foreignField: "organization",
                        as: "organizationusers"
                    }
                },
                { $unwind: "$organizationusers" },
                {
                    $match: {
                        "organizationusers.userId": loggedUserId
                    }
                }]);
        }

        const aggregate: Aggregate<Array<any>> = OrganizationModel.aggregate(aggregateCriteria)

        const organizations: AggregatePaginateResult<IOrganization> = await OrganizationModel.aggregatePaginate(aggregate, {
            ...paginationOptions,
            useFacet: false,
            populate: ['applications', 'users'],
        });

        organizations.docs = await Promise.all(organizations.docs.map((organization: IOrganization) => {
            return (new OrganizationModel(organization)).hydrate();
        }));

        return organizations;
    }

    static async getOrganizations(query: FilterQuery<IOrganization>, loggedUserId: IUserLegacyId = null): Promise<Array<IOrganization>> {
        let aggregateCriteria: PipelineStage[] = [
            { $match: query },
        ];

        if (loggedUserId !== null) {
            aggregateCriteria = aggregateCriteria.concat([
                {
                    $lookup: {
                        from: "organizationusers",
                        localField: "_id",
                        foreignField: "organization",
                        as: "organizationusers"
                    }
                },
                { $unwind: "$organizationusers" },
                {
                    $match: {
                        "organizationusers.userId": loggedUserId
                    }
                }]);
        }

        let organizations: Array<IOrganization> = await OrganizationModel.aggregate(aggregateCriteria).exec();

        organizations = await Promise.all(organizations.map((organization: IOrganization) => {
            return (new OrganizationModel(organization)).hydrate();
        }));

        return organizations;
    }

    static async getOrganizationById(id: IOrganizationId): Promise<IOrganization> {
        const organization: IOrganization = await OrganizationModel.findById(id.toString());
        if (!organization) {
            throw new OrganizationNotFoundError();
        }
        return organization;
    }
}
