import type { Document, Schema as ISchema } from 'mongoose';
import { model, Schema, PaginateModel } from 'mongoose';
import paginate from 'mongoose-paginate-v2';
import { IOrganization } from 'models/organization';

export interface IApplication extends Document {
    name: string;
    apiKeyId: string;
    apiKeyValue: string;
    organization: IOrganization
    createdAt: Date;
    updatedAt: Date;
}

export const Application: ISchema<IApplication> = new Schema<IApplication>({
    name: { type: String, trim: true, required: true },
    apiKeyId: { type: String, trim: true, required: true },
    apiKeyValue: { type: String, trim: true, required: true },
    organization: {
        type: Schema.Types.ObjectId,
        ref: "Organization"
    },
    createdAt: { type: Date, required: true, default: Date.now },
    updatedAt: { type: Date, required: true, default: Date.now }
});

Application.plugin(paginate);

interface ApplicationDocument extends Document, IApplication {
}

const ApplicationModel: PaginateModel<ApplicationDocument> = model<ApplicationDocument, PaginateModel<ApplicationDocument>>('Application', Application);

export default ApplicationModel;
