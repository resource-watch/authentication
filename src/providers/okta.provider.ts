import { Context } from 'koa';
import { RouterContext } from 'koa-router';
import { URL } from 'url';
import logger from 'logger';
import Utils from 'utils';
import { omit } from 'lodash';

import OktaUserService, { PaginatedIUserResult } from 'services/okta.user.service';
import Settings, { IApplication, IThirdPartyAuth } from 'services/settings.service';
import { IUserTemp } from 'models/user-temp.model';
import { IRenew } from 'models/renew.model';
import UserTempSerializer from 'serializers/user-temp.serializer';
import UserSerializer from 'serializers/user.serializer';
import UnprocessableEntityError from 'errors/unprocessableEntity.error';
import UnauthorizedError from 'errors/unauthorized.error';
import UserModel, { IUser, UserDocument } from 'models/user.model';
import BaseProvider from 'providers/base.provider';
import OktaService from 'services/okta.service';

export class OktaProvider extends BaseProvider {

    static async registerUser(accessToken: string, refreshToken: string, profile: any, done: (error: any, user?: any) => void): Promise<void> {
        logger.info('[passportService] Registering user', profile);

        let user: UserDocument = await UserModel.findOne({
            provider: profile.provider ? profile.provider.split('-')[0] : profile.provider,
            providerId: profile.id,
        }).exec();
        logger.info(user);
        if (!user) {
            logger.info('[passportService] User does not exist');
            let name: string = null;
            let email: string = null;
            let photo: string = null;
            if (profile) {
                name = profile.displayName;
                photo = profile.photos?.length > 0 ? profile.photos[0].value : null;
                if (profile.emails?.length > 0) {
                    email = profile.emails[0].value;
                } else if (profile.email) {
                    ({ email } = profile);
                }
            }
            user = await new UserModel({
                name,
                email,
                photo,
                provider: profile.provider ? profile.provider.split('-')[0] : profile.provider,
                providerId: profile.id
            }).save();
        } else {
            let email: string = null;
            if (profile) {
                if (profile.emails?.length > 0) {
                    email = profile.emails[0].value;
                } else if (profile.email) {
                    ({ email } = profile);
                }
            }
            if (email) {
                logger.info('[passportService] Updating email');
                user.email = email;
                await user.save();
            }
        }
        logger.info('[passportService] Returning user');
        done(null, {
            id: user._id,
            provider: user.provider,
            providerId: user.providerId,
            role: user.role,
            createdAt: user.createdAt,
            extraUserData: user.extraUserData,
            name: user.name,
            photo: user.photo,
            email: user.email
        });
    }

