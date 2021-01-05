import config from 'config';
import { Server } from "http";
import Koa from 'koa';
import koaBody from 'koa-body';
import koaLogger from 'koa-logger';
import mongoose from 'mongoose';
import sleep from 'sleep';
import { RWAPIMicroservice } from 'rw-api-microservice-node';
// @ts-ignore
import cors from '@koa/cors';
// @ts-ignore
import koaSimpleHealthCheck from 'koa-simple-healthcheck';
import session from 'koa-generic-session';
import redisStore from 'koa-redis';
import views from 'koa-views';

import logger from 'logger';
import { loadRoutes } from 'loader';
import ErrorSerializer from 'serializers/errorSerializer';
import mongooseDefaultOptions, { MongooseOptions } from '../config/mongoose';

const mongoUri: string = process.env.CT_MONGO_URI || `mongodb://${config.get('mongodb.host')}:${config.get('mongodb.port')}/${config.get('mongodb.database')}`;

let retries: number = 10;

let mongooseOptions: MongooseOptions = { ...mongooseDefaultOptions };
if (mongoUri.indexOf('replicaSet') > -1) {
    mongooseOptions = {
        ...mongooseOptions,
        db: { native_parser: true },
        replset: {
            auto_reconnect: false,
            poolSize: 10,
            socketOptions: {
                keepAlive: 1000,
                connectTimeoutMS: 30000
            }
        },
        server: {
            poolSize: 5,
            socketOptions: {
                keepAlive: 1000,
                connectTimeoutMS: 30000
            }
        }
    };
}

interface IInit {
    server: Server;
    app: Koa;
}

const init: () => Promise<IInit> = async (): Promise<IInit> => {
    return new Promise((resolve, reject) => {
        async function onDbReady(err: Error): Promise<void> {
            if (err) {
                if (retries >= 0) {
                    retries--;
                    logger.error(`Failed to connect to MongoDB uri ${mongoUri}, retrying...`);
                    sleep.sleep(5);
                    await mongoose.connect(mongoUri, mongooseOptions, onDbReady);
                } else {
                    logger.error('MongoURI', mongoUri);
                    logger.error(err);
                    reject(new Error(err.message));
                }

                return;
            }

            logger.info(`Connection to MongoDB successful`);

            const app: Koa = new Koa();

            app.use(koaBody({
                multipart: true,
                jsonLimit: '50mb',
                formLimit: '50mb',
                textLimit: '50mb'
            }));
            app.use(koaSimpleHealthCheck());

            app.keys = ['twitter'];
            // @ts-ignore
            app.use(session({ store: redisStore({ url: config.get('redis.url') }) }));

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
                name: 'authorization',
                info: require('../microservice/register.json'),
                swagger: {},
                logger,
                baseURL: process.env.CT_URL,
                url: process.env.LOCAL_URL,
                token: process.env.CT_TOKEN,
                skipGetLoggedUser: true
            }));

            app.use(koaLogger());
            await loadRoutes(app);

            const port: string = process.env.PORT || '9000';

            const server: Server = app.listen(port, () => {
                if (process.env.CT_REGISTER_MODE === 'auto') {
                    RWAPIMicroservice.register().then(() => {
                        logger.info('CT registration process started');
                    }, (error) => {
                        logger.error(error);
                        process.exit(1);
                    });
                }
            });

            logger.info('Server started in ', port);
            resolve({ app, server });
        }

        logger.info(`Connecting to MongoDB URL ${mongoUri}`);
        mongoose.connect(mongoUri, mongooseOptions, onDbReady);
    });
};

export { init };
