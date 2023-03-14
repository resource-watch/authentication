import config from 'config';
import { Context, DefaultState, Next } from 'koa';
import Router from 'koa-router';
import { cloneDeep } from 'lodash';
import logger from 'logger';
import Utils from 'utils';

import Settings, { IApplication } from 'services/settings.service';
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
    if (ctx.request.body.callbackUrl) {
        ctx.session.callbackUrl = ctx.request.body.callbackUrl;
    }

    if (!ctx.session.applications && ctx.query.applications) {
        const applications: string = ctx.query.applications as string;
        ctx.session.applications = applications.split(',');
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

const router: Router = new Router<DefaultState, Context>({ prefix: '/auth' });

router.get('/google', setCallbackUrl, OktaGoogleProvider.google);
router.get('/google/callback', OktaGoogleProvider.googleCallback, OktaProvider.updateApplications);
router.get('/google/token', OktaGoogleProvider.googleToken, OktaProvider.generateJWT);

router.get('/facebook', setCallbackUrl, OktaFacebookProvider.facebook);
router.get('/facebook/callback', OktaFacebookProvider.facebookCallback, OktaProvider.updateApplications);
router.get('/facebook/token', OktaFacebookProvider.facebookToken, OktaProvider.generateJWT);

router.get('/apple', setCallbackUrl, OktaAppleProvider.apple);
router.post('/apple/callback', OktaAppleProvider.appleCallback, OktaProvider.updateApplications);
router.get('/apple/token', OktaAppleProvider.appleToken, OktaProvider.generateJWT);

router.get('/', setCallbackUrl, OktaProvider.redirectLogin);
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore
router.get('/login', setCallbackUrl, loadApplicationGeneralConfig, OktaProvider.loginView);
router.post('/login', OktaProvider.localCallback);
router.get('/fail', loadApplicationGeneralConfig, OktaProvider.failAuth);
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore
router.get('/check-logged', OktaProvider.checkLogged);
router.get('/success', loadApplicationGeneralConfig, OktaProvider.success);
router.get('/logout', setCallbackUrlOnlyWithQueryParam, OktaProvider.logout);
router.get('/sign-up', loadApplicationGeneralConfig, OktaProvider.getSignUp);
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore
router.post('/sign-up', setCallbackUrl, loadApplicationGeneralConfig, OktaProvider.signUp);
router.get('/reset-password', loadApplicationGeneralConfig, OktaProvider.requestEmailResetView);
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore
router.post('/reset-password', setCallbackUrl, loadApplicationGeneralConfig, OktaProvider.sendResetMail);
router.get('/generate-token', Utils.isLogged, OktaProvider.generateJWT);
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore
router.get('/user', Utils.isLogged, Utils.isAdmin, OktaProvider.getUsers);
router.get('/user/me', Utils.isLogged, OktaProvider.getCurrentUser);
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore
router.get('/user/:id', Utils.isLogged, Utils.isAdminOrMicroservice, OktaProvider.getUserById);
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore
router.get('/user/:id/resources', Utils.isLogged, Utils.isAdminOrMicroservice, OktaProvider.getUserResources);
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore
router.post('/user/find-by-ids', Utils.isLogged, Utils.isMicroservice, OktaProvider.findByIds);
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore
router.get('/user/ids/:role', Utils.isLogged, Utils.isMicroservice, OktaProvider.getIdsByRole);
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore
router.post('/user', Utils.isLogged, Utils.isAdminOrManager, loadApplicationGeneralConfig, OktaProvider.createUser);
router.patch('/user/me', Utils.isLogged, OktaProvider.updateMe);
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore
router.patch('/user/:id', Utils.isLogged, Utils.isAdmin, OktaProvider.updateUser);
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore
router.delete('/user/:id', Utils.isLogged, Utils.isAdminOrMicroserviceOrSameUserToDelete, OktaProvider.deleteUser);

router.get('/authorization-code/callback', OktaProvider.authCodeCallback, OktaProvider.updateApplications);

// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore
router.get('/sign-up-redirect', OktaProvider.signUpRedirect);

export default router;
