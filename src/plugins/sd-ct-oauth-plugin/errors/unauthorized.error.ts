export default class UnauthorizedError extends Error {
    private status: number;

    constructor(message: string) {
        super(message);
        this.name = 'Unauthorized';
        this.message = message;
        this.status = 401;
    }

}
