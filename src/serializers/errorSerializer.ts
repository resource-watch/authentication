export default class ErrorSerializer {

    static serializeError(status: number, message: string): Object {
        return { errors: [{ status, detail: message }] };
    }

}
