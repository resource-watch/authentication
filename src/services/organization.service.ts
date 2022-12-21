import OrganizationModel, { IOrganization } from 'models/organization';
import { FilterQuery, PaginateDocument, PaginateOptions, PaginateResult } from 'mongoose';
import OrganizationNotFoundError from 'errors/organizationNotFound.error';

export default class OrganizationService {
    static async createOrganization(organizationData: Partial<IOrganization>): Promise<IOrganization> {
        const organization: Partial<IOrganization> = new OrganizationModel(organizationData);
        return organization.save();
    }

    static async updateOrganization(id: string, organizationData: Partial<IOrganization>): Promise<IOrganization> {
        const organization: IOrganization = await OrganizationService.getOrganizationById(id);

        organization.set(organizationData);
        organization.updatedAt = new Date();


        return organization.save();
    }

    static async deleteOrganization(id: string): Promise<IOrganization> {
        const organization: IOrganization = await OrganizationService.getOrganizationById(id);

        await organization.remove();

        return organization;
    }

    static async getOrganizations(query: FilterQuery<IOrganization>, paginationOptions: PaginateOptions): Promise<PaginateResult<PaginateDocument<IOrganization, unknown, PaginateOptions>>> {
        return OrganizationModel.paginate(query, paginationOptions);
    }

    static async getOrganizationById(id: string): Promise<IOrganization> {
        const organization: IOrganization = await OrganizationModel.findById(id.toString());
        if (!organization) {
            throw new OrganizationNotFoundError();
        }
        return organization;
    }
}
