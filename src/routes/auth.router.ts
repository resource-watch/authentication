import { Context, DefaultState, Next } from "koa";
import passport from 'koa-passport';
import Router from 'koa-router';
import { cloneDeep } from 'lodash';

import CTAuthRouter from 'routes/ct-oauth.router';
import logger from 'logger';
import Utils from 'utils';
import Settings, { IApplication } from "services/settings.service";

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
    const generalConfig: { mongoUri: string, application: string } = Utils.getGeneralConfig();

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

async function hasSignUpPermissions(ctx: Context, next: Next): Promise<void> {
    if (!Settings.getSettings().allowPublicRegistration) {
        await Utils.isLogged(ctx, () => {
            return new Promise(resolve => resolve(null));
        });
        await Utils.isAdmin(ctx, () => {
            return new Promise(resolve => resolve(null));
        });
    }
    await next();
}

const router: Router = new Router<DefaultState, Context>({ prefix: '/auth' });

router.get('/google', setCallbackUrl, CTAuthRouter.google);
router.get('/google/callback', CTAuthRouter.googleCallback, CTAuthRouter.updateApplications);
router.get('/google/token', CTAuthRouter.googleToken, CTAuthRouter.generateJWT);

router.get('/facebook/token', CTAuthRouter.facebookToken, CTAuthRouter.generateJWT);
router.get('/facebook', setCallbackUrl, CTAuthRouter.facebook);
router.get('/facebook/callback', CTAuthRouter.facebookCallback, CTAuthRouter.updateApplications);

router.get('/', setCallbackUrl, CTAuthRouter.redirectLogin);
// @ts-ignore
router.get('/basic', passport.authenticate('basic'), CTAuthRouter.success);
// @ts-ignore
router.get('/login', setCallbackUrl, loadApplicationGeneralConfig, CTAuthRouter.loginView);
// @ts-ignore
router.post('/login', CTAuthRouter.localCallback);
router.get('/fail', loadApplicationGeneralConfig, CTAuthRouter.failAuth);

// @ts-ignore
router.get('/check-logged', CTAuthRouter.checkLogged);
router.get('/success', loadApplicationGeneralConfig, CTAuthRouter.success);
router.get('/logout', setCallbackUrlOnlyWithQueryParam, CTAuthRouter.logout);

// @ts-ignore
router.get('/sign-up', hasSignUpPermissions, loadApplicationGeneralConfig, CTAuthRouter.getSignUp);
// @ts-ignore
router.post('/sign-up', hasSignUpPermissions, loadApplicationGeneralConfig, CTAuthRouter.signUp);

// @ts-ignore
router.get('/confirm/:token', CTAuthRouter.confirmUser);
router.get('/reset-password', loadApplicationGeneralConfig, CTAuthRouter.requestEmailResetView);
router.post('/reset-password', loadApplicationGeneralConfig, CTAuthRouter.sendResetMail);
router.get('/reset-password/:token', loadApplicationGeneralConfig, CTAuthRouter.resetPasswordView);
router.post('/reset-password/:token', loadApplicationGeneralConfig, CTAuthRouter.resetPassword);

router.get('/generate-token', Utils.isLogged, CTAuthRouter.generateJWT);

// @ts-ignore
router.get('/user', Utils.isLogged, Utils.isAdmin, CTAuthRouter.getUsers);
router.get('/user/me', Utils.isLogged, CTAuthRouter.getCurrentUser);
router.get('/user/from-token', Utils.isLogged, CTAuthRouter.getCurrentUser);
// @ts-ignore
router.get('/user/:id', Utils.isLogged, Utils.isAdmin, CTAuthRouter.getUserById);
// @ts-ignore
router.post('/user/find-by-ids', Utils.isLogged, Utils.isMicroservice, CTAuthRouter.findByIds);
// @ts-ignore
router.get('/user/ids/:role', Utils.isLogged, Utils.isMicroservice, CTAuthRouter.getIdsByRole);
// @ts-ignore
router.post('/user', Utils.isLogged, Utils.isAdminOrManager, loadApplicationGeneralConfig, CTAuthRouter.createUser);
router.patch('/user/me', Utils.isLogged, CTAuthRouter.updateMe);
// @ts-ignore
router.patch('/user/:id', Utils.isLogged, Utils.isAdmin, CTAuthRouter.updateUser);
// @ts-ignore
router.delete('/user/:id', Utils.isLogged, Utils.isAdmin, CTAuthRouter.deleteUser);

export default router;
