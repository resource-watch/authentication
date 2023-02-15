import { IUser } from "services/okta.interfaces";
import OktaService from "services/okta.service";
import ApplicationModel, { IApplication, IApplicationId } from "models/application";
import UserNotFoundError from "errors/userNotFound.error";
import OrganizationUserModel from "models/organization-user";

/**
 * This is not a real model.
 *
 * It's a service-like class that mimics the "statics" and "methods" functionality also present in the Application and
 * Organization models
 *
 */
export class UserModelStub {
    static async clearAssociations(userId: string): Promise<IUser> {
        let user: IUser;
        try {
            user = await OktaService.getUserById(userId)
        } catch (error) {
            if (error instanceof UserNotFoundError) {
                return user;
            } else {
                throw error
            }
        }

        if (user.applications) {
            await Promise.all(user.applications.map(async (applicationId: IApplicationId) => {
                    const application: IApplication = await ApplicationModel.findById(applicationId);
                    return application.clearAssociations();
                })
            );
            await ApplicationModel.removeLinksToUser(user);
        }

        await OrganizationUserModel.deleteMany({ user: user.id });

        return OktaService.updateUser(userId, { applications: [] });
    }

    static async removeApplicationLinkForUser(userId: string, applicationId?: IApplicationId): Promise<IUser> {
        let user: IUser;
        try {
            user = await OktaService.getUserById(userId);
        } catch (error) {
            if (error instanceof UserNotFoundError) {
                return user;
            } else {
                throw error
            }
        }

        if (!applicationId) {
            return OktaService.updateUser(userId, { applications: [] });
        } else {
            return OktaService.updateUser(userId, {
                applications: user.applications.filter((userApplicationId: IApplicationId) => {
                    return userApplicationId !== applicationId;
                })
            });
        }
    }
}
