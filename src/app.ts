import config from 'config';
import { Server } from 'http';
import Koa from 'koa';
import koaBody from 'koa-body';
import koaLogger from 'koa-logger';
// @ts-ignore
import flash from 'koa-connect-flash';
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

interface IInit {
    server: Server;
    app: Koa;
}

const init: () => Promise<IInit> = async (): Promise<IInit> => {
    return new Promise((resolve) => {
        const app: Koa = new Koa();

        app.use(koaBody({
            multipart: true,
            jsonLimit: '50mb',
            formLimit: '50mb',
            textLimit: '50mb'
        }));
        app.use(koaSimpleHealthCheck());

        app.keys = [config.get('server.sessionKey')];

        app.use(session({
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

        const port: string = process.env.PORT || '9000';

        const server: Server = app.listen(port);

        logger.info('Server started in ', port);
        resolve({ app, server });
    });
};

export { init };
