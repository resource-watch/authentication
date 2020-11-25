import mongoose, { Schema, Document } from 'mongoose';

export interface IPlugin extends Document {
    name: string;
    description: string;
    mainFile: string;
    cronFile?: string;
    active: Boolean;
    config?: Object;
    ordering?: Number;
}

const PluginSchema: Schema = new Schema({
    name: { type: String, required: true, trim: true },
    description: { type: String, required: true, trim: true },
    mainFile: { type: String, required: true, trim: true },
    cronFile: { type: String, required: false, trim: true },
    active: { type: Boolean, default: false },
    config: { type: Schema.Types.Mixed, required: false },
    ordering: { type: Number, required: false, trim: true },
});

export default mongoose.model<IPlugin>('Plugin', PluginSchema);
