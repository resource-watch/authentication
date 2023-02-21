import { IUser } from 'services/okta.interfaces';
import { IApplication } from "models/application";

export default class UserSerializer {

    static serializeElement(user: IUser): Record<string, any> {
        return {
            id: user.id,
            _id: user.id,
            email: user.email,
            name: user.name,
            photo: user.photo,
            createdAt: user.createdAt ? user.createdAt.toISOString() : null,
            updatedAt: user.updatedAt ? user.updatedAt.toISOString() : null,
            role: user.role,
            provider: user.provider,
            extraUserData: user.extraUserData,
            organization: user.organization ? {
                id: user.organization.organization._id.toString(),
                name: user.organization.organization.name,
                role: user.organization.role,
            } : null,
            applications: user.applications ? user.applications.map((application: IApplication) => ({
                id: application._id.toString(),
                name: application.name,
            })) : [],
        };
    }

    static serialize(data: IUser | IUser[]): Record<string, any> {
        const result: Record<string, any> = { data: undefined };

        if (data && Array.isArray(data) && data.length === 0) {
            result.data = [];
            return result;
        }

        if (data && Array.isArray(data)) {
            result.data = data.map((e: IUser) => UserSerializer.serializeElement(e));
        } else {
            result.data = UserSerializer.serializeElement(data as IUser);
        }

        return result;
    }

}
