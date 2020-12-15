import config from "config";
import {Context, DefaultState, ExtendableContext, Next} from "koa";
import passport from 'koa-passport';
import Router, {IRouterParamContext} from 'koa-router';
import { cloneDeep } from 'lodash';
import logger from 'logger';
import Utils from 'utils';

import Settings, { IApplication } from "services/settings.service";
import AppleProvider from "providers/apple.provider";
import FacebookProvider from "providers/facebook.provider";
import GoogleProvider from "providers/google.provider";
import LocalProvider from 'providers/local.provider';
import OktaProvider from "providers/okta.provider";

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

async function redirectLogin(ctx: Context): Promise<void> {
    config.get('authProvider') === 'CT' ? await LocalProvider.redirectLogin(ctx) : await OktaProvider.redirectLogin(ctx);
}

async function success(ctx: Context): Promise<void> {
    config.get('authProvider') === 'CT' ? await LocalProvider.success(ctx) : await OktaProvider.success(ctx);
}

async function loginView(ctx: Context): Promise<void> {
    config.get('authProvider') === 'CT' ? await LocalProvider.loginView(ctx) : await OktaProvider.loginView(ctx);
}

async function localCallback(ctx: Context & ExtendableContext & IRouterParamContext, next: Next): Promise<void> {
    config.get('authProvider') === 'CT' ? await LocalProvider.localCallback(ctx, next) : await OktaProvider.localCallback(ctx, next);
}

async function failAuth(ctx: Context): Promise<void> {
    config.get('authProvider') === 'CT' ? await LocalProvider.failAuth(ctx) : await OktaProvider.failAuth(ctx);
}

async function checkLogged(ctx: Context): Promise<void> {
    config.get('authProvider') === 'CT' ? await LocalProvider.checkLogged(ctx) : await OktaProvider.checkLogged(ctx);
}

async function logout(ctx: Context): Promise<void> {
    config.get('authProvider') === 'CT' ? await LocalProvider.logout(ctx) : await OktaProvider.logout(ctx);
}

async function getSignUp(ctx: Context): Promise<void> {
    config.get('authProvider') === 'CT' ? await LocalProvider.getSignUp(ctx) : await OktaProvider.getSignUp(ctx);
}

async function signUp(ctx: Context): Promise<void> {
    config.get('authProvider') === 'CT' ? await LocalProvider.signUp(ctx) : await OktaProvider.signUp(ctx);
}

async function confirmUser(ctx: Context): Promise<void> {
    config.get('authProvider') === 'CT' ? await LocalProvider.confirmUser(ctx) : await OktaProvider.confirmUser(ctx);
}

async function requestEmailResetView(ctx: Context): Promise<void> {
    config.get('authProvider') === 'CT' ? await LocalProvider.requestEmailResetView(ctx) : await OktaProvider.requestEmailResetView(ctx);
}

async function sendResetMail(ctx: Context): Promise<void> {
    config.get('authProvider') === 'CT' ? await LocalProvider.sendResetMail(ctx) : await OktaProvider.sendResetMail(ctx);
}

async function resetPasswordView(ctx: Context): Promise<void> {
    config.get('authProvider') === 'CT' ? await LocalProvider.resetPasswordView(ctx) : await OktaProvider.resetPasswordView(ctx);
}

async function resetPassword(ctx: Context): Promise<void> {
    config.get('authProvider') === 'CT' ? await LocalProvider.resetPassword(ctx) : await OktaProvider.resetPassword(ctx);
}

async function generateJWT(ctx: Context): Promise<void> {
    config.get('authProvider') === 'CT' ? await LocalProvider.generateJWT(ctx) : await OktaProvider.generateJWT(ctx);
}

async function getUsers(ctx: Context): Promise<void> {
    config.get('authProvider') === 'CT' ? await LocalProvider.getUsers(ctx) : await OktaProvider.getUsers(ctx);
}

