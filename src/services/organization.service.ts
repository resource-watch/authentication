import OrganizationModel, { CreateOrganizationsDto, IOrganization, IOrganizationId } from 'models/organization';
import { FilterQuery, PaginateDocument, PaginateOptions, PaginateResult } from 'mongoose';
import OrganizationNotFoundError from 'errors/organizationNotFound.error';
import { pick } from "lodash";

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

        return organization.save();
    }

    static async updateOrganization(id: IOrganizationId, organizationData: Partial<CreateOrganizationsDto>): Promise<IOrganization> {
        const organization: IOrganization = await OrganizationService.getOrganizationById(id);

        if ('applications' in organizationData) {
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

        // if ('users' in organizationData && Array.isArray(organizationData.users) && organizationData.users.length > 0) {
        //     await organization.associateWithUsers(organizationData.users)
        // }

        return organization.save();
    }

    static async deleteOrganization(id: IOrganizationId): Promise<IOrganization> {
        const organization: IOrganization = await OrganizationService.getOrganizationById(id);

        const returnOrganization: IOrganization = await OrganizationModel.hydrate(organization.toObject()).hydrate();

        await organization.clearAssociations();

        await organization.remove();

        return returnOrganization;
    }

    static async getOrganizations(query: FilterQuery<IOrganization>, paginationOptions: PaginateOptions): Promise<PaginateResult<PaginateDocument<IOrganization, unknown, PaginateOptions>>> {
        const organizations: PaginateResult<PaginateDocument<IOrganization, unknown, PaginateOptions>> = await OrganizationModel.paginate(query, {
            ...paginationOptions,
            populate: ['applications', 'users']
        });

        organizations.docs = await Promise.all(organizations.docs.map((organization: IOrganization) => {
            return organization.hydrate();
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
