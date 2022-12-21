export default class OrganizationNotFoundError extends Error {
    private status: number;

    constructor() {
        super('Organization not found');
        this.message = 'Organization not found';
        this.status = 404;
    }

}
