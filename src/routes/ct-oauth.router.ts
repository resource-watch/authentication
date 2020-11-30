import { Context, Next } from "koa";
import { RouterContext } from "koa-router";
import passport from 'koa-passport';
import { omit } from 'lodash';
import { URL } from "url";

import logger from 'logger';
import Utils from 'utils';
import UserService from 'services/user.service';
import UnprocessableEntityError from 'errors/unprocessableEntity.error';
import UnauthorizedError from 'errors/unauthorized.error';
import UserTempSerializer from 'serializers/user-temp.serializer';
import UserSerializer from 'serializers/user.serializer';
import Settings, { IApplication, IThirdPartyAuth } from "services/settings.service";
import { IUser } from "../models/user.model";
import { PaginateResult, Types } from "mongoose";
import { IUserTemp } from "../models/user-temp.model";
import { IRenew } from "../models/renew.model";

const twitter: (ctx: Context, next: Next) => Promise<void> = async (ctx: Context & RouterContext, next: Next) => {
    const app: string = Utils.getOriginApp(ctx);
    await passport.authenticate(`twitter:${app}`)(ctx, next);
};

const twitterCallback: (ctx: Context, next: Next) => Promise<void> = async (ctx: Context & RouterContext, next: Next) => {
    const app: string = Utils.getOriginApp(ctx);
    await passport.authenticate(`twitter:${app}`, {
        failureRedirect: '/auth/fail',
    })(ctx, next);
};

const facebook: (ctx: Context, next: Next) => Promise<void> = async (ctx: Context & RouterContext, next: Next) => {
    const app: string = Utils.getOriginApp(ctx);
    await passport.authenticate(`facebook:${app}`, {
        scope: Settings.getSettings().thirdParty[app] ? Settings.getSettings().thirdParty[app].facebook.scope : [],
    })(ctx, next);
};

const facebookToken: (ctx: Context, next: Next) => Promise<void> = async (ctx: Context & RouterContext, next: Next) => {
    const app: string = Utils.getOriginApp(ctx);
    await passport.authenticate(`facebook-token:${app}`)(ctx, next);
};

const facebookCallback: (ctx: Context, next: Next) => Promise<void> = async (ctx: Context & RouterContext, next: Next) => {
    const app: string = Utils.getOriginApp(ctx);
    await passport.authenticate(
        `facebook:${app}`,
        { failureRedirect: '/auth/fail' }
    )(ctx, next);
};

const google: (ctx: Context, next: Next) => Promise<void> = async (ctx: Context & RouterContext, next: Next) => {
    const app: string = Utils.getOriginApp(ctx);
    await passport.authenticate(`google:${app}`, {
        scope: (Settings.getSettings().thirdParty[app] && Settings.getSettings().thirdParty[app].google.scope)
            ? Settings.getSettings().thirdParty[app].google.scope : ['openid'],
    })(ctx, next);
};

const googleToken: (ctx: Context, next: Next) => Promise<void> = async (ctx: Context & RouterContext, next: Next) => {
    const app: string = Utils.getOriginApp(ctx);
    await passport.authenticate(`google-token:${app}`)(ctx, next);
};

const googleCallback: (ctx: Context, next: Next) => Promise<void> = async (ctx: Context & RouterContext, next: Next) => {
    const app: string = Utils.getOriginApp(ctx);
    await passport.authenticate(`google:${app}`, { failureRedirect: '/auth/fail' })(ctx, next);
};

const localCallback: (ctx: Context, next: Next) => Promise<any> = async (ctx: Context & RouterContext, next: Next) => passport.authenticate('local', async (user) => {
    if (!user) {
        if (ctx.request.type === 'application/json') {
            ctx.status = 401;
            ctx.body = {
                errors: [{
                    status: 401,
                    detail: 'Invalid email or password'
                }]
            };
            return;
        }

        ctx.redirect('/auth/fail?error=true');
        return;
    }

    if (ctx.request.type === 'application/json') {
        ctx.status = 200;
        logger.info('Generating token');
        const token: string = await UserService.createToken(user, false);
        ctx.body = UserTempSerializer.serialize(user);
        ctx.body.data.token = token;
    } else {
        await ctx.logIn(user)
            .then(() => ctx.redirect('/auth/success'))
            .catch(() => ctx.redirect('/auth/fail?error=true'));
    }
})(ctx, next);

async function createToken(ctx: Context, createInUser: boolean): Promise<string> {
    logger.info('Generating token');
    return UserService.createToken(Utils.getUser(ctx), createInUser);
}

