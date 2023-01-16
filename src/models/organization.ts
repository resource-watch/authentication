import type { Document, Schema as ISchema } from 'mongoose';
import { model, Schema, PaginateModel } from 'mongoose';
import paginate from 'mongoose-paginate-v2';
import { IApplication } from 'models/application';
import { IOrganizationUser } from "models/organization-user";

export interface IOrganization extends Document {
    name: string;
    applications: IApplication[];
    users: IOrganizationUser[];
    createdAt: Date;
    updatedAt: Date;
}

export type CreateOrganizationsDto = {
    name: string;
    applications: string[];
}

export const Organization: ISchema<IOrganization> = new Schema<IOrganization>({
    name: { type: String, trim: true, required: true },
    applications:[{
        type: Schema.Types.ObjectId,
        ref: "Application"
    }],
    users:[{
        type: Schema.Types.ObjectId,
        ref: "OrganizationUser"
    }],
    createdAt: { type: Date, required: true, default: Date.now },
    updatedAt: { type: Date, required: true, default: Date.now }
});

Organization.plugin(paginate);

interface OrganizationDocument extends Document, IOrganization {}

const OrganizationModel: PaginateModel<OrganizationDocument> = model<OrganizationDocument, PaginateModel<OrganizationDocument>>('Organization', Organization);

export default OrganizationModel;
