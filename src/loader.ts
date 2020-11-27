import Application from "koa";
import logger from 'logger';
import AuthRouter from 'routes/auth.router';
import { middleware } from 'middleware/oauth.middleware';

export async function loadRoutes(app: Application) {
    logger.debug('Loading routes...');

    // Load OAuth middleware
    await middleware(app);

    // Load auth routes
    app.use(AuthRouter.routes());

    logger.debug('Loaded routes correctly!');
}
