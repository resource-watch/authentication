const mongooseOptions = {
    useNewUrlParser: true,
    useFindAndModify: false,
    useCreateIndex: true,
    useUnifiedTopology: true,
    appname: 'Control Tower', // Displays the app name in MongoDB logs, for ease of debug
};

module.exports = mongooseOptions;
