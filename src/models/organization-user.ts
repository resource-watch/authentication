import type { Document, Schema as ISchema } from 'mongoose';
import { model, Schema, PaginateModel, Model } from 'mongoose';
import paginate from 'mongoose-paginate-v2';
import { IOrganization } from 'models/organization';
import { IUser, IUserLegacyId } from "services/okta.interfaces";
import OktaService from "services/okta.service";

export const ORGANIZATION_ROLES: Record<Role, Role> = {
    MEMBER: 'MEMBER',
    ADMIN: 'ADMIN',
}
export type Role = 'MEMBER' | 'ADMIN';

interface IOrganizationUserMethods {
    getUser(): Promise<IUser>
}

export interface IOrganizationUser extends Document, IOrganizationUserMethods {
    organization: IOrganization;
    userId: IUserLegacyId;
    user?: IUser;
    role: Role;
    createdAt: Date;
    updatedAt: Date;
}

type OrganizationUserModel = Model<IOrganizationUser, any, IOrganizationUserMethods>;

export const OrganizationUser: ISchema<IOrganizationUser, OrganizationUserModel, IOrganizationUserMethods> = new Schema<IOrganizationUser, OrganizationUserModel, IOrganizationUserMethods>({
    organization: {
        type: Schema.Types.ObjectId,
        ref: "Organization"
    },
    userId: { type: String, trim: true, required: true },
    role: { type: String, trim: true, required: true },
    createdAt: { type: Date, required: true, default: Date.now },
    updatedAt: { type: Date, required: true, default: Date.now }
}, {
    methods: {
        async getUser(): Promise<IUser> {
            return OktaService.convertOktaUserToIUser(await OktaService.getOktaUserById(this.userId));
        },
    }
});

OrganizationUser.plugin(paginate);

interface OrganizationUserDocument extends Document, IOrganizationUser {
}

const OrganizationUserModel: PaginateModel<OrganizationUserDocument> = model<OrganizationUserDocument, PaginateModel<OrganizationUserDocument>>('OrganizationUser', OrganizationUser);

export default OrganizationUserModel;
