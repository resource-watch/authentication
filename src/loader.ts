import Application from "koa";
import logger from './logger';

import AuthRouter from './routes/auth.router';
import { middleware } from './plugins/sd-ct-oauth-plugin';
import Plugin from "./models/plugin.model";

export async function loadRoutes(app: Application) {
    logger.debug('Loading routes...');

    // Load OAuth plugin middleware
    const plugin = await Plugin.findOne({ name: 'oauth' });
    await middleware(app, plugin);

    // Load auth routes
    app.use(AuthRouter.routes());

    logger.debug('Loaded routes correctly!');
}
