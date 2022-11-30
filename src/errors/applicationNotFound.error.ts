export default class ApplicationNotFoundError extends Error {
    private status: number;

    constructor() {
        super('Application not found');
        this.message = 'Application not found';
        this.status = 404;
    }

}
