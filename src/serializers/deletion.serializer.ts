import { Serializer } from 'jsonapi-serializer';
import { IDeletion } from 'models/deletion';
import { PaginateDocument, PaginateOptions, PaginateResult } from 'mongoose';

const deletionSerializer: Serializer = new Serializer('deletion', {
    attributes: [
        'userId',
        'requestorUserId',
        'status',
        'datasetsDeleted',
        'layersDeleted',
        'widgetsDeleted',
        'userAccountDeleted',
        'userDataDeleted',
        'collectionsDeleted',
        'favouritesDeleted',
        'areasDeleted',
        'storiesDeleted',
        'subscriptionsDeleted',
        'dashboardsDeleted',
        'profilesDeleted',
        'topicsDeleted',
        'createdAt',
        'updatedAt',
    ],

    keyForAttribute: 'camelCase'
});

export interface SerializedDeletionResponse {
    data: {
        id: string,
        type: 'deletion',
        attributes: IDeletion
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

class DeletionSerializer {

    static serializeList(data: PaginateResult<PaginateDocument<IDeletion, unknown, PaginateOptions>>, link: string): SerializedDeletionResponse {
        const serializedData: SerializedDeletionResponse = deletionSerializer.serialize(data.docs);

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

    static serialize(data: Record<string, any>): SerializedDeletionResponse {
        return deletionSerializer.serialize(data);
    }

}

export default DeletionSerializer;