async function generateJWT(ctx: Context): Promise<void> {
    logger.info('Generating token');
    try {
        const token: string = await createToken(ctx, true);
        ctx.body = { token };
    } catch (e) {
        logger.info(e);
    }
}

async function checkLogged(ctx: Context): Promise<void> {
    if (Utils.getUser(ctx)) {
        const userToken: IUser = Utils.getUser(ctx);
        const user: IUser = await UserService.getUserById(userToken.id);

        ctx.body = {
            id: user._id,
            name: user.name,
            photo: user.photo,
            provider: user.provider,
            providerId: user.providerId,
            email: user.email,
            role: user.role,
            createdAt: user.createdAt,
            extraUserData: user.extraUserData
        };

    } else {
        ctx.res.statusCode = 401;
        ctx.throw(401, 'Not authenticated');
    }
}

async function getUsers(ctx: Context): Promise<void> {
    logger.info('Get Users');
    const user: IUser = Utils.getUser(ctx);
    if (!user.extraUserData || !user.extraUserData.apps) {
        ctx.throw(403, 'Not authorized');
        return;
    }

    const { apps } = user.extraUserData;
    const { query } = ctx;

    const clonedQuery: any = { ...query };
    delete clonedQuery['page[size]'];
    delete clonedQuery['page[number]'];
    delete clonedQuery.ids;
    delete clonedQuery.loggedUser;
    const serializedQuery: string = Utils.serializeObjToQuery(clonedQuery) ? `?${Utils.serializeObjToQuery(clonedQuery)}&` : '?';
    const link: string = `${ctx.request.protocol}://${ctx.request.host}${ctx.request.path}${serializedQuery}`;

    let users: PaginateResult<IUser>;

    if (query.app === 'all') {
        users = await UserService.getUsers(null, omit(query, ['app']));
    } else if (query.app) {
        users = await UserService.getUsers(query.app.split(','), omit(query, ['app']));
    } else {
        users = await UserService.getUsers(apps, query);
    }

    ctx.body = UserSerializer.serialize(users, link);
}

async function getCurrentUser(ctx: Context): Promise<void> {
    const requestUser: IUser = Utils.getUser(ctx);

    logger.info('Get current user: ', requestUser.id);

    const user: IUser = await UserService.getUserById(requestUser.id);

    if (!user) {
        ctx.throw(404, 'User not found');
        return;
    }
    ctx.body = user;
}

async function getUserById(ctx: Context): Promise<void> {
    logger.info('Get User by id: ', ctx.params.id);

    const user: IUser = await UserService.getUserById(ctx.params.id);

    if (!user) {
        ctx.throw(404, 'User not found');
        return;
    }
    ctx.body = user;
}

async function findByIds(ctx: Context): Promise<void> {
    logger.info('Find by ids');
    ctx.assert(ctx.request.body.ids, 400, 'Ids objects required');
    const data: IUser[] = await UserService.getUsersByIds(ctx.request.body.ids);
    ctx.body = {
        data
    };
}

async function getIdsByRole(ctx: Context): Promise<void> {
    logger.info(`[getIdsByRole] Get ids by role: ${ctx.params.role}`);
    const data: Types.ObjectId[] = await UserService.getIdsByRole(ctx.params.role);
    ctx.body = { data };
}

async function updateUser(ctx: Context): Promise<void> {
    logger.info(`Update user with id ${ctx.params.id}`);
    ctx.assert(ctx.params.id, 400, 'Id param required');

    const user: IUser = Utils.getUser(ctx);
    const userUpdate: IUser = await UserService.updateUser(ctx.params.id, ctx.request.body, user);
    if (!userUpdate) {
        ctx.throw(404, 'User not found');
        return;
    }
    ctx.body = UserSerializer.serialize(userUpdate);
}

async function updateMe(ctx: Context): Promise<void> {
    logger.info(`Update user me`);

    const user: IUser = Utils.getUser(ctx);
    const userUpdate: IUser = await UserService.updateUser(user.id, ctx.request.body, user);
    if (!userUpdate) {
        ctx.throw(404, 'User not found');
        return;
    }
    ctx.body = UserSerializer.serialize(userUpdate);
}

async function deleteUser(ctx: Context, next:Next): Promise<void> {
    logger.info(`Delete user with id ${ctx.params.id}`);
    ctx.assert(ctx.params.id, 400, 'Id param required');

    const deletedUser: IUser = await UserService.deleteUser(ctx.params.id);
    if (!deletedUser) {
        ctx.throw(404, 'User not found');
        return;
    }
    ctx.body = UserSerializer.serialize(deletedUser);
}