async function getCurrentUser(ctx: Context): Promise<void> {
    config.get('authProvider') === 'CT' ? await LocalProvider.getCurrentUser(ctx) : await OktaProvider.getCurrentUser(ctx);
}

async function getUserById(ctx: Context): Promise<void> {
    config.get('authProvider') === 'CT' ? await LocalProvider.getUserById(ctx) : await OktaProvider.getUserById(ctx);
}

async function findByIds(ctx: Context): Promise<void> {
    config.get('authProvider') === 'CT' ? await LocalProvider.findByIds(ctx) : await OktaProvider.findByIds(ctx);
}

async function getIdsByRole(ctx: Context): Promise<void> {
    config.get('authProvider') === 'CT' ? await LocalProvider.getIdsByRole(ctx) : await OktaProvider.getIdsByRole(ctx);
}

async function createUser(ctx: Context): Promise<void> {
    config.get('authProvider') === 'CT' ? await LocalProvider.createUser(ctx) : await OktaProvider.createUser(ctx);
}

async function updateMe(ctx: Context): Promise<void> {
    config.get('authProvider') === 'CT' ? await LocalProvider.updateMe(ctx) : await OktaProvider.updateMe(ctx);
}

async function updateUser(ctx: Context): Promise<void> {
    config.get('authProvider') === 'CT' ? await LocalProvider.updateUser(ctx) : await OktaProvider.updateUser(ctx);
}

async function deleteUser(ctx: Context): Promise<void> {
    config.get('authProvider') === 'CT' ? await LocalProvider.deleteUser(ctx) : await OktaProvider.deleteUser(ctx);
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

router.get('/', setCallbackUrl, redirectLogin);
// @ts-ignore
router.get('/basic', passport.authenticate('basic'), success);
// @ts-ignore
router.get('/login', setCallbackUrl, loadApplicationGeneralConfig, loginView);
router.post('/login', localCallback);
router.get('/fail', loadApplicationGeneralConfig, failAuth);
// @ts-ignore
router.get('/check-logged', checkLogged);
router.get('/success', loadApplicationGeneralConfig, success);
router.get('/logout', setCallbackUrlOnlyWithQueryParam, logout);
router.get('/sign-up', loadApplicationGeneralConfig, getSignUp);
router.post('/sign-up', loadApplicationGeneralConfig, signUp);
// @ts-ignore
router.get('/confirm/:token', confirmUser);
router.get('/reset-password', loadApplicationGeneralConfig, requestEmailResetView);
router.post('/reset-password', loadApplicationGeneralConfig, sendResetMail);
router.get('/reset-password/:token', loadApplicationGeneralConfig, resetPasswordView);
router.post('/reset-password/:token', loadApplicationGeneralConfig, resetPassword);
router.get('/generate-token', Utils.isLogged, generateJWT);
// @ts-ignore
router.get('/user', Utils.isLogged, Utils.isAdmin, getUsers);
router.get('/user/me', Utils.isLogged, getCurrentUser);
router.get('/user/from-token', Utils.isLogged, getCurrentUser);
// @ts-ignore
router.get('/user/:id', Utils.isLogged, Utils.isAdmin, getUserById);
// @ts-ignore
router.post('/user/find-by-ids', Utils.isLogged, Utils.isMicroservice, findByIds);
// @ts-ignore
router.get('/user/ids/:role', Utils.isLogged, Utils.isMicroservice, getIdsByRole);
// @ts-ignore
router.post('/user', Utils.isLogged, Utils.isAdminOrManager, loadApplicationGeneralConfig, createUser);
router.patch('/user/me', Utils.isLogged, updateMe);
// @ts-ignore
router.patch('/user/:id', Utils.isLogged, Utils.isAdmin, updateUser);
// @ts-ignore
router.delete('/user/:id', Utils.isLogged, Utils.isAdmin, deleteUser);

export default router;
