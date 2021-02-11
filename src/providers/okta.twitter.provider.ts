import Router from 'koa-router';
import logger from 'logger';
import passport from 'koa-passport';
import Settings, {IApplication, ISettings, IThirdPartyAuth} from 'services/settings.service';
import {Context, Next} from 'koa';
import {IUser} from 'models/user.model';
import OktaService from 'services/okta.service';
import {OktaOAuthProvider, OktaUser} from 'services/okta.interfaces';
import {IStrategyOption, Strategy as TwitterStrategy} from 'passport-twitter';
import {Strategy} from 'passport';
import UserNotFoundError from 'errors/userNotFound.error';

async function registerUserBasicTwitter(
    accessToken: string,
    refreshToken: string,
    profile: Record<string, any>,
    done: (error: any, user?: any, message?: any) => void
): Promise<void> {

    try {
        logger.info('[OktaTwitterProvider] Registering user', profile);
        let user: OktaUser = await OktaService.findOktaUserByProviderId(OktaOAuthProvider.TWITTER, profile.id);
        logger.info(user);

        if (!user) {
            done(null, false, { message: 'No RW API user found for this Twitter account' });
        } else {
            let email: string = null;
            if (profile?.emails?.length > 0) {
                email = profile.emails[0].value;
            }
            if (email && email !== user.profile.email) {
                logger.info('[TwitterProvider] Updating email');
                user = await OktaService.updateUserProtectedFields(user.id, { email });
            }
        }

        const convertedUser: IUser = OktaService.convertOktaUserToIUser(user);

        logger.info('[OktaTwitterProvider] Returning user');
        done(null, {
            id: convertedUser.id,
            provider: convertedUser.provider,
            providerId: convertedUser.providerId,
            role: convertedUser.role,
            createdAt: convertedUser.createdAt,
            extraUserData: convertedUser.extraUserData,
            name: convertedUser.name,
            photo: convertedUser.photo,
            email: convertedUser.email
        });
    } catch (err) {
        if (err instanceof UserNotFoundError) {
            logger.error('[OktaTwitterProvider] Error during Twitter Token auth, ', err);
            done(null, false, { message: 'No RW API user found for this Twitter account' });
        }

        logger.error('[OktaTwitterProvider] Unknown error occurred ', err);
        done(null, false, { message: 'Unknown error occurred.' });
    }
}

export function registerOktaTwitterStrategies(): void {
    passport.serializeUser((user, done) => { done(null, user); });
    passport.deserializeUser((user, done) => { done(null, user); });

    if (Settings.getSettings().thirdParty) {
        logger.info('[OktaTwitterProvider] Loading Twitter auth');
        const apps: string[] = Object.keys(Settings.getSettings().thirdParty);
        for (let i: number = 0, { length } = apps; i < length; i += 1) {
            logger.info(`[OktaTwitterProvider] Loading Twitter auth settings for ${apps[i]}`);
            const app: IThirdPartyAuth = Settings.getSettings().thirdParty[apps[i]];
            if (app.twitter?.active) {
                logger.info(`[OktaTwitterProvider] Loading Twitter auth passport provider for ${apps[i]}`);
                const configTwitter: IStrategyOption = {
                    consumerKey: app.twitter.consumerKey,
                    consumerSecret: app.twitter.consumerSecret,
                    userProfileURL: 'https://api.twitter.com/1.1/account/verify_credentials.json?include_email=true',
                    callbackURL: `${Settings.getSettings().publicUrl}/auth/twitter/callback`
                };
                const twitterStrategy: Strategy = new TwitterStrategy(configTwitter, registerUserBasicTwitter);
                twitterStrategy.name += `:${apps[i]}`;
                passport.use(twitterStrategy);
            }
        }
    }
}

const router: Router = new Router({ prefix: '/auth/twitter' });

const getUser: (ctx: Context) => IUser = (ctx: Context) => ctx.request.query.user || ctx.state.user;

const getOriginApp: (ctx: Context, config: ISettings) => string = (ctx: Context, config: ISettings) => {
    if (ctx.query.origin) {
        return ctx.query.origin;
    }

    if (ctx.session && ctx.session.originApplication) {
        return ctx.session.originApplication;
    }

    return config.defaultApp;
};

class OktaTwitterProvider {

    static async redirectStart(ctx: Context): Promise<void> {
        ctx.redirect(`${Settings.getSettings().publicUrl}/auth/twitter/start`);
    }

    static async startMigration(ctx: Context): Promise<void> {
        const app: string = getOriginApp(ctx, Settings.getSettings());

        return ctx.render('start', {
            error: false,
            app
        });
    }

