import {Context, Next} from 'koa';
import {RouterContext} from 'koa-router';
import passport from 'koa-passport';
import logger from 'logger';
import Utils from 'utils';
import Settings, {IThirdPartyAuth} from 'services/settings.service';
// @ts-ignore
import {Strategy as GoogleTokenStrategy} from 'passport-google-token';
import {OktaOAuthProvider, OktaUser, IUser} from 'services/okta.interfaces';
import OktaService from 'services/okta.service';
import OktaProvider from 'providers/okta.provider';

export class OktaGoogleProvider {

    static async registerUser(accessToken: string, refreshToken: string, profile: any, done: (error: any, user?: any) => void): Promise<void> {
        try {
            logger.info('[OktaGoogleProvider] Registering user', profile);
            let user: IUser;
            const email: string = profile?.emails[0]?.value || profile?.email;

            try {
                const oktaUser: OktaUser = await OktaService.getOktaUserByEmail(email);
                user = OktaService.convertOktaUserToIUser(oktaUser);
            } catch (err) {
                // User not found, let's create him/her
                logger.info(`[OktaGoogleProvider] User with email ${email} does not exist`);
                user = await OktaService.createUserWithoutPassword({
                    name: profile?.displayName,
                    email,
                    photo: profile.photos?.length > 0 ? profile.photos[0].value : null,
                    role: 'USER',
                    apps: [],
                    provider: OktaOAuthProvider.GOOGLE,
                    providerId: profile.id,
                });
            }

            logger.info('[OktaGoogleProvider] Returning user');
            done(null, {
                id: user.id,
                provider: user.provider,
                providerId: user.providerId,
                role: user.role,
                createdAt: user.createdAt,
                extraUserData: user.extraUserData,
                name: user.name,
                photo: user.photo,
                email: user.email
            });
        } catch (err) {
            logger.error('[OktaGoogleProvider] Error during Google Token auth, ', err);
            logger.error('[OktaGoogleProvider] Error causes (if present): ', err.response?.data?.errorCauses);
            done(err);
        }
    }

    static registerStrategies(): void {
        passport.serializeUser((user, done) => {
            done(null, user);
        });

        passport.deserializeUser((user, done) => {
            done(null, user);
        });

        // third party oauth
        if (Settings.getSettings().thirdParty) {
            logger.info('[OktaGoogleProvider] Loading Google auth');
            const apps: string[] = Object.keys(Settings.getSettings().thirdParty);
            for (let i: number = 0, { length } = apps; i < length; i += 1) {
                logger.info(`[OktaGoogleProvider] Loading Google auth settings for ${apps[i]}`);
                const app: IThirdPartyAuth = Settings.getSettings().thirdParty[apps[i]];
                if (app.google?.active) {
                    logger.info(`[OktaGoogleProvider] Loading Google token auth passport provider for ${apps[i]}`);
                    const configGoogleToken: Record<string, any> = {
                        clientID: app.google.clientID,
                        clientSecret: app.google.clientSecret,
                        passReqToCallback: false
                    };
                    const googleTokenStrategy: any = new GoogleTokenStrategy(configGoogleToken, OktaGoogleProvider.registerUser);
                    googleTokenStrategy.name += `:${apps[i]}`;
                    passport.use(googleTokenStrategy);
                }
            }
        }
    }

    static async google(ctx: Context): Promise<void> {
        const url: string = OktaService.getOAuthRedirect(OktaOAuthProvider.GOOGLE);
        return ctx.redirect(url);
    }

    static async googleToken(ctx: Context & RouterContext, next: Next): Promise<void> {
        const app: string = Utils.getOriginApp(ctx);
        await passport.authenticate(`google-token:${app}`)(ctx, next);
    }

    static async googleCallback(ctx: Context & RouterContext, next: Next): Promise<void> {
        return OktaProvider.authCodeCallback(ctx, next);
    }
}

export default OktaGoogleProvider;