    static async localCallback(ctx: Context & RouterContext): Promise<void> {
        try {
            const user: IUser = await OktaService.login(ctx.request.body.email, ctx.request.body.password);

            if (ctx.request.type === 'application/json') {
                ctx.status = 200;
                ctx.body = UserSerializer.serialize(user);
                logger.info('Generating token');
                ctx.body.data.token = OktaUserService.createToken(user);
            } else {
                await ctx.logIn(user)
                    .then(() => ctx.redirect('/auth/success'))
                    .catch(() => ctx.redirect('/auth/fail?error=true'));
            }

        } catch (err) {
            if (err.response?.data?.errorSummary === 'Authentication failed') {
                // Authentication failed
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

            // Unknown error, log and report 500 Internal Server Error
            logger.error('Failed login request: ', err);
            ctx.throw(500, 'Internal server error');
        }
    }

    static async checkLogged(ctx: Context): Promise<void> {
        if (Utils.getUser(ctx)) {
            const userToken: UserDocument = Utils.getUser(ctx);
            const user: IUser = await OktaUserService.getUserById(userToken.id);

            ctx.body = {
                id: user.id,
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

    static async getUsers(ctx: Context): Promise<void> {
        logger.info('Get Users');
        const user: UserDocument = Utils.getUser(ctx);
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

        let users: PaginatedIUserResult;

        if (query.app === 'all') {
            users = await OktaUserService.getUsers(null, omit(query, ['app']));
        } else if (query.app) {
            users = await OktaUserService.getUsers(query.app.split(','), omit(query, ['app']));
        } else {
            users = await OktaUserService.getUsers(apps, query);
        }

        ctx.body = UserSerializer.serialize(users, link);
    }

    static async getCurrentUser(ctx: Context): Promise<void> {
        const requestUser: UserDocument = Utils.getUser(ctx);

        logger.info('Get current user: ', requestUser.id);

        if (requestUser.id && requestUser.id.toLowerCase() === 'microservice') {
            ctx.body = requestUser;
            return;
        }

        const user: IUser = await OktaUserService.getUserById(requestUser.id);

        if (!user) {
            ctx.throw(404, 'User not found');
            return;
        }
        ctx.body = user;
    }

    static async getUserById(ctx: Context): Promise<void> {
        logger.info('Get User by id: ', ctx.params.id);

        const user: IUser = await OktaUserService.getUserById(ctx.params.id);

        if (!user) {
            ctx.throw(404, 'User not found');
            return;
        }

        ctx.body = user;
    }

    static async findByIds(ctx: Context): Promise<void> {
        logger.info('Find by ids');
        ctx.assert(ctx.request.body.ids, 400, 'Ids objects required');
        const data: IUser[] = await OktaUserService.getUsersByIds(ctx.request.body.ids);
        ctx.body = { data };
    }

    static async getIdsByRole(ctx: Context): Promise<void> {
        logger.info(`[getIdsByRole] Get ids by role: ${ctx.params.role}`);
        const data: string[] = await OktaUserService.getIdsByRole(ctx.params.role);
        ctx.body = { data };
    }

    private static async performUpdateRequest(ctx: Context, id: string): Promise<void> {
        const user: IUser = Utils.getUser(ctx);
        const { body } = ctx.request;

        const updateData: OktaUpdateUserPayload = {
            ...body.name && { displayName: body.name },
            ...body.photo && { photo: body.photo },
            ...user.role === 'ADMIN' && body.role && { role: body.role },
            ...user.role === 'ADMIN' && body.extraUserData && body.extraUserData.apps && { apps: body.extraUserData.apps },
        };

        try {
            const updatedUser: IUser = await OktaService.updateUser(id, updateData);
            ctx.body = UserSerializer.serialize(updatedUser);
        } catch (err) {
            logger.error('Error updating my user, ', err);
            if (err instanceof UserNotFoundError) {
                ctx.throw(404, 'User not found');
            }

            ctx.throw(500, 'Internal server error');
        }
    }

    static async updateUser(ctx: Context): Promise<void> {
        logger.info(`Update user with id ${ctx.params.id}`);
        ctx.assert(ctx.params.id, 400, 'Id param required');
        return OktaProvider.performUpdateRequest(ctx, ctx.params.id);
    }

    static async updateMe(ctx: Context): Promise<void> {
        logger.info(`Update user me`);
        const user: IUser = Utils.getUser(ctx);
        return OktaProvider.performUpdateRequest(ctx, user.id);
    }

    static async deleteUser(ctx: Context): Promise<void> {
        logger.info(`Delete user with id ${ctx.params.id}`);
        ctx.assert(ctx.params.id, 400, 'Id param required');

        const deletedUser: UserDocument = await OktaUserService.deleteUser(ctx.params.id);
        if (!deletedUser) {
            ctx.throw(404, 'User not found');
            return;
        }
        ctx.body = UserSerializer.serialize(deletedUser);
    }

    static async createUser(ctx: Context): Promise<void> {
        logger.info(`Create user with body ${ctx.request.body}`);
        const { body } = ctx.request;
        const user: UserDocument = Utils.getUser(ctx);
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

        // Check apps
        for (let i: number = 0, { length } = body.extraUserData.apps; i < length; i += 1) {
            if (user.extraUserData.apps.indexOf(body.extraUserData.apps[i]) < 0) {
                ctx.throw(403, 'Forbidden');
                return;
            }
        }

        try {
            ctx.body = await OktaService.createUserWithoutPassword(body.email, body.name, body.role, body.apps, body.photo);
        } catch (err) {
            logger.error('Error creating user, ', err);
            if (err.response?.data?.errorCauses[0]?.errorSummary === 'login: An object with this field already exists in the current organization') {
                ctx.throw(400, 'Email exists');
            }

            ctx.throw(500, 'Internal server error');
        }
    }

    static async success(ctx: Context): Promise<void> {
        if (ctx.session.callbackUrl) {
            logger.info('Url redirect', ctx.session.callbackUrl);

            // Removing "#_=_", added by FB to the return callbacks to the frontend :scream:
            ctx.session.callbackUrl = ctx.session.callbackUrl.replace('#_=_', '');

            if (ctx.session.generateToken) {
                // generate token and eliminate session
                const token: string = OktaUserService.createToken(Utils.getUser(ctx));

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

    static async failAuth(ctx: Context): Promise<void> {
        logger.info('Not authenticated');
        const originApp: string = Utils.getOriginApp(ctx);
        const appConfig: IThirdPartyAuth = Settings.getSettings().thirdParty[originApp];

        const thirdParty: Record<string, any> = {
            twitter: false,
            google: false,
            facebook: false,
            basic: false
        };

        if (appConfig.twitter?.active) {
            thirdParty.twitter = appConfig.twitter.active;
        }

        if (appConfig.google?.active) {
            thirdParty.google = appConfig.google.active;
        }

        if (appConfig.facebook?.active) {
            thirdParty.facebook = appConfig.facebook.active;
        }

        if (appConfig.apple?.active) {
            thirdParty.apple = appConfig.apple.active;
        }

        if (ctx.query.error) {
            await ctx.render('login', {
                error: true,
                thirdParty,
                generalConfig: ctx.state.generalConfig
            });
        } else {
            ctx.throw(401, 'Not authenticated');
        }
    }

    static async logout(ctx: Context): Promise<void> {
        ctx.logout();
        ctx.redirect('/auth/login');
    }

    static async signUp(ctx: Context): Promise<void> {
        try {
            logger.info('Creating user');

            // Call Okta API to create user without password
            const newUser: IUserTemp = await OktaService.signUpWithoutPassword(
                ctx.request.body.email,
                ctx.request.body.name,
            );

            if (ctx.request.type === 'application/json') {
                ctx.response.type = 'application/json';
                ctx.body = UserTempSerializer.serialize(newUser);
            } else {
                await ctx.render('sign-up-correct', {
                    generalConfig: ctx.state.generalConfig,
                });
            }
        } catch (err) {
            let error: string = 'Error creating user.';

            if (err.response?.data?.errorCauses[0]?.errorSummary === 'login: The field cannot be left blank') {
                error = 'Email is required';
            }

            if (err.response?.data?.errorCauses[0]?.errorSummary === 'login: An object with this field already exists in the current organization') {
                error = 'Email exists';
            }

            logger.error('Error creating user: ', err);

            if (ctx.request.type === 'application/json') {
                throw new UnprocessableEntityError(error);
            } else {
                await ctx.render('sign-up', {
                    error,
                    email: ctx.request.body.email,
                    generalConfig: ctx.state.generalConfig,
                });
            }
        }
    }

    static async getSignUp(ctx: Context): Promise<void> {
        await ctx.render('sign-up', {
            error: null,
            email: null,
            generalConfig: ctx.state.generalConfig,
        });
    }

    static async confirmUser(ctx: Context): Promise<void> {
        logger.info('Confirming user');
        const user: UserDocument = await OktaUserService.confirmUser(ctx.params.token);
        if (!user) {
            ctx.throw(400, 'User expired or token not found');
            return;
        }
        if (ctx.query.callbackUrl) {
            ctx.redirect(ctx.query.callbackUrl);
            return;
        }

        const userFirstApp: string = (user?.extraUserData?.apps?.length > 0) ? user.extraUserData.apps[0] : null;

        if (userFirstApp && Settings.getSettings().local[userFirstApp]?.confirmUrlRedirect) {
            ctx.redirect(Settings.getSettings().local[userFirstApp].confirmUrlRedirect);
            return;
        }

        if (Settings.getSettings().local.confirmUrlRedirect) {
            ctx.redirect(Settings.getSettings().local.confirmUrlRedirect);
            return;
        }
        ctx.body = UserSerializer.serialize(user);
    }

    static async loginView(ctx: Context): Promise<void> {
        // check if the user has session
        const user: UserDocument = Utils.getUser(ctx);
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
            apple: false
        };

        if (
            Settings.getSettings().thirdParty &&
            Settings.getSettings().thirdParty[originApp]?.twitter?.active
        ) {
            thirdParty.twitter = Settings.getSettings().thirdParty[originApp].twitter.active;
        }

        if (
            Settings.getSettings().thirdParty &&
            Settings.getSettings().thirdParty[originApp]?.google?.active
        ) {
            thirdParty.google = Settings.getSettings().thirdParty[originApp].google.active;
        }

        if (
            Settings.getSettings().thirdParty &&
            Settings.getSettings().thirdParty[originApp]?.facebook?.active
        ) {
            thirdParty.facebook = Settings.getSettings().thirdParty[originApp].facebook.active;
        }

        if (
            Settings.getSettings().thirdParty &&
            Settings.getSettings().thirdParty[originApp]?.apple?.active
        ) {
            thirdParty.apple = Settings.getSettings().thirdParty[originApp].apple.active;
        }

        await ctx.render('login', {
            error: false,
            thirdParty,
            generalConfig: ctx.state.generalConfig
        });
    }

    static async requestEmailResetView(ctx: Context): Promise<void> {
        await ctx.render('request-mail-reset', {
            error: null,
            info: null,
            email: null,
            app: Utils.getOriginApp(ctx),
            generalConfig: ctx.state.generalConfig,
        });
    }

    static async redirectLogin(ctx: Context): Promise<void> {
        ctx.redirect('/auth/login');
    }

    static async resetPasswordView(ctx: Context): Promise<void> {
        const renew: IRenew = await OktaUserService.getRenewModel(ctx.params.token);
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

    static async sendResetMail(ctx: Context): Promise<void> {
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

        try {
            await OktaService.sendPasswordRecoveryEmail(ctx.request.body.email);

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
        } catch (err) {
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
    }

    static async updateApplications(ctx: Context): Promise<void> {
        try {
            if (ctx.session && ctx.session.applications) {
                let user: IUser = Utils.getUser(ctx);
                if (user.role === 'USER') {
                    user = await OktaUserService.updateApplicationsForUser(user.id, ctx.session.applications);
                } else {
                    user = await OktaUserService.getUserById(user.id);
                }
                delete ctx.session.applications;
                if (user) {
                    await ctx.login({
                        id: user.id,
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

    static async resetPassword(ctx: Context): Promise<void> {
        logger.info('Resetting password');

        let error: string = null;
        if (!ctx.request.body.password || !ctx.request.body.repeatPassword) {
            error = 'Password and Repeat password are required';
        }
        if (ctx.request.body.password !== ctx.request.body.repeatPassword) {
            error = 'Password and Repeat password not equal';
        }
        const exist: IRenew = await OktaUserService.getRenewModel(ctx.params.token);
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

        const user: IUser = await OktaUserService.updatePassword(ctx.params.token, ctx.request.body.password);
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
}

export default OktaProvider;
