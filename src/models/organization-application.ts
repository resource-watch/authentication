import type { Document, Schema as ISchema } from 'mongoose';
import { model, Schema, PaginateModel } from 'mongoose';
import paginate from 'mongoose-paginate-v2';
import { IOrganization } from 'models/organization';
import { IApplication } from "models/application";

export interface IOrganizationApplication extends Document {
    organization: IOrganization;
    application: IApplication;
    createdAt: Date;
    updatedAt: Date;
}

export const OrganizationApplication: ISchema<IOrganizationApplication> = new Schema<IOrganizationApplication>({
        organization: {
            type: Schema.Types.ObjectId,
            ref: "Organization"
        },
        application: {
            type: Schema.Types.ObjectId,
            ref: "Application"
        },
        createdAt: { type: Date, required: true, default: Date.now },
        updatedAt: { type: Date, required: true, default: Date.now }
    }
);

OrganizationApplication.plugin(paginate);

interface OrganizationApplicationDocument extends Document, IOrganizationApplication {
}

const OrganizationApplicationModel: PaginateModel<OrganizationApplicationDocument> = model<OrganizationApplicationDocument, PaginateModel<OrganizationApplicationDocument>>('OrganizationApplication', OrganizationApplication);

export default OrganizationApplicationModel;
