import { IUser } from "models/user.model";

interface ILinks {
    self: string;
    first: string;
    last: string;
    prev: string;
    next: string;
}

interface IMeta {
    'total-pages': number;
    'total-items': number;
    size: number;
}

interface ISerializedResponse {
    data: Record<string, any>;
    links?: ILinks;
    meta?: IMeta;
}

export default class UserSerializer {

    static serializeElement(el: Record<string, any>) {
        return {
            id: el.id,
            email: el.email,
            name: el.name,
            photo: el.photo,
            createdAt: el.createdAt.toISOString(),
            updatedAt: el.updatedAt.toISOString(),
            role: el.role,
            extraUserData: el.extraUserData
        };
    }

    static serialize(data: any, link: string = null) {
        const result: ISerializedResponse = {
            data: undefined,
        };

        if (data && Array.isArray(data) && data.length === 0) {
            result.data = [];
            return result;
        }
        if (data) {
            if (data.docs) {
                while (data.docs.indexOf(undefined) >= 0) {
                    data.docs.splice(data.docs.indexOf(undefined), 1);
                }
                result.data = data.docs.map((el: IUser) => UserSerializer.serializeElement(el));
            } else if (Array.isArray(data)) {
                result.data = data.map((e) => UserSerializer.serializeElement(e));
            } else {
                result.data = UserSerializer.serializeElement(data);
            }
        }
        if (link) {
            result.links = {
                self: `${link}page[number]=${data.page}&page[size]=${data.limit}`,
                first: `${link}page[number]=1&page[size]=${data.limit}`,
                last: `${link}page[number]=${data.pages}&page[size]=${data.limit}`,
                prev: `${link}page[number]=${data.page - 1 > 0 ? data.page - 1 : data.page}&page[size]=${data.limit}`,
                next: `${link}page[number]=${data.page + 1 < data.pages ? data.page + 1 : data.pages}&page[size]=${data.limit}`,
            };
            result.meta = {
                'total-pages': data.pages,
                'total-items': data.total,
                size: data.limit
            };
        }
        return result;
    }

}
