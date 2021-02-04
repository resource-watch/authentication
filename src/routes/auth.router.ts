import config from 'config';
import { Context, DefaultState, Next } from 'koa';
import Router from 'koa-router';
import { cloneDeep } from 'lodash';
import logger from 'logger';
import Utils from 'utils';

import Settings, { IApplication } from 'services/settings.service';
import AppleProvider from 'providers/apple.provider';
import FacebookProvider from 'providers/facebook.provider';
import GoogleProvider from 'providers/google.provider';
import LocalProvider from 'providers/local.provider';
import OktaProvider from 'providers/okta.provider';
import OktaFacebookProvider from 'providers/okta.facebook.provider';
import OktaGoogleProvider from 'providers/okta.google.provider';
import OktaAppleProvider from 'providers/okta.apple.provider';

async function setCallbackUrl(ctx: Context, next: Next): Promise<void> {
    logger.info('Setting callbackUrl');
    if (!ctx.session.callbackUrl && !ctx.query.callbackUrl) {
        ctx.session.callbackUrl = ctx.headers.referer;
    }
    if (ctx.query.callbackUrl) {
        ctx.session.callbackUrl = ctx.query.callbackUrl;
    }

    if (!ctx.session.applications && ctx.query.applications) {
        ctx.session.applications = ctx.query.applications.split(',');
    }
    if (!ctx.session.generateToken) {
        ctx.session.generateToken = ctx.query.token === 'true';
    }
    if (!ctx.session.originApplication || ctx.query.origin) {
        ctx.session.originApplication = ctx.query.origin || Settings.getSettings().defaultApp;
    }

    await next();
}

async function loadApplicationGeneralConfig(ctx: Context, next: Next): Promise<void> {
    const generalConfig: { application: string } = {
        application: config.get('application')
    };

    ctx.state.generalConfig = cloneDeep(generalConfig); // avoiding a bug when changes in DB are not applied

    const app: string = Utils.getOriginApp(ctx);
    const applicationConfig: IApplication = Settings.getSettings().applications && Settings.getSettings().applications[app];

    if (applicationConfig) {
        ctx.state.generalConfig.application = { ...ctx.state.generalConfig.application, ...applicationConfig };
    }

    await next();
}

async function setCallbackUrlOnlyWithQueryParam(ctx: Context, next: Next): Promise<void> {
    logger.info('Setting callbackUrl');
    if (ctx.query.callbackUrl) {
        ctx.session.callbackUrl = ctx.query.callbackUrl;
    }
    if (ctx.query.generateToken) {
        ctx.session.generateToken = ctx.query.token === 'true';
    }
    if (ctx.query.origin) {
        ctx.session.originApplication = ctx.query.origin || Settings.getSettings().defaultApp;
    }

    await next();
}

const authRouterGenerator: (authProvider: string) => Router = (authProvider: string) => {

    // TODO: add a proper interface definition here
    let UserProvider: Record<string, any>;
    let FBProvider: Record<string, any>;
    let GProvider: Record<string, any>;
    let AProvider: Record<string, any>;

    switch (authProvider) {

        case 'CT':
            UserProvider = LocalProvider;
            FBProvider = FacebookProvider;
            GProvider = GoogleProvider;
            AProvider = AppleProvider;
            break;
        case 'OKTA':
            UserProvider = OktaProvider;
            FBProvider = OktaFacebookProvider;
            GProvider = OktaGoogleProvider;
            AProvider = OktaAppleProvider;
            break;
        default:
            throw new Error(`Unknown Auth provider ${authProvider}`);

    }

    const router: Router = new Router<DefaultState, Context>({ prefix: '/auth' });

    router.get('/google', setCallbackUrl, GProvider.google);
    router.get('/google/callback', GProvider.googleCallback, UserProvider.updateApplications);
    router.get('/google/token', GProvider.googleToken, UserProvider.generateJWT);

    router.get('/facebook', setCallbackUrl, FBProvider.facebook);
    router.get('/facebook/callback', FBProvider.facebookCallback, UserProvider.updateApplications);
    router.get('/facebook/token', FBProvider.facebookToken, UserProvider.generateJWT);

    router.get('/apple', setCallbackUrl, AProvider.apple);
    router.post('/apple/callback', AProvider.appleCallback, UserProvider.updateApplications);
    router.get('/apple/token', AProvider.appleToken, UserProvider.generateJWT);

    router.get('/', setCallbackUrl, UserProvider.redirectLogin);
// @ts-ignore
    router.get('/login', setCallbackUrl, loadApplicationGeneralConfig, UserProvider.loginView);
    router.post('/login', UserProvider.localCallback);
    router.get('/fail', loadApplicationGeneralConfig, UserProvider.failAuth);
// @ts-ignore
    router.get('/check-logged', UserProvider.checkLogged);
    router.get('/success', loadApplicationGeneralConfig, UserProvider.success);
    router.get('/logout', setCallbackUrlOnlyWithQueryParam, UserProvider.logout);
    router.get('/sign-up', loadApplicationGeneralConfig, UserProvider.getSignUp);
    router.post('/sign-up', loadApplicationGeneralConfig, UserProvider.signUp);
// @ts-ignore
    router.get('/confirm/:token', UserProvider.confirmUser);
    router.get('/reset-password', loadApplicationGeneralConfig, UserProvider.requestEmailResetView);
    router.post('/reset-password', loadApplicationGeneralConfig, UserProvider.sendResetMail);
    router.get('/reset-password/:token', loadApplicationGeneralConfig, UserProvider.resetPasswordView);
    router.post('/reset-password/:token', loadApplicationGeneralConfig, UserProvider.resetPassword);
    router.get('/generate-token', Utils.isLogged, UserProvider.generateJWT);
// @ts-ignore
    router.get('/user', Utils.isLogged, Utils.isAdmin, UserProvider.getUsers);
    router.get('/user/me', Utils.isLogged, UserProvider.getCurrentUser);
    router.get('/user/from-token', Utils.isLogged, UserProvider.getCurrentUser);
// @ts-ignore
    router.get('/user/:id', Utils.isLogged, Utils.isAdmin, UserProvider.getUserById);
// @ts-ignore
    router.post('/user/find-by-ids', Utils.isLogged, Utils.isMicroservice, UserProvider.findByIds);
// @ts-ignore
    router.get('/user/ids/:role', Utils.isLogged, Utils.isMicroservice, UserProvider.getIdsByRole);
// @ts-ignore
    router.post('/user', Utils.isLogged, Utils.isAdminOrManager, loadApplicationGeneralConfig, UserProvider.createUser);
    router.patch('/user/me', Utils.isLogged, UserProvider.updateMe);
// @ts-ignore
    router.patch('/user/:id', Utils.isLogged, Utils.isAdmin, UserProvider.updateUser);
// @ts-ignore
    router.delete('/user/:id', Utils.isLogged, Utils.isAdmin, UserProvider.deleteUser);

    if (authProvider === 'OKTA') {
        router.get('/authorization-code/callback', OktaProvider.authCodeCallback, OktaProvider.updateApplications);
    }

    return router;
};

export default authRouterGenerator;
