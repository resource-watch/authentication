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
            role: Joi.string().valid(...Object.values(ORGANIZATION_ROLES)).required()
        })).optional()
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
    pre: setCallbackUrl,
    handler: OktaGoogleProvider.google,
});
authRouter.route({
    method: 'get',
    path: '/google/callback',
    pre: OktaGoogleProvider.googleCallback,
    handler: OktaProvider.updateApplications,
});
authRouter.route({
    method: 'get',
    path: '/google/token',
    pre: OktaGoogleProvider.googleToken,
    handler: OktaProvider.generateJWT,
});


authRouter.route({
    method: 'get',
    path: '/facebook',
    pre: setCallbackUrl,
    handler: OktaFacebookProvider.facebook,
});
authRouter.route({
    method: 'get',
    path: '/facebook/callback',
    pre: OktaFacebookProvider.facebookCallback,
    handler: OktaProvider.updateApplications,
});
authRouter.route({
    method: 'get',
    path: '/facebook/token',
    pre: OktaFacebookProvider.facebookToken,
    handler: OktaProvider.generateJWT,
});
authRouter.route({
    method: 'get',
    path: '/apple',
    pre: setCallbackUrl,
    handler: OktaAppleProvider.apple,
});
authRouter.route({
    method: 'post',
    path: '/apple/callback',
    pre: OktaAppleProvider.appleCallback,
    handler: OktaProvider.updateApplications,
});
authRouter.route({
    method: 'get',
    path: '/apple/token',
    pre: OktaAppleProvider.appleToken,
    handler: OktaProvider.generateJWT,
});

authRouter.route({
    method: 'get',
    path: '/',
    pre: setCallbackUrl,
    handler: OktaProvider.redirectLogin,
});

authRouter.route({
    method: 'get',
    path: '/login',
    pre: [setCallbackUrl, loadApplicationGeneralConfig],
    handler: OktaProvider.loginView,
});

authRouter.route({
    method: 'post',
    path: '/login',
    handler: OktaProvider.localCallback,
});

authRouter.get('/fail', loadApplicationGeneralConfig, OktaProvider.failAuth);
authRouter.get('/check-logged', OktaProvider.checkLogged);
authRouter.get('/success', loadApplicationGeneralConfig, OktaProvider.success);
authRouter.get('/logout', setCallbackUrlOnlyWithQueryParam, OktaProvider.logout);
authRouter.get('/sign-up', loadApplicationGeneralConfig, OktaProvider.getSignUp);
authRouter.post('/sign-up', setCallbackUrl, loadApplicationGeneralConfig, OktaProvider.signUp);
authRouter.get('/reset-password', loadApplicationGeneralConfig, OktaProvider.requestEmailResetView);
authRouter.post('/reset-password', setCallbackUrl, loadApplicationGeneralConfig, OktaProvider.sendResetMail);
authRouter.get('/generate-token', Utils.isLogged, OktaProvider.generateJWT);
authRouter.get('/user', Utils.isLogged, Utils.isAdmin, OktaProvider.getUsers);
authRouter.get('/user/me', Utils.isLogged, OktaProvider.getCurrentUser);
authRouter.get('/user/:id', Utils.isLogged, Utils.isAdminOrMicroservice, OktaProvider.getUserById);
authRouter.get('/user/:id/resources', Utils.isLogged, Utils.isAdminOrMicroservice, OktaProvider.getUserResources);
authRouter.post('/user/find-by-ids', Utils.isLogged, Utils.isMicroservice, OktaProvider.findByIds);
authRouter.get('/user/ids/:role', Utils.isLogged, Utils.isMicroservice, OktaProvider.getIdsByRole);
authRouter.post('/user', Utils.isLogged, Utils.isAdminOrManager, loadApplicationGeneralConfig, OktaProvider.createUser);

authRouter.route({
    method: 'patch',
    path: '/user/me',
    validate: updateUserValidation,
    pre: Utils.isLogged,
    handler: OktaProvider.updateMe,
});
authRouter.route({
    method: 'patch',
    path: '/user/:id',
    validate: updateUserValidation,
    pre: [Utils.isLogged, Utils.isAdmin],
    handler: OktaProvider.updateUser,
});

authRouter.delete('/user/:id', Utils.isLogged, Utils.isAdminOrMicroserviceOrSameUserToDelete, OktaProvider.deleteUser);

authRouter.get('/authorization-code/callback', OktaProvider.authCodeCallback, OktaProvider.updateApplications);

// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore
authRouter.get('/sign-up-redirect', OktaProvider.signUpRedirect);

export default authRouter;
