import config from 'config';
import { Server } from 'http';
import Koa from 'koa';
import koaBody from 'koa-body';
import koaLogger from 'koa-logger';
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore
import flash from 'koa-connect-flash';
import { RWAPIMicroservice } from 'rw-api-microservice-node';
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore
import cors from '@koa/cors';
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore
import koaSimpleHealthCheck from 'koa-simple-healthcheck';
import session from 'koa-generic-session';
import redisStore from 'koa-redis';
import views from 'koa-views';
import mongoose, { CallbackError, ConnectOptions } from 'mongoose';
import koaQs from 'koa-qs';
import logger from 'logger';
import { loadRoutes } from 'loader';
import ErrorSerializer from 'serializers/errorSerializer';
import sleep from 'sleep';

interface IInit {
    server: Server;
    app: Koa;
}

const mongooseOptions: ConnectOptions = {
    readPreference: 'secondaryPreferred', // Has MongoDB prefer secondary servers for read operations.
    appName: 'authorization', // Displays the app name in MongoDB logs, for ease of debug
    serverSelectionTimeoutMS: 10000, // Number of milliseconds the underlying MongoDB driver has to pick a server
};

const mongoUri: string =
    process.env.MONGO_URI ||
    `mongodb://${config.get('mongodb.host')}:${config.get(
        'mongodb.port',
    )}/${config.get('mongodb.database')}`;

let retries: number = 10;

const init: () => Promise<IInit> = async (): Promise<IInit> => {
    return new Promise((resolve: (value: IInit | PromiseLike<IInit>) => void,
                        reject: (reason?: any) => void
    ) => {
        function onDbReady(mongoConnectionError: CallbackError): void {
                if (mongoConnectionError) {
                    if (retries >= 0) {
                        retries--;
                        logger.error(
                            `Failed to connect to MongoDB uri ${mongoUri}, retrying...`,
                        );
                        logger.debug(mongoConnectionError);
                        sleep.sleep(5);
                        mongoose.connect(mongoUri, mongooseOptions, onDbReady);
                    } else {
                        logger.error('MongoURI', mongoUri);
                        logger.error(mongoConnectionError);
                        reject(new Error(mongoConnectionError.message));
                    }
                }

        const app: Koa = new Koa();

        koaQs(app, 'extended');
        app.use(koaBody({
            multipart: true,
            jsonLimit: '50mb',
            formLimit: '50mb',
            textLimit: '50mb'
        }));
        app.use(koaSimpleHealthCheck());

        app.keys = [config.get('server.sessionKey')];

        app.use(session({
            // eslint-disable-next-line @typescript-eslint/ban-ts-comment
            // @ts-ignore
            store: redisStore({
                url: config.get('redis.url'),
                db: 1
            })
        }));

        app.use(flash());

        app.use(views(`${__dirname}/views`, { extension: 'ejs' }));

        app.use(cors({ credentials: true }));

        app.use(async (ctx: { status: number; response: { type: string; }; body: any; }, next: () => any) => {
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

        app.use(RWAPIMicroservice.bootstrap({
            logger,
            gatewayURL: process.env.GATEWAY_URL,
            microserviceToken: process.env.MICROSERVICE_TOKEN,
            skipGetLoggedUser: true,
            fastlyEnabled: process.env.FASTLY_ENABLED as boolean | 'true' | 'false',
            fastlyServiceId: process.env.FASTLY_SERVICEID,
            fastlyAPIKey: process.env.FASTLY_APIKEY
        }));

        app.use(koaLogger());
        loadRoutes(app);

        const port: string = config.get('server.port') || '9000';

        const server: Server = app.listen(port);

        logger.info('Server started in ', port);
        resolve({ app, server });
        }

            logger.info(`Connecting to MongoDB URL ${mongoUri}`);

            mongoose.connect(mongoUri, mongooseOptions, onDbReady);
        },
    );
};


export { init };
