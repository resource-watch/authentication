export default class DeletionAlreadyExistsError extends Error {
    private status: number;

    constructor() {
        super('Deletion already exists');
        this.message = 'Deletion already exists for this user';
        this.status = 400;
    }

}
