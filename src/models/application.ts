import type { Document, Schema as ISchema } from 'mongoose';
import { model, Schema, PaginateModel, Model } from 'mongoose';
import paginate from 'mongoose-paginate-v2';
import { IOrganization } from 'models/organization';
import { IUser } from "services/okta.interfaces";
import { Id } from "types";
import OrganizationApplicationModel, { IOrganizationApplication } from "models/organization-application";
import ApplicationUserModel, { IApplicationUser } from "models/application-user";

interface IApplicationMethods {
    hydrate(): Promise<(IApplication & Required<{ _id: IApplicationId }>)>

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
    user?: IUser;
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
    createdAt: { type: Date, required: true, default: Date.now },
    updatedAt: { type: Date, required: true, default: Date.now }
}, {
    virtuals: {
        organization: {
            options: {
                ref: 'OrganizationApplication',
                localField: '_id',
                foreignField: 'application',
                justOne: true
            },
        },
        user: {
            options: {
                ref: 'ApplicationUser',
                localField: '_id',
                foreignField: 'application',
                justOne: true
            },
        },
    },
    methods: {
        async hydrate(): Promise<(IApplication & Required<{ _id: IApplicationId }>)> {
            const applicationUser: IApplicationUser = await ApplicationUserModel.findOne({ application: this._id.toString() });
            this.user = applicationUser ? await applicationUser.getUser() : null;

            const organizationApplication: IOrganizationApplication = await OrganizationApplicationModel.findOne({ application: this._id.toString() }).populate('organization');
            this.organization = organizationApplication ? organizationApplication.organization : null;

            return this;
        },
        async clearAssociations(): Promise<IApplication> {
            await ApplicationUserModel.deleteMany({ application: this._id.toString() })
            await OrganizationApplicationModel.deleteMany({ application: this._id.toString() })

            return this;
        },
        async associateWithUser(user: IUser): Promise<IApplication> {
            await this.clearAssociations();

            await new ApplicationUserModel({ application: this._id.toString(), userId: user.id }).save();

            return this;
        },
        async associateWithOrganization(organization: IOrganization): Promise<IApplication> {
            await this.clearAssociations();

            await new OrganizationApplicationModel({ application: this._id.toString(), organization }).save();

            return this;
        },
    },
});

applicationSchema.plugin(paginate);

interface ApplicationDocument extends Document<IApplicationId>, IApplication, IApplicationMethods {
}

const ApplicationModel: PaginateModel<ApplicationDocument, ApplicationModel, IApplicationMethods> = model<ApplicationDocument, PaginateModel<ApplicationDocument, ApplicationModel, IApplicationMethods>>('Application', applicationSchema);

export default ApplicationModel;
