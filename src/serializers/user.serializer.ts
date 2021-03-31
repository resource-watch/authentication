import { IUser } from 'services/okta.interfaces';

export default class UserSerializer {

    static serializeElement(el: IUser): Record<string, any> {
        return {
            id: el.id,
            _id: el.id,
            email: el.email,
            name: el.name,
            photo: el.photo,
            createdAt: el.createdAt ? el.createdAt.toISOString() : null,
            updatedAt: el.updatedAt ? el.updatedAt.toISOString() : null,
            role: el.role,
            provider: el.provider,
            extraUserData: el.extraUserData
        };
    }

    static serialize(data: IUser | IUser[]): Record<string, any> {
        const result: Record<string, any> = { data: undefined };

        if (data && Array.isArray(data) && data.length === 0) {
            result.data = [];
            return result;
        }

        if (data && Array.isArray(data)) {
            result.data = data.map((e) => UserSerializer.serializeElement(e));
        } else {
            result.data = UserSerializer.serializeElement(data as IUser);
        }

        return result;
    }

}
