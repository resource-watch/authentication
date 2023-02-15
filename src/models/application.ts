import type { Document, Schema as ISchema } from 'mongoose';
import { model, Schema, PaginateModel, Model } from 'mongoose';
import paginate from 'mongoose-paginate-v2';
import OrganizationModel, { IOrganization, IOrganizationId } from 'models/organization';
import { IUser } from "services/okta.interfaces";
import { UserModelStub } from "models/user.model.stub";
import { Id } from "types";

interface IApplicationMethods {
    clearAssociations(): Promise<IApplication>

    associateWithOrganization(organization: IOrganization): Promise<IApplication>

    associateWithUser(user: IUser): Promise<IApplication>
}

export type IApplicationId = Id<IApplication>;

export interface IApplication extends Document<IApplicationId>, IApplicationMethods {
    name: string;
    apiKeyId: string;
    apiKeyValue: string;
    organization?: IOrganization;
    userId?: string;
    createdAt: Date;
    updatedAt: Date;
}

export type CreateApplicationsDto = {
    name: string;
    organization: string;
}

export type UpdateApplicationsDto = CreateApplicationsDto;

type ApplicationModel = Model<IApplication, any, IApplicationMethods>;

export const applicationSchema: ISchema<IApplication, ApplicationModel, IApplicationMethods> = new Schema<IApplication, ApplicationModel, IApplicationMethods>({
    name: { type: String, trim: true, required: true },
    apiKeyId: { type: String, trim: true, required: true },
    apiKeyValue: { type: String, trim: true, required: true },
    organization: {
        type: Schema.Types.ObjectId,
        ref: "Organization"
    },
    userId: {
        type: Schema.Types.String,
        ref: "User"
    },
    createdAt: { type: Date, required: true, default: Date.now },
    updatedAt: { type: Date, required: true, default: Date.now }
}, {
    methods: {
        async clearAssociations(): Promise<IApplication> {
            if (this.userId) {
                await UserModelStub.removeApplicationLinkForUser(this.userId, this._id.toString());
                this.userId = null;
            }

            if (this.organization) {
                await OrganizationModel.removeLinksToApplications([this._id.toString()]);
                this.organization = null;
            }

            return this.save();
        },
        async associateWithUser(user: IUser): Promise<IApplication> {
            if (this.organization) {
                await OrganizationModel.removeLinksToApplications([this._id.toString()]);
                await ApplicationModel.removeLinksToOrganization(this.organization._id.toString());
            }

            this.userId = user.id

            return this.save();
        },
        async associateWithOrganization(organization: IOrganization): Promise<IApplication> {
            await ApplicationModel.removeLinksToOrganization(organization.id);
            await OrganizationModel.removeLinksToApplications([this]);
            //TODO: remove on User's end

            this.organization = organization;
            this.userId = null;
            organization.applications.push(this);
            await organization.save();

            return this.save();
        },

    },
    statics: {
        async removeLinksToUser(user: IUser): Promise<any> {
            if (!user) {
                return [];
            }

            const applications: IApplication[] = await this.find({ user: user._id });
            return Promise.all(applications.map((application: IApplication) => {
                application.userId = null;
                return application.save();
            }));
        },
        async removeLinksToOrganization(organizationId: IOrganizationId): Promise<IApplication[]> {
            if (!organizationId) {
                return [];
            }

            const applications: IApplication[] = await this.find({ organization: organizationId });
            return Promise.all(applications.map((application: IApplication) => {
                application.organization = null;
                return application.save();
            }));
        }
    }
});

// eslint-disable-next-line @typescript-eslint/ban-types
interface ApplicationPaginateModel<T, TQueryHelpers = {}, TMethods = {}>
    extends PaginateModel<T, TQueryHelpers, TMethods> {
    removeLinksToUser: (user: IUser) => Promise<any>
    removeLinksToOrganization: (organizationId: IOrganizationId) => Promise<IApplication[]>
}

applicationSchema.plugin(paginate);

interface ApplicationDocument extends Document<IApplicationId>, IApplication, IApplicationMethods {
}

const ApplicationModel: ApplicationPaginateModel<ApplicationDocument, ApplicationModel, IApplicationMethods> = model<ApplicationDocument, ApplicationPaginateModel<ApplicationDocument, ApplicationModel, IApplicationMethods>>('Application', applicationSchema);

export default ApplicationModel;