async function createUser(ctx: Context): Promise<void> {
    logger.info(`Create user with body ${ctx.request.body}`);
    const { body } = ctx.request;
    const user: IUser = Utils.getUser(ctx);
    if (!user) {
        ctx.throw(401, 'Not logged');
        return;
    }

    if (user.role === 'MANAGER' && body.role === 'ADMIN') {
        logger.info('User is manager but the new user is admin');
        ctx.throw(403, 'Forbidden');
        return;
    }

    if (!body.extraUserData || !body.extraUserData.apps) {
        logger.info('Not send apps');
        ctx.throw(400, 'Apps required');
        return;
    }
    if (!user.extraUserData || !user.extraUserData.apps) {
        logger.info('logged user does not contain apps');
        ctx.throw(403, 'Forbidden');
        return;
    }

    const exist: boolean = await UserService.emailExists(body.email);
    if (exist) {
        ctx.throw(400, 'Email exists');
        return;
    }

    // check Apps
    for (let i: number = 0, { length } = body.extraUserData.apps; i < length; i += 1) {
        if (user.extraUserData.apps.indexOf(body.extraUserData.apps[i]) < 0) {
            ctx.throw(403, 'Forbidden');
            return;
        }
    }

    await UserService.createUserWithoutPassword(ctx.request.body, ctx.state.generalConfig);
    ctx.body = {};

}

async function success(ctx: Context): Promise<void> {
    if (ctx.session.callbackUrl) {
        logger.info('Url redirect', ctx.session.callbackUrl);

        // Removing "#_=_", added by FB to the return callbacks to the frontend :scream:
        ctx.session.callbackUrl = ctx.session.callbackUrl.replace('#_=_', '');

        if (ctx.session.generateToken) {
            // generate token and eliminate session
            const token: string = await createToken(ctx, false);

            // Replace token query parameter in redirect URL
            const url: URL = new URL(ctx.session.callbackUrl);
            const { searchParams } = url;
            searchParams.set('token', token);
            url.search = searchParams.toString();

            // Perform redirect
            ctx.redirect(url.toString());
        } else {
            ctx.redirect(ctx.session.callbackUrl);
        }
        ctx.session.callbackUrl = null;
        ctx.session.generateToken = null;
        return;
    }
    ctx.session.callbackUrl = null;
    ctx.session.generateToken = null;
    await ctx.render('login-correct', {
        error: false,
        generalConfig: ctx.state.generalConfig,
    });
}

async function failAuth(ctx: Context): Promise<void> {
    logger.info('Not authenticated');
    const originApp: string = Utils.getOriginApp(ctx);
    const appConfig: IThirdPartyAuth = Settings.getSettings().thirdParty[originApp];

    const thirdParty: Record<string, any> = {
        twitter: false,
        google: false,
        facebook: false,
        basic: false
    };

    if (appConfig.twitter && appConfig.twitter.active) {
        thirdParty.twitter = appConfig.twitter.active;
    }

    if (appConfig.google && appConfig.google.active) {
        thirdParty.google = appConfig.google.active;
    }

    if (appConfig.facebook && appConfig.facebook.active) {
        thirdParty.facebook = appConfig.facebook.active;
    }

    if (Settings.getSettings().basic && Settings.getSettings().basic.active) {
        thirdParty.basic = Settings.getSettings().basic.active;
    }

    const { allowPublicRegistration } = Settings.getSettings();
    if (ctx.query.error) {
        await ctx.render('login', {
            error: true,
            thirdParty,
            generalConfig: ctx.state.generalConfig,
            allowPublicRegistration
        });
    } else {
        ctx.throw(401, 'Not authenticated');
    }
}

async function logout(ctx: Context): Promise<void> {
    ctx.logout();
    ctx.redirect('/auth/login');
}

async function signUp(ctx: Context): Promise<void> {
    logger.info('Creating user');
    let error: string = null;
    if (!ctx.request.body.email || !ctx.request.body.password || !ctx.request.body.repeatPassword) {
        error = 'Email, Password and Repeat password are required';
    }
    if (ctx.request.body.password !== ctx.request.body.repeatPassword) {
        error = 'Password and Repeat password not equal';
    }

    const exist: boolean = await UserService.emailExists(ctx.request.body.email);
    if (exist) {
        error = 'Email exists';
    }
    if (error) {
        if (ctx.request.type === 'application/json') {
            throw new UnprocessableEntityError(error);
        } else {
            await ctx.render('sign-up', {
                error,
                email: ctx.request.body.email,
                generalConfig: ctx.state.generalConfig,
            });

        }
        return;
    }

    try {
        const data: IUserTemp = await UserService.createUser(ctx.request.body, ctx.state.generalConfig);
        if (ctx.request.type === 'application/json') {
            ctx.response.type = 'application/json';
            ctx.body = UserTempSerializer.serialize(data);
        } else {
            await ctx.render('sign-up-correct', {
                generalConfig: ctx.state.generalConfig,
            });
        }
    } catch (err) {
        logger.info('Error', err);
        await ctx.render('sign-up', {
            error: 'Error creating user.',
            email: ctx.request.body.email,
            generalConfig: ctx.state.generalConfig,
        });
    }
}

