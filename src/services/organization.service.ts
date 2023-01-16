import OrganizationModel, { CreateOrganizationsDto, IOrganization } from 'models/organization';
import { FilterQuery, PaginateDocument, PaginateOptions, PaginateResult } from 'mongoose';
import OrganizationNotFoundError from 'errors/organizationNotFound.error';
import { pick } from "lodash";
import ApplicationService from "services/application.service";
import { IApplication } from "models/application";

export default class OrganizationService {
    static async createOrganization(organizationData: Partial<CreateOrganizationsDto>): Promise<IOrganization> {
        const organization: Partial<IOrganization> = new OrganizationModel(pick(
            organizationData,
            [
                'name',
            ]
        ));

        if (Array.isArray(organizationData.applications) && organizationData.applications.length > 0) {
            const applications: IApplication[] = await ApplicationService.getApplications({ _id: { $in: organizationData.applications } })
            organization.applications = applications;
        }
        return organization.save();
    }

    static async updateOrganization(id: string, organizationData: Partial<IOrganization>): Promise<IOrganization> {
        const organization: IOrganization = await OrganizationService.getOrganizationById(id);

        organization.set(organizationData);
        organization.updatedAt = new Date();

        if (Array.isArray(organizationData.applications)) {
            const applications: IApplication[] = await ApplicationService.getApplications({ _id: { $in: organizationData.applications } })
            organization.applications = applications;
        }

        return organization.save();
    }

    static async deleteOrganization(id: string): Promise<IOrganization> {
        const organization: IOrganization = await OrganizationService.getOrganizationById(id);

        await organization.remove();

        return organization;
    }

    static async getOrganizations(query: FilterQuery<IOrganization>, paginationOptions: PaginateOptions): Promise<PaginateResult<PaginateDocument<IOrganization, unknown, PaginateOptions>>> {
        return OrganizationModel.paginate(query, { ...paginationOptions, populate: ['applications'] });
    }

    static async getOrganizationById(id: string): Promise<IOrganization> {
        const organization: IOrganization = await OrganizationModel.findById(id.toString()).populate('applications');
        if (!organization) {
            throw new OrganizationNotFoundError();
        }
        return organization;
    }
}
