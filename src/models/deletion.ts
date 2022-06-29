import type { Document, Schema as ISchema } from 'mongoose';
import { model, Schema, PaginateModel } from 'mongoose';
import paginate from 'mongoose-paginate-v2';

/**
 * Deletion statuses
 * Pending: Request for deletion received, but some/all user resources have not been deleted
 * done: Request for deletion received and all user resources were deleted successfully
 */
export type DELETION_STATUS_TYPE = 'pending' | 'done';
export const DELETION_STATUS: DELETION_STATUS_TYPE[] = ['pending', 'done'];

export interface IDeletion extends Document {
    userId: string;
    requestorUserId: string;
    status: DELETION_STATUS_TYPE;
    datasetsDeleted?: boolean;
    layersDeleted?: boolean;
    widgetsDeleted?: boolean;
    userAccountDeleted?: boolean;
    userDataDeleted?: boolean;
    graphDataDeleted?: boolean;
    collectionsDeleted?: boolean;
    favouritesDeleted?: boolean;
    vocabulariesDeleted?: boolean;
    areasDeleted?: boolean;
    storiesDeleted?: boolean;
    subscriptionsDeleted?: boolean;
    dashboardsDeleted?: boolean;
    profilesDeleted?: boolean;
    topicsDeleted?: boolean;
    createdAt: Date;
    updatedAt: Date;
}

export const Deletion: ISchema<IDeletion> = new Schema<IDeletion>({
    userId: { type: String, trim: true, required: true },
    requestorUserId: { type: String, trim: true, required: true },
    status: {
        type: String, enum: DELETION_STATUS, required: true, default: 'pending', trim: true
    },
    datasetsDeleted: { type: Boolean, required: false, default: false },
    layersDeleted: { type: Boolean, required: false, default: false },
    widgetsDeleted: { type: Boolean, required: false, default: false },
    userAccountDeleted: { type: Boolean, required: false, default: false },
    userDataDeleted: { type: Boolean, required: false, default: false },
    graphDataDeleted: { type: Boolean, required: false, default: false },
    collectionsDeleted: { type: Boolean, required: false, default: false },
    favouritesDeleted: { type: Boolean, required: false, default: false },
    vocabulariesDeleted: { type: Boolean, required: false, default: false },
    areasDeleted: { type: Boolean, required: false, default: false },
    storiesDeleted: { type: Boolean, required: false, default: false },
    subscriptionsDeleted: { type: Boolean, required: false, default: false },
    dashboardsDeleted: { type: Boolean, required: false, default: false },
    profilesDeleted: { type: Boolean, required: false, default: false },
    topicsDeleted: { type: Boolean, required: false, default: false },

    createdAt: { type: Date, required: true, default: Date.now },
    updatedAt: { type: Date, required: true, default: Date.now }
});

Deletion.plugin(paginate);

interface DeletionDocument extends Document, IDeletion {}

const DeletionModel: PaginateModel<DeletionDocument> = model<DeletionDocument, PaginateModel<DeletionDocument>>('Deletion', Deletion);

export default DeletionModel;
