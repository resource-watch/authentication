import type { Document, Schema as ISchema, Model } from 'mongoose';
import { model, Schema, AggregatePaginateModel } from 'mongoose';
import ApplicationModel, { IApplication, IApplicationId } from 'models/application';
import OrganizationUserModel, { IOrganizationUser, Role } from "models/organization-user";
import { IUserLegacyId } from "services/okta.interfaces";
import { Id } from "types";
import OrganizationApplicationModel, { IOrganizationApplication } from "models/organization-application";
import { UserModelStub } from "models/user.model.stub";
import aggregatePaginate from "mongoose-aggregate-paginate-v2";

interface IOrganizationMethods {
    hydrate(): Promise<(IOrganization & Required<{ _id: IOrganizationId }>)>

    clearAssociations(): Promise<IOrganization>

    clearUserAssociations(): Promise<IOrganization>

    clearApplicationAssociations(): Promise<IOrganization>

    associateWithApplicationIds(applicationIds: IApplicationId[]): Promise<IOrganization>

    associateWithUsers(userLinksInOrganization: UserLinkInOrganizationDto[]): IOrganization
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
    users: UserLinkInOrganizationDto[];
}

export type UserLinkInOrganizationDto = {
    id: IUserLegacyId, role: Role
}

type OrganizationModel = Model<IOrganization, any, IOrganizationMethods>;

export const organizationSchema: ISchema<IOrganization, OrganizationModel, IOrganizationMethods> = new Schema<IOrganization, OrganizationModel, IOrganizationMethods>({
    name: { type: String, trim: true, required: true },
    createdAt: { type: Date, required: true, default: Date.now },
    updatedAt: { type: Date, required: true, default: Date.now }
}, {
    virtuals: {
        applications: {
            options: {
                ref: 'OrganizationApplication',
                localField: '_id',
                foreignField: 'organization',
                justOne: false
            },
        },
        users: {
            options: {
                ref: 'OrganizationUser',
                localField: '_id',
                foreignField: 'organization',
                justOne: false
            },
        },
    },
    methods: {
        async hydrate(): Promise<(IOrganization & Required<{ _id: IOrganizationId }>)> {
            const organizationUsers: IOrganizationUser[] = await OrganizationUserModel.find({ organization: this._id.toString() });
            this.users = organizationUsers ? await Promise.all(organizationUsers.map(async (organizationUser: IOrganizationUser) => {
                organizationUser.user = await organizationUser.getUser();
                return organizationUser;
            })) : null;

            const organizationApplications: IOrganizationApplication[] = await OrganizationApplicationModel.find({ organization: this._id.toString() }).populate('application');
            this.applications = organizationApplications ? organizationApplications.map((organizationApplication: IOrganizationApplication) => (organizationApplication.application)) : null;

            return this;
        },
        async clearAssociations(): Promise<IOrganization> {
            await OrganizationUserModel.deleteMany({ organization: this._id.toString() })
            await OrganizationApplicationModel.deleteMany({ organization: this._id.toString() })

            return this.save();
        },
        async clearUserAssociations(): Promise<IOrganization> {
            await OrganizationUserModel.deleteMany({ organization: this._id.toString() })

            return this.save();
        },
        async clearApplicationAssociations(): Promise<IOrganization> {
            await OrganizationApplicationModel.deleteMany({ organization: this._id.toString() })

            return this.save();
        },
        async associateWithUsers(userLinksInOrganization: UserLinkInOrganizationDto[]): Promise<IOrganization> {
            await Promise.all(userLinksInOrganization.map(async (userLinkInOrganization: UserLinkInOrganizationDto) => {
                await UserModelStub.clearOrganizationAssociations(userLinkInOrganization.id);

                return new OrganizationUserModel({
                    organization: this._id.toString(),
                    userId: userLinkInOrganization.id,
                    role: userLinkInOrganization.role
                }).save();

            }));

            return this;
        },
        async associateWithApplicationIds(applicationIds: IApplicationId[]): Promise<IOrganization> {
            await Promise.all(applicationIds.map(async (applicationId: IApplicationId) => {
                const application: IApplication = await ApplicationModel.findById(applicationId);
                await application.clearAssociations();

                return new OrganizationApplicationModel({ organization: this._id.toString(), application }).save();
            }));

            return this;
        }
    }
});

organizationSchema.plugin(aggregatePaginate);

interface OrganizationDocument extends Document<IOrganizationId>, IOrganization, IOrganizationMethods {
}

const OrganizationModel: AggregatePaginateModel<OrganizationDocument> = model<OrganizationDocument, AggregatePaginateModel<OrganizationDocument>>('Organization', organizationSchema);

export default OrganizationModel;
