import mongoose, { Schema, Document } from 'mongoose';

export interface IRenew extends Document {
    userId: string;
    token: string;
    createdAt: Date;
}

const RenewSchema: Schema = new Schema({
    userId: { type: String, required: true, trim: true },
    token: { type: String, required: true, trim: true },
    createdAt: { type: Date, required: true, default: Date.now, expires: 60 * 60 * 24 },
});

export default mongoose.model<IRenew>('Renew', RenewSchema);
