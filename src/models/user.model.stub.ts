import { IUser, IUserLegacyId } from "services/okta.interfaces";
import OrganizationUserModel from "models/organization-user";
import ApplicationUserModel, { IApplicationUser } from "models/application-user";

/**
 * This is not a real model.
 *
 * It's a service-like class that mimics the "statics" and "methods" functionality also present in the Application and
 * Organization models
 *
 */
export class UserModelStub {
    static async clearAssociations(userId: IUserLegacyId): Promise<void> {
        await ApplicationUserModel.deleteMany({ userId: userId })
        await OrganizationUserModel.deleteMany({ userId: userId })
    }
    static async clearApplicationAssociations(userId: IUserLegacyId): Promise<void> {
        await ApplicationUserModel.deleteMany({ userId: userId })
    }
    static async clearOrganizationAssociations(userId: IUserLegacyId): Promise<void> {
        await OrganizationUserModel.deleteMany({ userId: userId })
    }

    static async hydrate(user: IUser): Promise<IUser> {
        const applicationUsers: IApplicationUser[] = await ApplicationUserModel.find({ userId: user.id }).populate('application');
        user.applications = applicationUsers ? applicationUsers.map((applicationUser: IApplicationUser) => applicationUser.application) : null;

        user.organization = await OrganizationUserModel.findOne({ userId: user.id }).populate('organization');

        return user;
    }

    // static async removeApplicationLinkForUser(userId: string, applicationId?: IApplicationId): Promise<IUser> {
    //     let user: IUser;
    //     try {
    //         user = await OktaService.getUserById(userId);
    //     } catch (error) {
    //         if (error instanceof UserNotFoundError) {
    //             return user;
    //         } else {
    //             throw error
    //         }
    //     }
    //
    //     if (!applicationId) {
    //         return OktaService.updateUser(userId, { applications: [] });
    //     } else {
    //         return OktaService.updateUser(userId, {
    //             applications: user.applications.filter((userApplicationId: IApplicationId) => {
    //                 return userApplicationId !== applicationId;
    //             })
    //         });
    //     }
    // }
}
