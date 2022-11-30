export default class ApplicationAlreadyExistsError extends Error {
    private status: number;

    constructor() {
        super('Application already exists');
        this.message = 'Application already exists for this user';
        this.status = 400;
    }

}
