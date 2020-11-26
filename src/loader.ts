import Application from "koa";
import logger from './logger';

import AuthRouter from './routes/auth.router';
import { middleware } from './plugins/sd-ct-oauth-plugin';

export async function loadRoutes(app: Application) {
    logger.debug('Loading routes...');

    // Load OAuth middleware
    try {
        await middleware(app);
    } catch (e) {
        console.log(e);
    }

    // Load auth routes
    app.use(AuthRouter.routes());

    logger.debug('Loaded routes correctly!');
}
