import Application, { Context, Next } from "koa";
import passport from "koa-passport";
import jwt, { Options } from "koa-jwt";

import logger from 'logger';
import UserService from "services/user.service";
import Settings from "services/settings.service";
import registerStrategies from "services/passport.service";
import AuthRouter from 'routes/auth.router';
import { router as TwitterRouter } from 'routes/auth/twitter.router';

export async function loadRoutes(app: Application): Promise<void> {
    logger.debug('Loading OAuth middleware...');

    await registerStrategies();

    app.use(passport.initialize());
    app.use(passport.session());

    const getToken:(ctx: Context, opts: Options) => string = (ctx: Context, opts: Options) => {
        // External requests use the standard 'authorization' header, but internal requests use 'authentication' instead
        // so we need a custom function to load the token. Why don't we use authorization on both will always elude me...

        if (!ctx.headers || (!ctx.headers.authorization && !ctx.headers.authentication)) {
            return;
        }

        if (ctx.headers.authentication) {
            return ctx.headers.authentication;
        }

        const parts:string[] = ctx.headers.authorization.split(' ');

        if (parts.length === 2) {
            const scheme:string = parts[0];
            const credentials:string = parts[1];

            if (/^Bearer$/i.test(scheme)) {
                return credentials;
            }
        }
        if (!opts.passthrough) {
            ctx.throw(401, 'Bad Authorization header format. Format is "Authorization: Bearer <token>"');
        }
    };

    logger.debug('Loading JWT middleware...');
    app.use(jwt({
        secret: Settings.getSettings().jwt.secret,
        passthrough: Settings.getSettings().jwt.passthrough,
        isRevoked: UserService.checkRevokedToken,
        getToken
    }));

    logger.debug('Loading JWT validation middleware...');
    app.use(async (ctx: Context, next: Next) => {
        if (ctx.state.jwtOriginalError && ctx.state.jwtOriginalError.message === 'Token revoked') {
            return ctx.throw(401, 'Your token is outdated. Please use /auth/login to login and /auth/generate-token to generate a new token.');
        }
        if (ctx.state.jwtOriginalError && ctx.state.jwtOriginalError.message === 'jwt malformed') {
            return ctx.throw(401, 'Your token is invalid. Please use /auth/login to login and /auth/generate-token to generate a new token.');
        }

        return next();
    });

    // Load routes
    logger.debug('Loading routes...');
    app.use(AuthRouter.routes());
    app.use(TwitterRouter.routes());

    logger.debug('Loaded routes correctly!');
}
