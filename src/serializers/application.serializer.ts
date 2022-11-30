import { Serializer } from 'jsonapi-serializer';
import { IApplication } from 'models/application';
import { PaginateDocument, PaginateOptions, PaginateResult } from 'mongoose';

const applicationSerializer: Serializer = new Serializer('application', {
    attributes: [
        'name',
        'apiKeyValue',
        'createdAt',
        'updatedAt',
    ],

    keyForAttribute: 'camelCase'
});

export interface SerializedApplicationResponse {
    data: {
        id: string,
        type: 'application',
        attributes: IApplication
    };
    links: {
        self: string,
        first: string,
        last: string,
        prev: string,
        next: string,
    };
    meta: {
        'total-pages': number,
        'total-items': number
        size: number
    };
}

class ApplicationSerializer {

    static serializeList(data: PaginateResult<PaginateDocument<IApplication, unknown, PaginateOptions>>, link: string): SerializedApplicationResponse {
        const serializedData: SerializedApplicationResponse = applicationSerializer.serialize(data.docs);

        serializedData.links = {
            self: `${link}page[number]=${data.page}&page[size]=${data.limit}`,
            first: `${link}page[number]=1&page[size]=${data.limit}`,
            last: `${link}page[number]=${data.totalPages}&page[size]=${data.limit}`,
            prev: `${link}page[number]=${data.page - 1 > 0 ? data.page - 1 : data.page}&page[size]=${data.limit}`,
            next: `${link}page[number]=${data.page + 1 < data.totalPages ? data.page + 1 : data.totalPages}&page[size]=${data.limit}`,
        };

        serializedData.meta = {
            'total-pages': data.totalPages as number,
            'total-items': data.totalDocs as number,
            size: data.limit
        };

        return serializedData;
    }

    static serialize(data: Record<string, any>): SerializedApplicationResponse {
        return applicationSerializer.serialize(data);
    }

}

export default ApplicationSerializer;
