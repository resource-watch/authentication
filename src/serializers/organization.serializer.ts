import { Serializer } from 'jsonapi-serializer';
import { IOrganization } from 'models/organization';
import { PaginateDocument, PaginateOptions, PaginateResult } from 'mongoose';

const organizationSerializer: Serializer = new Serializer('organization', {
    attributes: [
        'name',
        'applications',
        'createdAt',
        'updatedAt',
    ],

    keyForAttribute: 'camelCase'
});

export interface SerializedOrganizationResponse {
    data: {
        id: string,
        type: 'organization',
        attributes: IOrganization
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

class OrganizationSerializer {

    static serializeList(data: PaginateResult<PaginateDocument<IOrganization, unknown, PaginateOptions>>, link: string): SerializedOrganizationResponse {
        const serializedData: SerializedOrganizationResponse = organizationSerializer.serialize(data.docs);

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

    static serialize(data: Record<string, any>): SerializedOrganizationResponse {
        return organizationSerializer.serialize(data);
    }

}

export default OrganizationSerializer;