async function getSignUp(ctx: Context): Promise<void> {
    await ctx.render('sign-up', {
        error: null,
        email: null,
        generalConfig: ctx.state.generalConfig,
    });
}

async function confirmUser(ctx: Context): Promise<void> {
    logger.info('Confirming user');
    const user: IUser = await UserService.confirmUser(ctx.params.token);
    if (!user) {
        ctx.throw(400, 'User expired or token not found');
        return;
    }
    if (ctx.query.callbackUrl) {
        ctx.redirect(ctx.query.callbackUrl);
        return;
    }

    const userFirstApp: string = (user && user.extraUserData && user.extraUserData.apps && user.extraUserData.apps.length > 0) ? user.extraUserData.apps[0] : null;

    if (userFirstApp && Settings.getSettings().local[userFirstApp] && Settings.getSettings().local[userFirstApp].confirmUrlRedirect) {
        ctx.redirect(Settings.getSettings().local[userFirstApp].confirmUrlRedirect);
        return;
    }

    if (Settings.getSettings().local.confirmUrlRedirect) {
        ctx.redirect(Settings.getSettings().local.confirmUrlRedirect);
        return;
    }
    ctx.body = UserSerializer.serialize(user);
}

async function loginView(ctx: Context): Promise<void> {
    // check if the user has session
    const user: IUser = Utils.getUser(ctx);
    if (user) {
        logger.info('User has session');

        if (ctx.request.type === 'application/json') {
            ctx.status = 200;
            return;
        }

        ctx.redirect('/auth/success');
        return;
    }
    if (!user && ctx.request.type === 'application/json') {
        throw new UnauthorizedError('Not logged in');
    }

    const originApp: string = Utils.getOriginApp(ctx);
    const thirdParty: Record<string, any> = {
        twitter: false,
        google: false,
        facebook: false,
        basic: false
    };

    if (
        Settings.getSettings().thirdParty &&
        Settings.getSettings().thirdParty[originApp] &&
        Settings.getSettings().thirdParty[originApp].twitter &&
        Settings.getSettings().thirdParty[originApp].twitter.active
    ) {
        thirdParty.twitter = Settings.getSettings().thirdParty[originApp].twitter.active;
    }

    if (
        Settings.getSettings().thirdParty &&
        Settings.getSettings().thirdParty[originApp] &&
        Settings.getSettings().thirdParty[originApp].google &&
        Settings.getSettings().thirdParty[originApp].google.active
    ) {
        thirdParty.google = Settings.getSettings().thirdParty[originApp].google.active;
    }

    if (
        Settings.getSettings().thirdParty &&
        Settings.getSettings().thirdParty[originApp] &&
        Settings.getSettings().thirdParty[originApp].facebook &&
        Settings.getSettings().thirdParty[originApp].facebook.active
    ) {
        thirdParty.facebook = Settings.getSettings().thirdParty[originApp].facebook.active;
    }

    if (Settings.getSettings().basic && Settings.getSettings().basic.active) {
        thirdParty.basic = Settings.getSettings().basic.active;
    }

    const { allowPublicRegistration } = Settings.getSettings();
    logger.info(thirdParty);
    await ctx.render('login', {
        error: false,
        thirdParty,
        generalConfig: ctx.state.generalConfig,
        allowPublicRegistration
    });
}

async function requestEmailResetView(ctx: Context): Promise<void> {
    await ctx.render('request-mail-reset', {
        error: null,
        info: null,
        email: null,
        app: Utils.getOriginApp(ctx),
        generalConfig: ctx.state.generalConfig,
    });
}

async function redirectLogin(ctx: Context): Promise<void> {
    ctx.redirect('/auth/login');
}

async function resetPasswordView(ctx: Context): Promise<void> {
    const renew: IRenew = await UserService.getRenewModel(ctx.params.token);
    let error: string = null;
    if (!renew) {
        error = 'Token expired';
    }

    await ctx.render('reset-password', {
        error,
        app: Utils.getOriginApp(ctx),
        token: renew ? renew.token : null,
        generalConfig: ctx.state.generalConfig,
    });
}

