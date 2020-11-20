const passport = require('koa-passport');
const Router = require('koa-router');
const logger = require('logger');
const { cloneDeep } = require('lodash');

const Utils = require('utils');

const CTAuthRouter = require('plugins/sd-ct-oauth-plugin/auth.router');
const Plugin = require('models/plugin.model');

async function setCallbackUrl(ctx, next) {
    const plugin = await Plugin.findOne({ name: 'oauth' });

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
        ctx.session.originApplication = ctx.query.origin || plugin.config.defaultApp;
    }

    await next();
}

async function loadApplicationGeneralConfig(ctx, next) {
    const plugin = await Plugin.findOne({ name: 'oauth' });
    const generalConfig = Utils.getGeneralConfig();

    ctx.state.generalConfig = cloneDeep(generalConfig); // avoiding a bug when changes in DB are not applied
    const applicationConfig = Utils.getApplicationsConfig(ctx, plugin);

    if (applicationConfig) {
        ctx.state.generalConfig.application = { ...ctx.state.generalConfig.application, ...applicationConfig };
    }

    await next();
}

async function setCallbackUrlOnlyWithQueryParam(ctx, next) {
    const plugin = await Plugin.findOne({ name: 'oauth' });

    logger.info('Setting callbackUrl');
    if (ctx.query.callbackUrl) {
        ctx.session.callbackUrl = ctx.query.callbackUrl;
    }
    if (ctx.query.generateToken) {
        ctx.session.generateToken = ctx.query.token === 'true';
    }
    if (ctx.query.origin) {
        ctx.session.originApplication = ctx.query.origin || plugin.config.defaultApp;
    }

    await next();
}

async function hasSignUpPermissions(ctx, next) {
    const plugin = await Plugin.findOne({ name: 'oauth' });

    if (!plugin.config.allowPublicRegistration) {
        await Utils.isLogged(ctx, () => {});
        await Utils.isAdmin(ctx, () => {});
    }
    await next();
}

const router = new Router({ prefix: '/auth' });

router.get('/twitter', setCallbackUrl, CTAuthRouter.twitter);
router.get('/twitter/callback', CTAuthRouter.twitterCallback, CTAuthRouter.updateApplications);

router.get('/google', setCallbackUrl, CTAuthRouter.google);
router.get('/google/callback', CTAuthRouter.googleCallback, CTAuthRouter.updateApplications);
router.get('/google/token', CTAuthRouter.googleToken, CTAuthRouter.generateJWT);

router.get('/facebook/token', CTAuthRouter.facebookToken, CTAuthRouter.generateJWT);
router.get('/facebook', setCallbackUrl, CTAuthRouter.facebook);
router.get('/facebook/callback', CTAuthRouter.facebookCallback, CTAuthRouter.updateApplications);

router.get('/', setCallbackUrl, CTAuthRouter.redirectLogin);
router.get('/basic', passport.authenticate('basic'), CTAuthRouter.success);
router.get('/login', setCallbackUrl, loadApplicationGeneralConfig, CTAuthRouter.loginView);
router.post('/login', CTAuthRouter.localCallback);
router.get('/fail', loadApplicationGeneralConfig, CTAuthRouter.failAuth);

router.get('/check-logged', CTAuthRouter.checkLogged);
router.get('/success', loadApplicationGeneralConfig, CTAuthRouter.success);
router.get('/logout', setCallbackUrlOnlyWithQueryParam, CTAuthRouter.logout);

router.get('/sign-up', hasSignUpPermissions, loadApplicationGeneralConfig, CTAuthRouter.getSignUp);
router.post('/sign-up', hasSignUpPermissions, loadApplicationGeneralConfig, CTAuthRouter.signUp);

router.get('/confirm/:token', CTAuthRouter.confirmUser);
router.get('/reset-password', loadApplicationGeneralConfig, CTAuthRouter.requestEmailResetView);
router.post('/reset-password', loadApplicationGeneralConfig, CTAuthRouter.sendResetMail);
router.get('/reset-password/:token', loadApplicationGeneralConfig, CTAuthRouter.resetPasswordView);
router.post('/reset-password/:token', loadApplicationGeneralConfig, CTAuthRouter.resetPassword);

router.get('/generate-token', Utils.isLogged, CTAuthRouter.generateJWT);

router.get('/user', Utils.isLogged, Utils.isAdmin, CTAuthRouter.getUsers);
router.get('/user/me', Utils.isLogged, CTAuthRouter.getCurrentUser);
router.get('/user/from-token', Utils.isLogged, CTAuthRouter.getCurrentUser);
router.get('/user/:id', Utils.isLogged, Utils.isAdmin, CTAuthRouter.getUserById);
router.post('/user/find-by-ids', Utils.isLogged, Utils.isMicroservice, CTAuthRouter.findByIds);
router.get('/user/ids/:role', Utils.isLogged, Utils.isMicroservice, CTAuthRouter.getIdsByRole);
router.post('/user', Utils.isLogged, Utils.isAdminOrManager, loadApplicationGeneralConfig, CTAuthRouter.createUser);
router.patch('/user/me', Utils.isLogged, CTAuthRouter.updateMe);
router.patch('/user/:id', Utils.isLogged, Utils.isAdmin, CTAuthRouter.updateUser);
router.delete('/user/:id', Utils.isLogged, Utils.isAdmin, CTAuthRouter.deleteUser);

module.exports = router;
