export interface ILinks {
    self: string;
    first: string;
    last: string;
    prev: string;
    next: string;
}

export interface IMeta {
    'total-pages': number;
    'total-items': number;
    size: number;
}

export interface ISerializedResponse {
    data: Record<string, any>;
    links?: ILinks;
    meta?: IMeta;
}
