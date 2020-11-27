export default class NoTwitterAccountError extends Error {
    private status: number;

    constructor() {
        super();
        this.name = 'NoTwitterAccount';
        this.message = 'No RW API account found for this twitter user';
        this.status = 404;
    }

}
