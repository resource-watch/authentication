import config from 'config';
import { Server } from "http";
import Koa from 'koa';
import koaBody from 'koa-body';
import convert from 'koa-convert';
import koaLogger from 'koa-logger';
import mongoose from 'mongoose';

import sleep from 'sleep';
// @ts-ignore
import cors from '@koa/cors';
// @ts-ignore
import koaSimpleHealthCheck from 'koa-simple-healthcheck';
import session from 'koa-generic-session';
// @ts-ignore
import MongoStore from 'koa-generic-session-mongo';

import logger from './logger';
import { loadRoutes } from './loader';
import ErrorSerializer from './serializers/errorSerializer';
import mongooseOptions from '../config/mongoose';

const SESSION_KEY = 'authorization';

const mongoUri = process.env.CT_MONGO_URI || `mongodb://${config.get('mongodb.host')}:${config.get('mongodb.port')}/${config.get('mongodb.database')}`;

const koaBodyMiddleware = koaBody({
    multipart: true,
    jsonLimit: '50mb',
    formLimit: '50mb',
    textLimit: '50mb',
    formidable: { uploadDir: '/tmp' },
});

let retries = 10;

interface IInit {
    server: Server;
    app: Koa;
}

const init = async ():Promise<IInit> => {
    return new Promise((resolve, reject) => {
        async function onDbReady(err: Error) {
            if (err) {
                if (retries >= 0) {
                    retries--;
                    logger.error(`Failed to connect to MongoDB uri ${mongoUri}, retrying...`);
                    sleep.sleep(5);
                    await mongoose.connect(mongoUri, mongooseOptions, onDbReady);
                } else {
                    logger.error('MongoURI', mongoUri);
                    logger.error(err);
                    reject(err);
                }

                return;
            }

            logger.info('Executing migration...');
            try {
                await require('./migrations/init')(); // eslint-disable-line global-require
            } catch (Err) {
                logger.error(Err);
            }

            const app = new Koa();
            app.use(cors({
                credentials: true
            }));

            app.use(convert(koaBodyMiddleware));

            // Manage errors middleware
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

            // Mongo session middleware
            app.keys = [SESSION_KEY];
            const configSession = { store: new MongoStore({ url: mongoUri }), cookie: {} };
            app.use(convert(session(configSession)));

            // Load other stuff
            app.use(koaLogger());
            app.use(koaSimpleHealthCheck());
            await loadRoutes(app);

            const server = app.listen(process.env.PORT);
            logger.info('Server started in ', process.env.PORT);
            resolve({ app, server });
        }

        logger.info(`Connecting to MongoDB URL ${mongoUri}`);
        mongoose.connect(mongoUri, mongooseOptions, onDbReady);
    });
}

export { init };
