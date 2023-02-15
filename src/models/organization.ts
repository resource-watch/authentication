import type { Document, Schema as ISchema, Model } from 'mongoose';
import { model, Schema, PaginateModel } from 'mongoose';
import paginate from 'mongoose-paginate-v2';
import ApplicationModel, { IApplication, IApplicationId } from 'models/application';
import OrganizationUserModel, { IOrganizationUser } from "models/organization-user";
import { IUser } from "services/okta.interfaces";
import { Id } from "types";
import ApplicationService from "services/application.service";

interface IOrganizationMethods {
    clearAssociations(): Promise<IOrganization>

    associateWithApplications(applicationIds: IApplicationId[]): Promise<IOrganization>

    associateWithUser(user: IUser): IOrganization
}

export type IOrganizationId = Id<IOrganization>;

export interface IOrganization extends Document<IOrganizationId>, IOrganizationMethods {
    name: string;
    applications: IApplication[];
    users: IOrganizationUser[];
    createdAt: Date;
    updatedAt: Date;
}

export type CreateOrganizationsDto = {
    name: string;
    applications: IApplicationId[];
}

type OrganizationModel = Model<IOrganization, any, IOrganizationMethods>;

export const organizationSchema: ISchema<IOrganization, OrganizationModel, IOrganizationMethods> = new Schema<IOrganization, OrganizationModel, IOrganizationMethods>({
    name: { type: String, trim: true, required: true },
    applications: [{
        type: Schema.Types.ObjectId,
        ref: "Application"
    }],
    users: [{
        type: Schema.Types.ObjectId,
        ref: "OrganizationUser"
    }],
    createdAt: { type: Date, required: true, default: Date.now },
    updatedAt: { type: Date, required: true, default: Date.now }
}, {
    methods: {
        async clearAssociations(): Promise<IOrganization> {
            if (this.applications) {
                await ApplicationModel.removeLinksToOrganization(this._id.toString());
                this.applications = [];
            }

            if (this.users) {
                await OrganizationUserModel.deleteMany({ organization: this._id.toString() });
                this.users = []
            }

            return this.save();
        },
        async associateWithUser(user: IUser): Promise<IOrganization> {
            if (!this.users) {
                this.users = [];
            }
            this.users.push(new OrganizationUserModel({ user }));
            return this.save();
        },
        async associateWithApplications(applicationIds: IApplicationId[]): Promise<IOrganization> {
            await ApplicationModel.removeLinksToOrganization(this);
            await OrganizationModel.removeLinksToApplications(applicationIds);

            const applications: IApplication[] = await ApplicationService.getApplications({ _id: { $in: applicationIds } })

            await Promise.all(applications.map((application: IApplication) => {
                if (this.applications.filter((orgApplication: IApplication) => {
                    return orgApplication.id === application.id;
                }).length === 0) {
                    this.applications.push(application);
                }

                application.userId = null;
                application.organization = this;
                return application.save()
            }));
            return this.save();
        }
    },
    statics: {
        async removeLinksToUser(user: IUser): Promise<any> {
            if (!user) {
                return
            }

            return OrganizationUserModel.deleteMany({ user: user._id });
        },
        async removeLinksToApplications(applicationIds: IApplicationId[]): Promise<IOrganization[]> {
            const organizations: IOrganization[] = await this.find({ applications: { $in: applicationIds } });
            if (!organizations) {
                return []
            }
            return Promise.all(organizations.map((organization: IOrganization) => {
                organization.applications = organization.applications.filter((orgApplication: IApplication) => {
                    return !applicationIds.includes(orgApplication._id.toString());
                });
                return organization.save();
            }));
        }
    }
});

// eslint-disable-next-line @typescript-eslint/ban-types
interface OrganizationPaginateModel<T, TQueryHelpers = {}, TMethods = {}>
    extends PaginateModel<T, TQueryHelpers, TMethods> {
    removeLinksToUser: (user: IUser) => Promise<any>
    removeLinksToApplications: (applicationIds: IApplicationId[]) => Promise<IOrganization[]>
}

organizationSchema.plugin(paginate);

interface OrganizationDocument extends Document<IOrganizationId>, IOrganization, IOrganizationMethods {
}

const OrganizationModel: OrganizationPaginateModel<OrganizationDocument, OrganizationModel, IOrganizationMethods> = model<OrganizationDocument, OrganizationPaginateModel<OrganizationDocument, OrganizationModel, IOrganizationMethods>>('Organization', organizationSchema);

export default OrganizationModel;
