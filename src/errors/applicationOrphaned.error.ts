export default class ApplicationOrphanedError extends Error {
    private status: number;

    constructor() {
        super('Application would be left orphaned by this operation');
        this.message = 'Application would be left orphaned by this operation';
        this.status = 400;
    }

}
