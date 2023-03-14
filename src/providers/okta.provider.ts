import { Context, Next } from 'koa';
import { RouterContext } from 'koa-router';
import { URL } from 'url';
import logger from 'logger';
import Utils from 'utils';
import { omit } from 'lodash';

import Settings, { IThirdPartyAuth } from 'services/settings.service';
import UserSerializer from 'serializers/user.serializer';
import UnprocessableEntityError from 'errors/unprocessableEntity.error';
import UnauthorizedError from 'errors/unauthorized.error';
import OktaService from 'services/okta.service';
import {
    OktaOAuthProvider,
    OktaUpdateUserPayload,
    OktaUser,
    PaginationStrategyOption,
    IUser
} from 'services/okta.interfaces';
import UserNotFoundError from 'errors/userNotFound.error';
import config from 'config';
import { sleep } from 'sleep';
import PasswordRecoveryNotAllowedError from 'errors/passwordRecoveryNotAllowed.error';
import { IDeletion } from 'models/deletion';
import DeletionService from 'services/deletion.service';
import UserResourcesService from 'services/user-resources.service';

export class OktaProvider {

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
        logger.info('[OktaProvider - authCodeCallback] - authCodeCallback started');
        try {
            const { code, error } = ctx.query;

            if (error) {
                const errorDescription: string = ctx.query.error_description as string || '';
                logger.error('[OktaProvider - authCodeCallback] - Error returned from OAuth authorize call to Okta, ', error, errorDescription);
                return ctx.redirect(`/auth/fail?error=true&error_description=${errorDescription}`);
            }

            if (!code) {
                logger.error('[OktaProvider - authCodeCallback] - No code provided by Okta\'s OAuth authorize call, ', error);
                return ctx.redirect('/auth/fail?error=true');
            }

            let user: OktaUser = await OktaService.getUserForAuthorizationCode(code as string);
            user = await OktaService.updateUserWithFakeEmailDataIfExisting(user);
            user = await OktaService.setAndUpdateRequiredFields(user);
            logger.info('[OktaProvider - authCodeCallback] - authCodeCallback started');

            await ctx.login(OktaService.convertOktaUserToIUser(user));
            logger.info('[OktaProvider] - authCodeCallback login successful');
            return next();
        } catch (err) {
            logger.error('[OktaProvider - authCodeCallback] - Error requesting OAuth token to Okta, ', err);
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
                // eslint-disable-next-line @typescript-eslint/ban-ts-comment
                // @ts-ignore
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

        const { page, limit } = Utils.getPaginationParameters(ctx);

        const app: string = query.app as string;

        const clonedQuery: any = { ...query };
        delete clonedQuery.page;
        delete clonedQuery.ids;
        delete clonedQuery.loggedUser;
        const serializedQuery: string = Utils.serializeObjToQuery(clonedQuery) ? `?${Utils.serializeObjToQuery(clonedQuery)}&` : '?';
        const link: string = `${ctx.request.protocol}://${Utils.getHostForPaginationLink(ctx)}${ctx.request.path}${serializedQuery}`;

        let appsToUse: string[] | null = apps;
        if (app === 'all') {
            appsToUse = null;
        } else if (app) {
            appsToUse = app.split(',');
        }

        switch (query.strategy) {
            case PaginationStrategyOption.CURSOR: {
                const {
                    data,
                    cursor
                } = await OktaService.getUserListForCursorPagination(appsToUse, omit(query, ['app']) as Record<string, string>);
                ctx.body = UserSerializer.serialize(data);

                // eslint-disable-next-line @typescript-eslint/ban-ts-comment
                // @ts-ignore
                ctx.body.links = {
                    self: `${link}page[before]=${cursor}&page[size]=${limit}`,
                    first: `${link}page[size]=${limit}`,
                    next: `${link}page[after]=${cursor}&page[size]=${limit}`,
                };
                return;
            }

            default: {
                const { data } = await OktaService.getUserListForOffsetPagination(appsToUse, omit(query, ['app']) as Record<string, string>);
                ctx.body = UserSerializer.serialize(data);
                const nPage: number = page;

                // eslint-disable-next-line @typescript-eslint/ban-ts-comment
                // @ts-ignore
                ctx.body.links = {
                    self: `${link}page[number]=${page}&page[size]=${limit}`,
                    first: `${link}page[number]=1&page[size]=${limit}`,
                    prev: `${link}page[number]=${Math.max(nPage - 1, 1)}&page[size]=${limit}`,
                    next: `${link}page[number]=${nPage + 1}&page[size]=${limit}`,
                };

                return;
            }
        }
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

    static async getUserResources(ctx: Context): Promise<void> {
        logger.info('[OktaProvider] - Get resources for user by id: ', ctx.params.id);

        const user: IUser = await OktaService.getUserById(ctx.params.id);

        if (!user) {
            ctx.throw(404, 'User not found');
            return;
        }

        const result: Record<string, any> = {
            datasets: await UserResourcesService.getDatasets(user.id),
            layers: await UserResourcesService.getLayers(user.id),
            widgets: await UserResourcesService.getWidgets(user.id),
            userAccount: {
                data: user
            },
            userData: await UserResourcesService.getUserData(user.id),
            collections: await UserResourcesService.getCollectionsData(user.id),
            favourites: await UserResourcesService.getFavouritesData(user.id),
            areas: await UserResourcesService.getAreas(user.id),
            stories: await UserResourcesService.getStories(user.id),
            subscriptions: await UserResourcesService.getSubscriptions(user.id),
            dashboards: await UserResourcesService.getDashboards(user.id),
            profiles: await UserResourcesService.getProfile(user.id),
            topics: await UserResourcesService.getTopics(user.id),
        }

        ctx.body = result;
    }

    static async findByIds(ctx: Context): Promise<void> {
        logger.info('[OktaProvider] - Find by ids');
        ctx.assert(ctx.request.body.ids, 400, 'Ids objects required');
        const data: IUser[] = await OktaService.getUsersByIds(ctx.request.body.ids);
        ctx.body = { data };
    }

    /**
     * @deprecated This is a performance nightmare as it needs to load all of Okta's DB
     */
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
        logger.info(`[OktaProvider] - Delete user with id ${ctx.params.id}`);
        try {
            await OktaService.getOktaUserById(ctx.params.id);
        } catch (err) {
            if (err instanceof UserNotFoundError) {
                ctx.throw(404, 'User not found');
                return;
            }

            logger.error('[OktaProvider] - Error loading user for deletion, ', err);
            ctx.throw(500, 'Internal server error');
        }

        let deletedUser: IUser = null;
        try {
            deletedUser = await OktaService.deleteUser(ctx.params.id);
            ctx.body = UserSerializer.serialize(deletedUser);
        } catch (err) {
            logger.error('[OktaProvider] - Error deleting user, ', err);
            return ctx.throw(500, 'Internal server error');
        } finally {
            const newDeletionData: Partial<IDeletion> = {
                userId: ctx.params.id,
                requestorUserId: Utils.getUser(ctx).id,
                userAccountDeleted: deletedUser !== null,
            };
            await DeletionService.createDeletion(newDeletionData);
        }
    }

