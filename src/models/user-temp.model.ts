import mongoose, { Document, Schema } from 'mongoose';

export interface IUserTemp {
    id: string;
    name?: string;
    photo?: string;
    email?: string;
    password?: string;
    salt?: string;
    role: string;
    createdAt: Date;
    confirmationToken?: string;
    extraUserData: { apps: string[]; };
}

export interface UserTempDocument extends IUserTemp, Document {}

const UserTempSchema: Schema = new Schema({
    email: { type: String, required: false, trim: true },
    password: { type: String, required: false, trim: true },
    salt: { type: String, required: false, trim: true },
    role: {
        type: String, required: true, default: 'USER', trim: true
    },
    createdAt: {
        type: Date, required: true, default: Date.now, expires: 60 * 60 * 24 * 7
    },
    confirmationToken: { type: String, required: true, trim: true },
    extraUserData: { type: Schema.Types.Mixed },
});

export default mongoose.model<UserTempDocument>('UserTemp', UserTempSchema);
