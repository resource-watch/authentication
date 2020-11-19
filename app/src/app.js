const Koa = require('koa');
const logger = require('logger');
const koaLogger = require('koa-logger');
const koaBody = require('koa-body');
const config = require('config');
const mongoose = require('mongoose');
const loader = require('loader');
const path = require('path');
const convert = require('koa-convert');
const sleep = require('sleep');
const cors = require('@koa/cors');
const koaSimpleHealthCheck = require('koa-simple-healthcheck');
const session = require('koa-generic-session');
const MongoStore = require('koa-generic-session-mongo');

const ErrorSerializer = require('serializers/errorSerializer');
const mongooseOptions = require('../../config/mongoose');

const SESSION_KEY = 'authorization';

const mongoUri = process.env.CT_MONGO_URI || `mongodb://${config.get('mongodb.host')}:${config.get('mongodb.port')}/${config.get('mongodb.database')}`;

const koaBodyMiddleware = koaBody({
    multipart: true,
    jsonLimit: '50mb',
    formLimit: '50mb',
    textLimit: '50mb',
    formidable: {
        uploadDir: '/tmp',
        onFileBegin(name, file) {
            const folder = path.dirname(file.path);
            file.path = path.join(folder, file.name);
        },
    },
});

let retries = 10;

async function init() {
    return new Promise((resolve, reject) => {
        async function onDbReady(err) {
            if (err) {
                if (retries >= 0) {
                    // eslint-disable-next-line no-plusplus
                    retries--;
                    logger.error(`Failed to connect to MongoDB uri ${mongoUri}, retrying...`);
                    sleep.sleep(5);
                    await mongoose.connect(mongoUri, mongooseOptions, onDbReady);
                } else {
                    logger.error('MongoURI', mongoUri);
                    logger.error(err);
                    reject(new Error(err));
                }

                return;
            }

            logger.info('Executing migration...');
            try {
                await require('migrations/init')(); // eslint-disable-line global-require
            } catch (Err) {
                logger.error(Err);
            }

            const app = new Koa();
            app.use(cors({
                credentials: true
            }));

            app.use(convert(koaBodyMiddleware));

            // Manage errors middleware
            app.use(async (ctx, next) => {
                try {
                    await next();
                } catch (error) {

                    ctx.status = error.status || 500;

                    if (ctx.status >= 500) {
                        logger.error(error);
                    } else {
                        logger.info(error);
                    }

                    if (process.env.NODE_ENV === 'prod' && ctx.status === 500) {
                        ctx.response.type = 'application/vnd.api+json';
                        ctx.body = ErrorSerializer.serializeError(ctx.status, 'Unexpected error');
                        return;
                    }

                    ctx.response.type = 'application/vnd.api+json';
                    ctx.body = ErrorSerializer.serializeError(ctx.status, error.message);
                }
            });

            // Mongo session middleware
            app.keys = [SESSION_KEY];
            const configSession = { store: new MongoStore({ url: mongoUri }), cookie: {} };
            app.use(convert(session(configSession)));

            // Load other stuff
            await loader.loadPlugins(app);
            app.use(koaLogger());
            app.use(koaSimpleHealthCheck());

            loader.loadRoutes(app);

            const server = app.listen(process.env.PORT);
            logger.info('Server started in ', process.env.PORT);
            resolve({ app, server });
        }

        logger.info(`Connecting to MongoDB URL ${mongoUri}`);
        mongoose.connect(mongoUri, mongooseOptions, onDbReady);
    });
}

module.exports = init;