    static async twitter(ctx: Context, next: Next): Promise<void> {
        const app: string = getOriginApp(ctx, Settings.getSettings());
        // @ts-ignore
        await passport.authenticate(`twitter:${app}`)(ctx, next);
    }

    static async twitterCallbackAuthentication(ctx: Context, next: Next): Promise<void> {
        const app: string = getOriginApp(ctx, Settings.getSettings());
        // @ts-ignore
        await passport.authenticate(`twitter:${app}`, { failureRedirect: '/auth/twitter/fail', failureFlash: true })(ctx, next);
    }

    static async redirectToMigrate(ctx: Context): Promise<void> {
        await ctx.login(getUser(ctx));
        ctx.redirect('/auth/twitter/migrate');
    }

    static async migrateView(ctx: Context): Promise<void> {
        if (!ctx.session) {
            logger.info('No session found. Redirecting to the migration start page.');
            return ctx.redirect('/auth/twitter/start');
        }

        const user: IUser = getUser(ctx);
        if (!user) {
            logger.info('No user found in current session when presenting the migration form. Redirecting to the migration start page.');
            return ctx.redirect('/auth/twitter/start');
        }

        return ctx.render('migrate', {
            error: false,
            email: user.email
        });
    }

    static async migrate(ctx: Context): Promise<void> {
        if (!ctx.session) {
            logger.info('No user found in current session when presenting the migration form. Redirecting to the migration start page.');
            return ctx.redirect('/auth/twitter/start');
        }

        const sessionUser: IUser = getUser(ctx);
        if (!sessionUser) {
            logger.info('No user found in current session when presenting the migration form. Redirecting to the migration start page.');
            return ctx.redirect('/auth/twitter/start');
        }

        logger.info('Migrating user');
        let error: string = null;
        if (!ctx.request.body.email || !ctx.request.body.password || !ctx.request.body.repeatPassword) {
            error = 'Email, Password and Repeat password are required';
        }
        if (ctx.request.body.password !== ctx.request.body.repeatPassword) {
            error = 'Password and Repeat password not equal';
        }

        if (error) {
            await ctx.render('migrate', {
                error,
                email: ctx.request.body.email
            });

            return;
        }

        const user: OktaUser = await OktaService.getOktaUserById(sessionUser.id);
        if (!user) {
            error = 'Could not find a valid user account for the current session';
        }

        const migratedUser: IUser = await OktaService.migrateToUsernameAndPassword(user, ctx.request.body.email, ctx.request.body.password);

        if (error) {
            await ctx.render('migrate', {
                error,
                email: ctx.request.body.email
            });

            return;
        }

        await ctx.login(migratedUser);

        return ctx.redirect('/auth/twitter/finished');
    }

    static async finished(ctx: Context): Promise<void> {
        if (!ctx.session) {
            logger.info('No user found in current session when presenting the migration form. Redirecting to the migration start page.');
            return ctx.redirect('/auth/twitter/start');
        }

        const sessionUser: IUser = getUser(ctx);
        if (!sessionUser) {
            logger.info('No user found in current session when presenting the migration form. Redirecting to the migration start page.');
            return ctx.redirect('/auth/twitter/start');
        }

        return ctx.render('finished');
    }

    static async failAuth(ctx: Context): Promise<void> {
        logger.info('Not authenticated');
        const app: string = getOriginApp(ctx, Settings.getSettings());

        const error:string = ctx.flash('error');

        return ctx.render('start', {
            error,
            app
        });
    }
}

async function loadApplicationGeneralConfig(ctx: Context, next: Next): Promise<void> {
    const config: ISettings = await Settings.getSettings();

    const app: string = getOriginApp(ctx, config);
    const applicationConfig: IApplication = config.applications && config.applications[app];

    if (applicationConfig) {
        ctx.state.application = applicationConfig;
    }

    await next();
}

// @ts-ignore
router.get('/', OktaTwitterProvider.redirectStart);
router.get('/start', loadApplicationGeneralConfig, OktaTwitterProvider.startMigration);
// @ts-ignore
router.get('/auth', OktaTwitterProvider.twitter);
router.get('/callback', OktaTwitterProvider.twitterCallbackAuthentication, OktaTwitterProvider.redirectToMigrate);
router.get('/migrate', loadApplicationGeneralConfig, OktaTwitterProvider.migrateView);
router.post('/migrate', loadApplicationGeneralConfig, OktaTwitterProvider.migrate);
router.get('/finished', loadApplicationGeneralConfig, OktaTwitterProvider.finished);
router.get('/fail', loadApplicationGeneralConfig, OktaTwitterProvider.failAuth);

export default router;
