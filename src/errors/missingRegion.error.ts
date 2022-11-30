export default class MissingRegionError extends Error {
    private status: number;

    constructor() {
        super('Missing AWS region');
        this.message = 'Missing AWS region';
        this.status = 500;
    }

}
