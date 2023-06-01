import config from 'config';
import { Context, Next } from 'koa';
import router, { Router } from 'koa-joi-router';
import { cloneDeep } from 'lodash';
import logger from 'logger';
import Utils from 'utils';
import Settings, { IApplication } from 'services/settings.service';
import OktaProvider from 'providers/okta.provider';
import OktaFacebookProvider from 'providers/okta.facebook.provider';
import OktaGoogleProvider from 'providers/okta.google.provider';
import OktaAppleProvider from 'providers/okta.apple.provider';
import { ORGANIZATION_ROLES } from "models/organization-user";

const authRouter: Router = router();
authRouter.prefix('/auth');

const Joi: typeof router.Joi = router.Joi;

// TODO: add proper validation to other body properties
const createUserValidation: Record<string, any> = {
    type: 'json',
    query: {
        loggedUser: Joi.any().optional(),
    },
    body: Joi.object({
        organizations: Joi.array().items(Joi.object({
            id: Joi.string().required(),
            role: Joi.string().valid(ORGANIZATION_ROLES.ORG_MEMBER).required()
        })).optional(),
        applications: Joi.array().items(Joi.string()).optional(),
    }).unknown(true)
};

// TODO: add proper validation to other body properties
const updateUserValidation: Record<string, any> = {
    type: 'json',
    query: {
        loggedUser: Joi.any().optional(),
    },
    body: Joi.object({
        name: Joi.string().optional(),
        email: Joi.string().optional(),
        password: Joi.string().optional(),
        role: Joi.string().optional(),
        organizations: Joi.array().items(Joi.object({
            id: Joi.string().required(),
            role: Joi.string().valid(ORGANIZATION_ROLES.ORG_MEMBER).required()
        })).optional(),
        applications: Joi.array().items(Joi.string()).optional(),
    }).unknown(true)
};

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

authRouter.route({
    method: 'get',
    path: '/google',
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore
    pre: setCallbackUrl, handler: OktaGoogleProvider.google,
});
authRouter.route({
    method: 'get',
    path: '/google/callback',
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore
    pre: OktaGoogleProvider.googleCallback, handler: OktaProvider.updateApplications,
});
authRouter.route({
    method: 'get',
    path: '/google/token',
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore
    pre: OktaGoogleProvider.googleToken, handler: OktaProvider.generateJWT,
});


authRouter.route({
    method: 'get',
    path: '/facebook',
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore
    pre: setCallbackUrl, handler: OktaFacebookProvider.facebook,
});
authRouter.route({
    method: 'get',
    path: '/facebook/callback',
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore
    pre: OktaFacebookProvider.facebookCallback, handler: OktaProvider.updateApplications,
});
authRouter.route({
    method: 'get',
    path: '/facebook/token',
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore
    pre: OktaFacebookProvider.facebookToken, handler: OktaProvider.generateJWT,
});
authRouter.route({
    method: 'get',
    path: '/apple',
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore
    pre: setCallbackUrl, handler: OktaAppleProvider.apple,
});
authRouter.route({
    method: 'post',
    path: '/apple/callback',
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore
    pre: OktaAppleProvider.appleCallback, handler: OktaProvider.updateApplications,
});
authRouter.route({
    method: 'get',
    path: '/apple/token',
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore
    pre: OktaAppleProvider.appleToken, handler: OktaProvider.generateJWT,
});

authRouter.route({
    method: 'get',
    path: '/',
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore
    pre: setCallbackUrl, handler: OktaProvider.redirectLogin,
});

authRouter.route({
    method: 'get',
    path: '/login',
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore
    pre: [setCallbackUrl, loadApplicationGeneralConfig], handler: OktaProvider.loginView,
});

authRouter.route({
    method: 'post',
    path: '/login',
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore
    handler: OktaProvider.localCallback,
});

// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore
authRouter.get('/fail', loadApplicationGeneralConfig, OktaProvider.failAuth);
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore
authRouter.get('/check-logged', OktaProvider.checkLogged);
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore
authRouter.get('/success', loadApplicationGeneralConfig, OktaProvider.success);
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore
authRouter.get('/logout', setCallbackUrlOnlyWithQueryParam, OktaProvider.logout);
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore
authRouter.get('/sign-up', loadApplicationGeneralConfig, OktaProvider.getSignUp);
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore
authRouter.post('/sign-up', setCallbackUrl, loadApplicationGeneralConfig, OktaProvider.signUp);
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore
authRouter.get('/reset-password', loadApplicationGeneralConfig, OktaProvider.requestEmailResetView);
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore
authRouter.post('/reset-password', setCallbackUrl, loadApplicationGeneralConfig, OktaProvider.sendResetMail);
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore
authRouter.get('/generate-token', Utils.isLogged, OktaProvider.generateJWT);
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore
authRouter.get('/user', Utils.isLogged, Utils.isAdmin, OktaProvider.getUsers);
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore
authRouter.get('/user/me', Utils.isLogged, OktaProvider.getCurrentUser);
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore
authRouter.get('/user/:id', Utils.isLogged, Utils.isAdminOrMicroservice, OktaProvider.getUserById);
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore
authRouter.get('/user/:id/resources', Utils.isLogged, Utils.isAdminOrMicroservice, OktaProvider.getUserResources);
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore
authRouter.post('/user/find-by-ids', Utils.isLogged, Utils.isMicroservice, OktaProvider.findByIds);
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore
authRouter.get('/user/ids/:role', Utils.isLogged, Utils.isMicroservice, OktaProvider.getIdsByRole);

authRouter.route({
    method: 'post',
    path: '/user',
    validate: createUserValidation,
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore
    pre: [Utils.isLogged, Utils.isAdminOrManager, loadApplicationGeneralConfig], handler: OktaProvider.createUser,
});

authRouter.route({
    method: 'patch',
    path: '/user/me',
    validate: updateUserValidation,
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore
    pre: Utils.isLogged, handler: OktaProvider.updateMe,
});
authRouter.route({
    method: 'patch',
    path: '/user/:id',
    validate: updateUserValidation,
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore
    pre: [Utils.isLogged, Utils.isAdmin], handler: OktaProvider.updateUser,
});

// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore
authRouter.delete('/user/:id', Utils.isLogged, Utils.isAdminOrMicroserviceOrSameUserToDelete, OktaProvider.deleteUser);

// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore
authRouter.get('/authorization-code/callback', OktaProvider.authCodeCallback, OktaProvider.updateApplications);

// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore
authRouter.get('/sign-up-redirect', OktaProvider.signUpRedirect);

export default authRouter;
