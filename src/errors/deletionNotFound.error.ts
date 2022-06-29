export default class DeletionNotFoundError extends Error {
    private status: number;

    constructor() {
        super('Deletion not found');
        this.message = 'Deletion not found';
        this.status = 404;
    }

}
