export default class UnprocessableEntityError extends Error {
    private status: number;

    constructor(message: string) {
        super(message);
        this.name = 'UnprocessableEntity';
        this.message = message;
        this.status = 422;
    }

}
