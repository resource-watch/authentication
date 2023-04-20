import { Serializer } from 'jsonapi-serializer';
import { IApplication } from 'models/application';
import { AggregatePaginateResult, PaginateDocument, PaginateOptions, PaginateResult } from 'mongoose';

const applicationSerializer: Serializer = new Serializer('application', {
    attributes: [
        'name',
        'organization',
        'user',
        'apiKeyValue',
        'createdAt',
        'updatedAt',
    ],
    id: '_id',
    keyForAttribute: 'camelCase',
    transform: ((application: IApplication): Record<string, any> => ({
        ...application.toObject(),
        organization: application.organization ? {
            id: application.organization._id.toString(),
            name: application.organization.name
        } : null,
        user: application.user ? {
            id: application.user._id.toString(),
            name: application.user.name
        } : null
    }))
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

    static serializeList(data: AggregatePaginateResult<IApplication>, link: string): SerializedApplicationResponse {
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
