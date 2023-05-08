import Application, { Context, Next } from 'koa';
import passport from 'koa-passport';
import jwt, { Options } from 'koa-jwt';
import logger from 'logger';
import Settings from 'services/settings.service';
import AuthRouter from 'routes/auth.router';
import DeletionRouter from 'routes/deletion.router';
import OktaService from 'services/okta.service';
import OktaFacebookProvider from 'providers/okta.facebook.provider';
import OktaGoogleProvider from 'providers/okta.google.provider';
import OktaTwitterProvider, { registerOktaTwitterStrategies } from 'providers/okta.twitter.provider';
import OrganizationRouter from 'routes/organization.router';
import ApplicationRouter from 'routes/application.router';
import mount from 'koa-mount';

export function loadRoutes(app: Application): void {
    logger.debug('Loading OAuth middleware...');

    OktaFacebookProvider.registerStrategies();
    OktaGoogleProvider.registerStrategies();
    registerOktaTwitterStrategies();

    app.use(passport.initialize());
    app.use(passport.session());

    const getToken: (ctx: Context, opts: Options) => string = (ctx: Context, opts: Options) => {
        // External requests use the standard 'authorization' header, but internal requests use 'authentication' instead
        // so we need a custom function to load the token. Why don't we use authorization on both will always elude me...

        if (!ctx.headers || (!ctx.headers.authorization && !ctx.headers.authentication)) {
            return '';
        }

        if (ctx.headers.authentication && !ctx.headers.authorization) {
            /**
             * @deprecate Use the `authorization` header instead.
             */
            return ctx.headers.authentication as string;
        }

        const parts: string[] = ctx.headers.authorization.split(' ');

        if (parts.length === 2) {
            const scheme: string = parts[0];
            const credentials: string = parts[1];

            if (/^Bearer$/i.test(scheme)) {
                return credentials;
            }
        }
        if (!opts.passthrough) {
            ctx.throw(401, 'Bad Authorization header format. Format is "Authorization: Bearer <token>"');
            return '';
        }

        return '';
    };

    logger.debug('Loading JWT middleware...');
    app.use(jwt({
        secret: Settings.getSettings().jwt.secret,
        passthrough: true,
        isRevoked: OktaService.checkRevokedToken,
        getToken
    }));

    logger.debug('Loading JWT validation middleware...');
    app.use(async (ctx: Context, next: Next) => {
        if (ctx.state.jwtOriginalError?.message === 'Token revoked') {
            return ctx.throw(401, 'Your token is outdated. Please use /auth/login to login and /auth/generate-token to generate a new token.');
        }
        if (ctx.state.jwtOriginalError?.message === 'jwt malformed') {
            return ctx.throw(401, 'Your token is invalid. Please use /auth/login to login and /auth/generate-token to generate a new token.');
        }

        return next();
    });

    // Load routes
    logger.debug('Loading routes...');
    app.use(AuthRouter.middleware());
    app.use(mount('/api/v1', DeletionRouter.middleware()));
    app.use(mount('/api/v1', ApplicationRouter.middleware()));
    app.use(mount('/api/v1', OrganizationRouter.middleware()));
    app.use(OktaTwitterProvider.routes());

    logger.debug('Loaded routes correctly!');
}
