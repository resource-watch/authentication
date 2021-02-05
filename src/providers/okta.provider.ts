import {Context, Next} from 'koa';
import {RouterContext} from 'koa-router';
import {URL} from 'url';
import logger from 'logger';
import Utils from 'utils';
import {omit} from 'lodash';
import {v4 as uuidv4} from 'uuid';

import Settings, {IThirdPartyAuth} from 'services/settings.service';
import UserTempSerializer from 'serializers/user-temp.serializer';
import UserSerializer from 'serializers/user.serializer';
import UnprocessableEntityError from 'errors/unprocessableEntity.error';
import UnauthorizedError from 'errors/unauthorized.error';
import {IUser} from 'models/user.model';
import BaseProvider from 'providers/base.provider';
import OktaService from 'services/okta.service';
import { OktaUpdateUserPayload, OktaUpdateUserProtectedFieldsPayload, OktaUser } from 'services/okta.interfaces';
import UserNotFoundError from 'errors/userNotFound.error';
import config from 'config';

export class OktaProvider extends BaseProvider {

    /**
     * OAuth token callback. This is the endpoint where Okta returns to after social login.
     *
     * If social auth was successful, query will contain a "code", used to exchange for an access token with Okta's
     * OAuth API. If unsuccessful, query will contain an "error" message.
     *
     * @param ctx {Context} Koa request context.
     * @param next {Next} Next middleware to be called.
     */
    static async authCodeCallback(ctx: Context, next: Next): Promise<void> {
        try {
            const { code, error, state } = ctx.query;

            if (error) {
                logger.error('[OktaProvider] - Error returned from OAuth authorize call to Okta, ', error);
                return ctx.redirect('/auth/fail?error=true');
            }

            if (!code) {
                logger.error('[OktaProvider] - No code provided by Okta\'s OAuth authorize call, ', error);
                return ctx.redirect('/auth/fail?error=true');
            }

            if (state !== ctx.session.oAuthState) {
                logger.error('[OktaProvider] - OAuth state does not match the state stored in session.');
                return ctx.redirect('/auth/fail?error=true');
            }

            let user: OktaUser = await OktaService.getUserForAuthorizationCode(code);
            const updateData: OktaUpdateUserProtectedFieldsPayload = {};

            if (!user.profile.legacyId) {
                updateData.legacyId = uuidv4();
            }

            if (!user.profile.role) {
                updateData.role = 'USER';
            }

            if (!user.profile.apps) {
                updateData.apps = [];
            }

            // If updateData is not empty, trigger user update
            if (Object.keys(updateData).length > 0) {
                user = await OktaService.updateUserProtectedFields(user.id, updateData);
            }

            const newUser: IUser = await OktaService.convertOktaUserToIUser(user);
            await ctx.login(newUser);
            return next();
        } catch (err) {
            logger.error('[OktaProvider] - Error requesting OAuth token to Okta, ', err);
            return ctx.redirect('/auth/fail?error=true');
        }
    }

