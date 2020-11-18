const passport = require('koa-passport');
const Router = require('koa-router');
const config = require('config');
const logger = require('logger');
const { cloneDeep } = require('lodash');

const CTAuthRouter = require('plugins/sd-ct-oauth-plugin/auth.router');
const Plugin = require('models/plugin.model');

const getUser = (ctx) => ctx.req.user || ctx.state.user || ctx.state.microservice;

async function isLogged(ctx, next) {
    logger.info('Checking if user is logged');
    if (getUser(ctx)) {
        await next();
    } else {
        logger.info('Not logged');
        ctx.throw(401, 'Not authenticated');
    }
}

async function isAdmin(ctx, next) {
    logger.info('Checking if user is admin');
    const user = getUser(ctx);
    if (!user) {
        logger.info('Not authenticated');
        ctx.throw(401, 'Not authenticated');
        return;
    }
    if (user.role === 'ADMIN') {
        logger.info('User is admin');
        await next();
    } else {
        logger.info('Not admin');
        ctx.throw(403, 'Not authorized');
    }
}

async function isAdminOrManager(ctx, next) {
    logger.info('Checking if user is admin or manager');
    const user = getUser(ctx);
    if (!user) {
        logger.info('Not authenticated');
        ctx.throw(401, 'Not authenticated');
        return;
    }
    if (user.role === 'ADMIN' || user.role === 'MANAGER') {
        await next();
    } else {
        logger.info('Not admin');
        ctx.throw(403, 'Not authorized');
    }
}

async function isMicroservice(ctx, next) {
    logger.info('Checking if user is a microservice');
    const user = getUser(ctx);
    if (!user) {
        logger.info('Not authenticated');
        ctx.throw(401, 'Not authenticated');
        return;
    }
    if (user.id === 'microservice') {
        await next();
    } else {
        logger.info('Not admin');
        ctx.throw(403, 'Not authorized');
    }
}

const getOriginApp = (ctx, pluginData) => {
    if (ctx.query.origin) {
        return ctx.query.origin;
    }

    if (ctx.session && ctx.session.originApplication) {
        return ctx.session.originApplication;
    }

    return pluginData.config.defaultApp;
};

const getApplicationsConfig = (ctx, pluginData) => {
    const app = getOriginApp(ctx, pluginData);
    return pluginData.config.applications && pluginData.config.applications[app];
};

function getGeneralConfig() {
    return {
        mongoUri: process.env.CT_MONGO_URI || `mongodb://${config.get('mongodb.host')}:${config.get('mongodb.port')}/${config.get('mongodb.database')}`,
        application: config.get('application'),
    };
}

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
    const generalConfig = getGeneralConfig();

    ctx.state.generalConfig = cloneDeep(generalConfig); // avoiding a bug when changes in DB are not applied
    const applicationConfig = getApplicationsConfig(ctx, plugin);

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
        await isLogged(ctx, () => {});
        await isAdmin(ctx, () => {});
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

router.get('/generate-token', isLogged, CTAuthRouter.generateJWT);

router.get('/user', isLogged, isAdmin, CTAuthRouter.getUsers);
router.get('/user/me', isLogged, CTAuthRouter.getCurrentUser);
router.get('/user/:id', isLogged, isAdmin, CTAuthRouter.getUserById);
router.post('/user/find-by-ids', isLogged, isMicroservice, CTAuthRouter.findByIds);
router.get('/user/ids/:role', isLogged, isMicroservice, CTAuthRouter.getIdsByRole);
router.post('/user', isLogged, isAdminOrManager, loadApplicationGeneralConfig, CTAuthRouter.createUser);
router.patch('/user/me', isLogged, CTAuthRouter.updateMe);
router.patch('/user/:id', isLogged, isAdmin, CTAuthRouter.updateUser);
router.delete('/user/:id', isLogged, isAdmin, CTAuthRouter.deleteUser);

module.exports = router;
