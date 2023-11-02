import type { Aggregate, Document, Schema as ISchema } from 'mongoose';
import {
    model,
    Schema,
    Model,
    PaginateOptions,
    AggregatePaginateResult,
    AggregatePaginateModel
} from 'mongoose';
import { IOrganization, IOrganizationId } from 'models/organization';
import { IUser, IUserLegacyId } from "services/okta.interfaces";
import { Id } from "types";
import OrganizationApplicationModel, { IOrganizationApplication } from "models/organization-application";
import ApplicationUserModel, { IApplicationUser } from "models/application-user";
import aggregatePaginate from "mongoose-aggregate-paginate-v2";
import logger from "logger";

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

interface ApplicationModel extends Model<IApplication, any, IApplicationMethods> {
    aggregatePaginate<T>(
        query?: Aggregate<T[]>,
        options?: PaginateOptions,
        callback?: (err: any, result: AggregatePaginateResult<T>) => void,
    ): Promise<AggregatePaginateResult<T>>;
}

export type CreateApplicationsDto = {
    name: string;
    organization: IOrganizationId;
    user: IUserLegacyId;
}

export type UpdateApplicationsDto = CreateApplicationsDto;

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
            logger.debug('[application.hydrate] - applicationUser', JSON.stringify(applicationUser));
            this.user = applicationUser ? await applicationUser.getUser() : null;

            const organizationApplication: IOrganizationApplication = await OrganizationApplicationModel.findOne({ application: this._id.toString() }).populate('organization');
            logger.debug('[application.hydrate] - organizationApplication', JSON.stringify(organizationApplication));
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

// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore
applicationSchema.plugin(aggregatePaginate);

interface ApplicationDocument extends Document<IApplicationId>, IApplication, IApplicationMethods {
}

const ApplicationModel: AggregatePaginateModel<ApplicationDocument> = model<ApplicationDocument, AggregatePaginateModel<ApplicationDocument>>('Application', applicationSchema);

export default ApplicationModel;
