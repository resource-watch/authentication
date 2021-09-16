export default class PasswordRecoveryNotAllowedError extends Error {
    private status: number;

    constructor(message: string) {
        super(message);
        this.name = 'Bad Request';
        this.status = 400;
    }

}