    static async localCallback(ctx: Context & RouterContext): Promise<void> {
        try {
            const user: IUser = await OktaService.login(ctx.request.body.email, ctx.request.body.password);

            if (ctx.request.type === 'application/json') {
                ctx.status = 200;
                ctx.body = UserSerializer.serialize(user);
                logger.info('[OktaProvider] - Generating token');
                ctx.body.data.token = OktaService.createToken(user);
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
            logger.error('[OktaProvider] - Failed login request: ', err);
            ctx.throw(500, 'Internal server error');
        }
    }

    static async checkLogged(ctx: Context): Promise<void> {
        if (Utils.getUser(ctx)) {
            const userToken: IUser = Utils.getUser(ctx);
            const user: IUser = await OktaService.getUserById(userToken.id);

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
        logger.info('[OktaProvider] - Get Users');
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

        let appsToUse: string[]|null = apps;
        if (query.app === 'all') {
            appsToUse = null;
        } else if (query.app) {
            appsToUse = query.app.split(',');
        }

        const users: IUser[] = await OktaService.getUsers(appsToUse, omit(query, ['app']));
        ctx.body = UserSerializer.serialize(users, link);
    }

    static async getCurrentUser(ctx: Context): Promise<void> {
        const requestUser: IUser = Utils.getUser(ctx);
        logger.info('[OktaProvider] - Get current user: ', requestUser.id);

        if (requestUser.id && requestUser.id.toLowerCase() === 'microservice') {
            ctx.body = requestUser;
            return;
        }

        const user: IUser = await OktaService.getUserById(requestUser.id);
        if (!user) {
            ctx.throw(404, 'User not found');
            return;
        }
        ctx.body = user;
    }

    static async getUserById(ctx: Context): Promise<void> {
        logger.info('[OktaProvider] - Get User by id: ', ctx.params.id);

        const user: IUser = await OktaService.getUserById(ctx.params.id);

        if (!user) {
            ctx.throw(404, 'User not found');
            return;
        }

        ctx.body = user;
    }

    static async findByIds(ctx: Context): Promise<void> {
        logger.info('[OktaProvider] - Find by ids');
        ctx.assert(ctx.request.body.ids, 400, 'Ids objects required');
        const data: IUser[] = await OktaService.getUsersByIds(ctx.request.body.ids);
        ctx.body = { data };
    }

    static async getIdsByRole(ctx: Context): Promise<void> {
        logger.info(`[OktaProvider] - Get ids by role: ${ctx.params.role}`);
        const data: string[] = await OktaService.getIdsByRole(ctx.params.role);
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
            if (err instanceof UserNotFoundError) {
                ctx.throw(404, 'User not found');
                return;
            }

            logger.error('[OktaProvider] - Error updating my user, ', err);
            ctx.throw(500, 'Internal server error');
        }
    }

    static async updateUser(ctx: Context): Promise<void> {
        logger.info(`[OktaProvider] - Update user with id ${ctx.params.id}`);
        ctx.assert(ctx.params.id, 400, 'Id param required');
        return OktaProvider.performUpdateRequest(ctx, ctx.params.id);
    }

    static async updateMe(ctx: Context): Promise<void> {
        logger.info(`[OktaProvider] - Update user me`);
        const user: IUser = Utils.getUser(ctx);
        return OktaProvider.performUpdateRequest(ctx, user.id);
    }

    static async deleteUser(ctx: Context): Promise<void> {
        try {
            logger.info(`[OktaProvider] - Delete user with id ${ctx.params.id}`);
            const deletedUser: IUser = await OktaService.deleteUser(ctx.params.id);
            ctx.body = UserSerializer.serialize(deletedUser);
        } catch (err) {
            if (err instanceof UserNotFoundError) {
                ctx.throw(404, 'User not found');
                return;
            }

            logger.error('[OktaProvider] - Error updating my user, ', err);
            ctx.throw(500, 'Internal server error');
        }
    }

    static async createUser(ctx: Context): Promise<void> {
        logger.info(`[OktaProvider] - Create user with body ${ctx.request.body}`);
        const { body } = ctx.request;
        const user: IUser = Utils.getUser(ctx);
        if (!user) {
            ctx.throw(401, 'Not logged');
            return;
        }

        if (user.role === 'MANAGER' && body.role === 'ADMIN') {
            logger.info('[OktaProvider] - User is manager but the new user is admin');
            ctx.throw(403, 'Forbidden');
            return;
        }

        if (!body.extraUserData || !body.extraUserData.apps) {
            logger.info('[OktaProvider] - Not send apps');
            ctx.throw(400, 'Apps required');
            return;
        }
        if (!user.extraUserData || !user.extraUserData.apps) {
            logger.info('[OktaProvider] - logged user does not contain apps');
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
            ctx.body = await OktaService.createUserWithoutPassword({
                email: body.email,
                name: body.name,
                role: body.role,
                apps: body.extraUserData.apps,
                photo: body.photo,
            });
        } catch (err) {
            logger.error('[OktaProvider] - Error creating user, ', err);
            if (err.response?.data?.errorCauses[0]?.errorSummary === 'login: An object with this field already exists in the current organization') {
                ctx.throw(400, 'Email exists');
            }

            ctx.throw(500, 'Internal server error');
        }
    }

    static async success(ctx: Context): Promise<void> {
        if (ctx.session.callbackUrl) {
            logger.info('[OktaProvider] - Url redirect', ctx.session.callbackUrl);

            // Removing "#_=_", added by FB to the return callbacks to the frontend :scream:
            ctx.session.callbackUrl = ctx.session.callbackUrl.replace('#_=_', '');

            if (ctx.session.generateToken) {
                // generate token and eliminate session
                const token: string = OktaService.createToken(Utils.getUser(ctx));

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
        logger.info('[OktaProvider] - Not authenticated');
        const originApp: string = Utils.getOriginApp(ctx);
        const appConfig: IThirdPartyAuth = Settings.getSettings().thirdParty[originApp];

        const thirdParty: Record<string, any> = {
            twitter: false,
            google: false,
            facebook: false
        };

        if (appConfig.twitter?.active) {
            thirdParty.twitter = appConfig.twitter.active;
        }

        if (config.get(`okta.${originApp}.google.idp`)) {
            thirdParty.google = true;
        }

        if (config.get(`okta.${originApp}.facebook.idp`)) {
            thirdParty.facebook = true;
        }

        if (config.get(`okta.${originApp}.apple.idp`)) {
            thirdParty.apple = true;
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
            logger.info('[OktaProvider] - Creating user');
            const newUser: IUser = await OktaService.createUserWithoutPassword({
                email: ctx.request.body.email,
                name: ctx.request.body.name,
                role: 'USER',
            });

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

            logger.error('[OktaProvider] - Error creating user: ', err);

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
        ctx.throw(400, 'Method not supported');
    }

    static async loginView(ctx: Context): Promise<void> {
        // check if the user has session
        const user: IUser = Utils.getUser(ctx);
        if (user) {
            logger.info('[OktaProvider] - User has session');

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
        const appConfig: IThirdPartyAuth = Settings.getSettings().thirdParty[originApp];
        const thirdParty: Record<string, any> = {
            twitter: false,
            google: false,
            facebook: false,
            apple: false
        };

        if (config.get(`okta.${originApp}.google.idp`)) {
            thirdParty.google = true;
        }

        if (config.get(`okta.${originApp}.facebook.idp`)) {
            thirdParty.facebook = true;
        }

        if (config.get(`okta.${originApp}.apple.idp`)) {
            thirdParty.apple = true;
        }

        if (appConfig.twitter?.active) {
            thirdParty.twitter = appConfig.twitter.active;
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
        logger.error('[OktaProvider] - Trying to go to request password view, which is not supported anymore.');
        ctx.throw(400, 'Method not supported');
    }

    static async sendResetMail(ctx: Context): Promise<void> {
        logger.info('[OktaProvider] - Send reset mail');

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
                    user = await OktaService.updateApplicationsForUser(user.id, ctx.session.applications);
                } else {
                    user = await OktaService.getUserById(user.id);
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

    static async createToken(ctx: Context): Promise<string> {
        logger.info('[OktaProvider] - Generating token');
        return OktaService.createToken(Utils.getUser(ctx));
    }

    static async generateJWT(ctx: Context): Promise<void> {
        logger.info('[OktaProvider] - Generating token');

        // TODO: validate that the required fields actually exist, and if not, set them on Okta

        try {
            const token: string = await OktaProvider.createToken(ctx);
            ctx.body = { token };
        } catch (e) {
            logger.info(e);
        }
    }

    static async resetPassword(ctx: Context): Promise<void> {
        logger.error('[OktaProvider] - Trying to call reset password endpoint, which is not supported anymore.');
        ctx.throw(400, 'Method not supported');
    }
}

export default OktaProvider;
