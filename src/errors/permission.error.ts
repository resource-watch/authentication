export default class PermissionError extends Error {
    private status: number;

    constructor(message: string) {
        super(message);
        this.message = message;
        this.status = 403;
    }

}
