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

        const savedOrganization: IOrganization = await organization.save();

        if (Array.isArray(organizationData.applications) && organizationData.applications.length > 0) {
            const applications: IApplication[] = await ApplicationService.getApplications({ _id: { $in: organizationData.applications } })
            await Promise.all(applications.map((application: IApplication) => {
                    application.organization = savedOrganization;
                    return application.save();
                }
            ));
        }

        return savedOrganization;
    }

    static async updateOrganization(id: string, organizationData: Partial<IOrganization>): Promise<IOrganization> {
        const organization: IOrganization = await OrganizationService.getOrganizationById(id);

        organization.set(pick(organizationData, ['name']));
        organization.updatedAt = new Date();

        if ('applications' in organizationData) {
            if (organization.applications) {
                const currentApplications: IApplication[] = await ApplicationService.getApplications({ _id: { $in: organization.applications.map((currentApplication: IApplication) => currentApplication.id) } });
                await Promise.all(currentApplications.map((currentApplication: IApplication) => {
                    currentApplication.organization = null;
                    return currentApplication.save();
                }));
            }

            if (organizationData.applications.length > 0) {
                const applications: IApplication[] = await ApplicationService.getApplications({ _id: { $in: organizationData.applications } })
                organization.applications = applications;
            } else {
                organization.applications = [];
            }
        }

        const savedOrganization: IOrganization = await organization.save();

        if (Array.isArray(organizationData.applications) && organizationData.applications.length > 0) {
            const applications: IApplication[] = await ApplicationService.getApplications({ _id: { $in: organizationData.applications } })
            await Promise.all(applications.map((application: IApplication) => {
                    application.organization = savedOrganization;
                    return application.save();
                }
            ));
        }

        return savedOrganization;

    }

    static async deleteOrganization(id: string): Promise<IOrganization> {
        const organization: IOrganization = await OrganizationService.getOrganizationById(id);

        if (organization.applications) {
            const applications: IApplication[] = await ApplicationService.getApplications({ _id: { $in: organization.applications } })
            await Promise.all(applications.map((application: IApplication) => {
                application.organization = null;
                return application.save()
            }))
        }

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
