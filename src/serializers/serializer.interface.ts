export interface ILinks {
    self: string;
    first: string;
    last: string;
    prev: string;
    next: string;
}

export interface ISerializedResponse {
    data: Record<string, any>;
    links?: ILinks;
}