async function sendResetMail(ctx: Context): Promise<void> {
    logger.info('Send reset mail');

    if (!ctx.request.body.email) {
        if (ctx.request.type === 'application/json') {
            throw new UnprocessableEntityError('Mail required');
        } else {
            await ctx.render('request-mail-reset', {
                error: 'Mail required',
                info: null,
                email: ctx.request.body.email,
                app: Utils.getOriginApp(ctx),
                generalConfig: ctx.state.generalConfig,
            });

            return;
        }
    }

    const originApp: string = Utils.getOriginApp(ctx);
    const renew: IRenew = await UserService.sendResetMail(ctx.request.body.email, ctx.state.generalConfig, originApp);
    if (!renew) {
        if (ctx.request.type === 'application/json') {
            throw new UnprocessableEntityError('User not found');
        } else {
            await ctx.render('request-mail-reset', {
                error: 'User not found',
                info: null,
                email: ctx.request.body.email,
                app: Utils.getOriginApp(ctx),
                generalConfig: ctx.state.generalConfig,
            });

            return;
        }
    }

    if (ctx.request.type === 'application/json') {
        ctx.body = { message: 'Email sent' };
    } else {
        await ctx.render('request-mail-reset', {
            info: 'Email sent!!',
            error: null,
            email: ctx.request.body.email,
            app: Utils.getOriginApp(ctx),
            generalConfig: ctx.state.generalConfig,
        });
    }
}

async function updateApplications(ctx: Context): Promise<void> {
    try {
        if (ctx.session && ctx.session.applications) {
            let user: IUser = Utils.getUser(ctx);
            if (user.role === 'USER') {
                user = await UserService.updateApplicationsForUser(user.id, ctx.session.applications);
            } else {
                user = await UserService.getUserById(user.id);
            }
            delete ctx.session.applications;
            if (user) {
                await ctx.login({
                    id: user._id,
                    provider: user.provider,
                    providerId: user.providerId,
                    role: user.role,
                    createdAt: user.createdAt,
                    extraUserData: user.extraUserData,
                    email: user.email,
                    photo: user.photo,
                    name: user.name
                });
            }
        }
        ctx.redirect('/auth/success');
    } catch (err) {
        logger.info(err);
        ctx.redirect('/auth/fail');
    }

}

async function resetPassword(ctx: Context): Promise<void> {
    logger.info('Resetting password');

    let error: string = null;
    if (!ctx.request.body.password || !ctx.request.body.repeatPassword) {
        error = 'Password and Repeat password are required';
    }
    if (ctx.request.body.password !== ctx.request.body.repeatPassword) {
        error = 'Password and Repeat password not equal';
    }
    const exist: IRenew = await UserService.getRenewModel(ctx.params.token);
    if (!exist) {
        error = 'Token expired';
    }
    if (error) {
        if (ctx.request.type === 'application/json') {
            throw new UnprocessableEntityError(error);
        } else {
            await ctx.render('reset-password', {
                error,
                app: Utils.getOriginApp(ctx),
                token: ctx.params.token,
                generalConfig: ctx.state.generalConfig,
            });
        }

        return;
    }
    const user: IUser = await UserService.updatePassword(ctx.params.token, ctx.request.body.password);
    if (user) {
        if (ctx.request.type === 'application/json') {
            ctx.response.type = 'application/json';
            ctx.body = UserSerializer.serialize(user);
        } else {
            const app: string = Utils.getOriginApp(ctx);
            const applicationConfig: IApplication = Settings.getSettings().applications && Settings.getSettings().applications[app];

            if (applicationConfig && applicationConfig.confirmUrlRedirect) {
                ctx.redirect(applicationConfig.confirmUrlRedirect);
                return;
            }
            if (Settings.getSettings().local.confirmUrlRedirect) {
                ctx.redirect(Settings.getSettings().local.confirmUrlRedirect);
                return;
            }
            ctx.body = user;
        }
    } else {
        await ctx.render('reset-password', {
            app: Utils.getOriginApp(ctx),
            error: 'Error updating user',
            token: ctx.params.token,
            generalConfig: ctx.state.generalConfig,
        });
    }
}

export default {
    twitter,
    twitterCallback,
    google,
    googleToken,
    googleCallback,
    facebook,
    facebookToken,
    facebookCallback,
    localCallback,
    failAuth,
    checkLogged,
    success,
    logout,
    generateJWT,
    getUsers,
    getCurrentUser,
    getUserById,
    findByIds,
    getIdsByRole,
    createUser,
    updateUser,
    deleteUser,
    updateMe,
    signUp,
    confirmUser,
    getSignUp,
    loginView,
    redirectLogin,
    resetPasswordView,
    requestEmailResetView,
    resetPassword,
    sendResetMail,
    updateApplications
};
