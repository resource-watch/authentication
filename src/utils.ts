import config from 'config';
import logger from './logger';
import { Context } from "koa";
import {IPlugin} from "./models/plugin.model";

export default class Utils {

    static getUser(ctx: Context) {
        return ctx.req.user || ctx.state.user || ctx.state.microservice;
    }

    static async isLogged(ctx: Context, next: () => Promise<any>) {
        logger.debug('Checking if user is logged');
        if (Utils.getUser(ctx)) {
            await next();
        } else {
            logger.debug('Not logged');
            ctx.throw(401, 'Not authenticated');
        }
    }

    static async isAdmin(ctx: Context, next: () => Promise<any>) {
        logger.info('Checking if user is admin');
        const user = Utils.getUser(ctx);
        if (!user) {
            logger.info('Not authenticated');
            ctx.throw(401, 'Not authenticated');
            return;
        }
        if (user.role === 'ADMIN') {
            logger.info('User is admin');
            await next();
        } else {
            logger.info('Not admin');
            ctx.throw(403, 'Not authorized');
        }
    }

    static async isAdminOrManager(ctx: Context, next: () => Promise<any>) {
        logger.info('Checking if user is admin or manager');
        const user = Utils.getUser(ctx);
        if (!user) {
            logger.info('Not authenticated');
            ctx.throw(401, 'Not authenticated');
            return;
        }
        if (user.role === 'ADMIN' || user.role === 'MANAGER') {
            await next();
        } else {
            logger.info('Not admin');
            ctx.throw(403, 'Not authorized');
        }
    }

    static async isMicroservice(ctx: Context, next: () => Promise<any>) {
        logger.info('Checking if user is a microservice');
        const user = Utils.getUser(ctx);
        if (!user) {
            logger.info('Not authenticated');
            ctx.throw(401, 'Not authenticated');
            return;
        }
        if (user.id === 'microservice') {
            await next();
        } else {
            logger.info('Not admin');
            ctx.throw(403, 'Not authorized');
        }
    }

    static getOriginApp(ctx: Context, plugin: IPlugin) {
        if (ctx.query.origin) {
            return ctx.query.origin;
        }

        if (ctx.session && ctx.session.originApplication) {
            return ctx.session.originApplication;
        }

        return plugin.config.defaultApp;
    }

    static serializeObjToQuery(obj: Object) {
        return Object.keys(obj).reduce((a, k) => {
            a.push(`${k}=${encodeURIComponent(obj[k])}`);
            return a;
        }, []).join('&');
    }

    static getGeneralConfig() {
        return {
            mongoUri: process.env.CT_MONGO_URI || `mongodb://${config.get('mongodb.host')}:${config.get('mongodb.port')}/${config.get('mongodb.database')}`,
            application: config.get('application'),
        };
    }

    static getApplicationsConfig(ctx: Context, plugin: IPlugin) {
        const app = Utils.getOriginApp(ctx, plugin);
        return plugin.config.applications && plugin.config.applications[app];
    }

}
