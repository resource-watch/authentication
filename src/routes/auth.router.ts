import { Context, DefaultState, Next } from "koa";
import passport from 'koa-passport';
import Router from 'koa-router';
import { cloneDeep } from 'lodash';

import LocalProvider from 'providers/local.provider';
import logger from 'logger';
import Utils from 'utils';
import Settings, { IApplication } from "services/settings.service";
import FacebookProvider from "../providers/facebook.provider";
import GoogleProvider from "../providers/google.provider";
import AppleProvider from "../providers/apple.provider";
import config from "config";

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
    const applicationConfig: IApplication = Utils.getApplicationsConfig(ctx);

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

router.get('/google', setCallbackUrl, GoogleProvider.google);
router.get('/google/callback', GoogleProvider.googleCallback, GoogleProvider.updateApplications);
router.get('/google/token', GoogleProvider.googleToken, GoogleProvider.generateJWT);

router.get('/facebook/token', FacebookProvider.facebookToken, FacebookProvider.generateJWT);
router.get('/facebook', setCallbackUrl, FacebookProvider.facebook);
router.get('/facebook/callback', FacebookProvider.facebookCallback, FacebookProvider.updateApplications);

router.get('/apple', setCallbackUrl, AppleProvider.apple);
router.post('/apple/callback', AppleProvider.appleCallback, AppleProvider.updateApplications);
router.get('/apple/token', AppleProvider.appleToken, AppleProvider.generateJWT);

router.get('/', setCallbackUrl, LocalProvider.redirectLogin);
// @ts-ignore
router.get('/basic', passport.authenticate('basic'), LocalProvider.success);
// @ts-ignore
router.get('/login', setCallbackUrl, loadApplicationGeneralConfig, LocalProvider.loginView);
// @ts-ignore
router.post('/login', LocalProvider.localCallback);
router.get('/fail', loadApplicationGeneralConfig, LocalProvider.failAuth);

// @ts-ignore
router.get('/check-logged', LocalProvider.checkLogged);
router.get('/success', loadApplicationGeneralConfig, LocalProvider.success);
router.get('/logout', setCallbackUrlOnlyWithQueryParam, LocalProvider.logout);

// @ts-ignore
router.get('/sign-up', loadApplicationGeneralConfig, LocalProvider.getSignUp);
// @ts-ignore
router.post('/sign-up', loadApplicationGeneralConfig, LocalProvider.signUp);

// @ts-ignore
router.get('/confirm/:token', LocalProvider.confirmUser);
router.get('/reset-password', loadApplicationGeneralConfig, LocalProvider.requestEmailResetView);
router.post('/reset-password', loadApplicationGeneralConfig, LocalProvider.sendResetMail);
router.get('/reset-password/:token', loadApplicationGeneralConfig, LocalProvider.resetPasswordView);
router.post('/reset-password/:token', loadApplicationGeneralConfig, LocalProvider.resetPassword);

router.get('/generate-token', Utils.isLogged, LocalProvider.generateJWT);

// @ts-ignore
router.get('/user', Utils.isLogged, Utils.isAdmin, LocalProvider.getUsers);
router.get('/user/me', Utils.isLogged, LocalProvider.getCurrentUser);
router.get('/user/from-token', Utils.isLogged, LocalProvider.getCurrentUser);
// @ts-ignore
router.get('/user/:id', Utils.isLogged, Utils.isAdmin, LocalProvider.getUserById);
// @ts-ignore
router.post('/user/find-by-ids', Utils.isLogged, Utils.isMicroservice, LocalProvider.findByIds);
// @ts-ignore
router.get('/user/ids/:role', Utils.isLogged, Utils.isMicroservice, LocalProvider.getIdsByRole);
// @ts-ignore
router.post('/user', Utils.isLogged, Utils.isAdminOrManager, loadApplicationGeneralConfig, LocalProvider.createUser);
router.patch('/user/me', Utils.isLogged, LocalProvider.updateMe);
// @ts-ignore
router.patch('/user/:id', Utils.isLogged, Utils.isAdmin, LocalProvider.updateUser);
// @ts-ignore
router.delete('/user/:id', Utils.isLogged, Utils.isAdmin, LocalProvider.deleteUser);

export default router;
