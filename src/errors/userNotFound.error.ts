export default class UserNotFoundError extends Error {
    private status: number;

    constructor() {
        super('User not found');
        this.message = 'User not found';
        this.status = 404;
    }

}