    static async createUser(ctx: Context): Promise<void> {
        logger.info(`[OktaProvider] - Create user with body ${ctx.request.body}`);
        const { body } = ctx.request;
        const user: IUser = Utils.getUser(ctx);
        if (!user) {
            return ctx.throw(401, 'Not logged');
        }

        if (user.role === 'MANAGER' && body.role === 'ADMIN') {
            logger.info('[OktaProvider] - User is manager but the new user is admin');
            return ctx.throw(403, 'Forbidden');
        }

        if (!body.extraUserData || !body.extraUserData.apps) {
            logger.info('[OktaProvider] - Not send apps');
            return ctx.throw(400, 'Apps required');
        }

        if (!user.extraUserData || !user.extraUserData.apps) {
            logger.info('[OktaProvider] - logged user does not contain apps');
            return ctx.throw(403, 'Forbidden');
        }

        // Check apps
        for (let i: number = 0, { length } = body.extraUserData.apps; i < length; i += 1) {
            if (user.extraUserData.apps.indexOf(body.extraUserData.apps[i]) < 0) {
                return ctx.throw(403, 'Forbidden');
            }
        }

        try {
            ctx.body = await OktaService.createUserWithoutPassword({
                name: body.name,
                email: body.email,
                role: body.role,
                apps: body.extraUserData.apps,
                photo: body.photo,
                provider: OktaOAuthProvider.LOCAL,
                origin: ctx.session.callbackUrl || '',
            });
        } catch (err) {
            logger.error('[OktaProvider] - Error creating user, ', err);
            if (err.response?.data?.errorCauses[0]?.errorSummary === 'login: An object with this field already exists in the current organization') {
                return ctx.throw(400, 'Email exists');
            }

            return ctx.throw(500, 'Internal server error');
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

        if (config.get(`okta.googleIdP`)) {
            thirdParty.google = true;
        }

        if (config.get(`okta.facebookIdP`)) {
            thirdParty.facebook = true;
        }

        if (config.get(`okta.appleIdP`)) {
            thirdParty.apple = true;
        }

        if (ctx.query.error) {
            await ctx.render('login', {
                error: true,
                error_description: ctx.query.error_description || '',
                thirdParty,
                generalConfig: ctx.state.generalConfig
            });
        } else {
            ctx.throw(401, 'Not authenticated');
        }
    }

    static async logout(ctx: Context): Promise<void> {
        const user: IUser = Utils.getUser(ctx);
        if (!user) {
            return ctx.throw(401, 'Not logged');
        }
        await OktaService.logoutUser(user);

        ctx.logout();
        ctx.redirect('/auth/login');
    }

    static async signUp(ctx: Context): Promise<void> {
        try {
            logger.info('[OktaProvider] - Creating user');

            const newUser: IUser = await OktaService.createUserWithoutPassword({
                name: ctx.request.body.name,
                email: ctx.request.body.email,
                provider: OktaOAuthProvider.LOCAL,
                role: 'USER',
                origin: ctx.session.callbackUrl || '',
                apps: ctx.request.body.apps || [],
            });

            if (ctx.request.type === 'application/json') {
                ctx.response.type = 'application/json';
                ctx.body = UserSerializer.serialize(newUser);
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
            logger.error('[OktaProvider] Error causes (if present): ', err.response?.data?.errorCauses);

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

        if (config.get(`okta.googleIdP`)) {
            thirdParty.google = true;
        }

        if (config.get(`okta.facebookIdP`)) {
            thirdParty.facebook = true;
        }

        if (config.get(`okta.appleIdP`)) {
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

        let oktaUser: OktaUser;
        try {
            // Find user by email and update user origin field on Okta
            oktaUser = await OktaService.getOktaUserByEmail(ctx.request.body.email);
            await OktaService.updateUserProtectedFields(oktaUser.id, { origin: ctx.session.callbackUrl || '' });

        } catch (err) {
            logger.error(err);

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

        if (oktaUser?.profile.provider !== 'local') {
            throw new PasswordRecoveryNotAllowedError('Password recovery not allowed. Your email address is already associated with an account that uses a 3rd party login (Google/Facebook/Apple)');
        }

        // Send password recovery email
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
    }

    static async updateApplications(ctx: Context): Promise<void> {
        logger.info(`[OktaProvider - updateApplications] - Checking if user applications need to be updated`);
        try {
            if (ctx.session && ctx.session.applications) {
                logger.info(`[OktaProvider - updateApplications] - Updating user applications`);

                /**
                 * Hack: this method is called shortly after a new Okta user is created (following a social login, for example)
                 * The following lines will use Okta's API to search for a user based on its legacyId.
                 * For some reason (I assume an index delay on Okta's side) that search may come up empty if it's done straight
                 * away, so I'm giving 2 seconds (picked randomly) to Okta, so it can index that data and properly serve it.
                 */
                sleep(2);
                let user: IUser = Utils.getUser(ctx);
                if (user.role === 'USER') {
                    user = await OktaService.updateApplicationsForUser(user.id, ctx.session.applications);
                } else {
                    user = await OktaService.getUserById(user.id);
                }
                delete ctx.session.applications;
                logger.debug(`[OktaProvider - updateApplications] - user data: `, JSON.stringify(user));
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

        try {
            const token: string = await OktaProvider.createToken(ctx);
            ctx.body = { token };
        } catch (e) {
            logger.info(e);
        }
    }

    static async signUpRedirect(ctx: Context): Promise<void> {
        const email: string = ctx.query.email as string;
        if (!email) {
            logger.error(`[OktaProvider] No email provided for sign-up-redirect.`);
            return ctx.throw(400, 'No email provided.');
        }

        try {
            // Replace possible spaces in the email with + sign :shrug:
            const oktaUser: OktaUser = await OktaService.getOktaUserByEmail(email.replace(/\s/, '+'));
            const redirect: string = oktaUser.profile.origin;
            if (!redirect) {
                ctx.body = { error: 'Redirect not found.' };
                return;
            }

            logger.info(`[OktaProvider] Redirect found, redirecting user to ${redirect}`);
            return ctx.redirect(redirect);
        } catch (err) {
            // User not found in Okta
            if (err.response?.status === 404) {
                logger.error(`[OktaProvider] User not found in Okta.`);
                return ctx.throw(404, 'User not found.');
            }

            if (err.message === 'Redirect not found.') {
                logger.error(`[OktaProvider] User doesn't have redirect stored in "origin" field of profile.`);
                return ctx.throw(404, 'Redirect not found.');
            }

            logger.error(`[OktaProvider] Unknown error occurred, `, err);
            return ctx.throw(500, 'Internal server error');
        }
    }
}

export default OktaProvider;
