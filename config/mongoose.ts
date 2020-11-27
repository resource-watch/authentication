export interface MongooseOptions {
    useNewUrlParser: boolean;
    useFindAndModify: boolean;
    useCreateIndex: boolean;
    useUnifiedTopology: boolean;
    appname: string;
    db?: Record<string, unknown>;
    replset?: Record<string, unknown>;
    server?: Record<string, unknown>;
}

const mongooseDefaultOptions: MongooseOptions = {
    useNewUrlParser: true,
    useFindAndModify: false,
    useCreateIndex: true,
    useUnifiedTopology: true,
    appname: 'Authorization',
};

export default mongooseDefaultOptions;
