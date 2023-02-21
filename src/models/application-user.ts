import type { Document, Schema as ISchema } from 'mongoose';
import { model, Schema, PaginateModel, Model } from 'mongoose';
import paginate from 'mongoose-paginate-v2';
import { IApplication } from 'models/application';
import { IUser, IUserLegacyId } from "services/okta.interfaces";
import OktaService from "services/okta.service";

interface IApplicationUserMethods {
    getUser(): Promise<IUser>
}

export interface IApplicationUser extends Document, IApplicationUserMethods {
    application: IApplication;
    userId: IUserLegacyId;
    createdAt: Date;
    updatedAt: Date;
}

type ApplicationUserModel = Model<IApplicationUser, any, IApplicationUserMethods>;

export const ApplicationUser: ISchema<IApplicationUser, ApplicationUserModel, IApplicationUserMethods> = new Schema<IApplicationUser, ApplicationUserModel, IApplicationUserMethods>({
    application: {
        type: Schema.Types.ObjectId,
        ref: "Application"
    },
    userId: { type: String, trim: true, required: true },
    createdAt: { type: Date, required: true, default: Date.now },
    updatedAt: { type: Date, required: true, default: Date.now }
}, {
    methods: {
        async getUser(): Promise<IUser> {
            return OktaService.convertOktaUserToIUser(await OktaService.getOktaUserById(this.userId));
        },
    }
});

ApplicationUser.plugin(paginate);

interface ApplicationUserDocument extends Document, IApplicationUser {
}

const ApplicationUserModel: PaginateModel<ApplicationUserDocument> = model<ApplicationUserDocument, PaginateModel<ApplicationUserDocument>>('ApplicationUser', ApplicationUser);

export default ApplicationUserModel;
