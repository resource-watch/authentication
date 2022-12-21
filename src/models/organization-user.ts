import type { Document, Schema as ISchema } from 'mongoose';
import { model, Schema, PaginateModel } from 'mongoose';
import paginate from 'mongoose-paginate-v2';
import { IOrganization } from 'models/organization';
import { IUser } from "services/okta.interfaces";

export interface IOrganizationUser extends Document {
    organization: IOrganization;
    user: IUser;
    role: string;
    createdAt: Date;
    updatedAt: Date;
}

export const OrganizationUser: ISchema<IOrganizationUser> = new Schema<IOrganizationUser>({
    organization: {
        type: Schema.Types.ObjectId,
        ref: "Organization"
    },
    user: {
        type: Schema.Types.ObjectId,
        ref: "User"
    },
    role: { type: String, trim: true, required: true },
    createdAt: { type: Date, required: true, default: Date.now },
    updatedAt: { type: Date, required: true, default: Date.now }
});

OrganizationUser.plugin(paginate);

interface OrganizationUserDocument extends Document, IOrganizationUser {
}

const OrganizationUserModel: PaginateModel<OrganizationUserDocument> = model<OrganizationUserDocument, PaginateModel<OrganizationUserDocument>>('OrganizationUser', OrganizationUser);

export default OrganizationUserModel;
