import {Context, Next} from 'koa';
import {RouterContext} from 'koa-router';
import logger from 'logger';
import Utils from 'utils';
import Settings, {IThirdPartyAuth} from 'services/settings.service';
import passport from 'koa-passport';
import FacebookTokenStrategy from 'passport-facebook-token';
import OktaService from 'services/okta.service';
import { OktaOAuthProvider, OktaUser, IUser } from 'services/okta.interfaces';
import OktaProvider from 'providers/okta.provider';

export class OktaFacebookProvider {

    static registerStrategies(): void {
        passport.serializeUser((user: Express.User, done: (err: any, id?: any) => void) => {
            done(null, user);
        });

        passport.deserializeUser((user: any, done: (err: any, user?: (Express.User | false | null)) => void) => {
            done(null, user);
        });

        // third party oauth
        if (Settings.getSettings().thirdParty) {
            logger.info('[OktaFacebookProvider] Loading Facebook auth');
            const apps: string[] = Object.keys(Settings.getSettings().thirdParty);
            for (let i: number = 0, { length } = apps; i < length; i += 1) {
                logger.info(`[OktaFacebookProvider] Loading Facebook auth settings for: ${apps[i]}`);
                const app: IThirdPartyAuth = Settings.getSettings().thirdParty[apps[i]];

                if (app.facebook && app.facebook.active) {
                    logger.info(`[OktaFacebookProvider] Loading Facebook token auth passport provider for ${apps[i]}`);

                    const configFacebookToken: FacebookTokenStrategy.StrategyOptions = {
                        clientID: app.facebook.clientID,
                        clientSecret: app.facebook.clientSecret
                    };
                    const facebookTokenStrategy: FacebookTokenStrategy.StrategyInstance = new FacebookTokenStrategy(configFacebookToken, OktaFacebookProvider.registerUser);
                    facebookTokenStrategy.name += `:${apps[i]}`;
                    passport.use(facebookTokenStrategy);
                }
            }
        }
    }

    static async registerUser(accessToken: string, refreshToken: string, profile: any, done: (error: any, user?: any) => void): Promise<void> {
        try {
            logger.info('[OktaFacebookProvider] Registering user', profile);
            const email: string = profile?.emails[0]?.value || profile?.email;

            let user: IUser;
            try {
                const oktaUser: OktaUser = await OktaService.getOktaUserByEmail(email);
                user = OktaService.convertOktaUserToIUser(oktaUser);
            } catch (err) {
                // User not found, let's create him/her
                logger.info(`[OktaFacebookProvider] User with email ${email} does not exist`);
                user = await OktaService.createUserWithoutPassword({
                    name: profile?.displayName,
                    email,
                    photo: profile.photos?.length > 0 ? profile.photos[0].value : null,
                    role: 'USER',
                    apps: [],
                    provider: OktaOAuthProvider.FACEBOOK,
                    providerId: profile.id,
                });
            }

            logger.info('[OktaFacebookProvider] Returning user');
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
            logger.error('[OktaFacebookProvider] Error during Facebook Token auth, ', err);
            logger.error('[OktaFacebookProvider] Error causes (if present): ', err.response?.data?.errorCauses);
            done(err);
        }
    }

    static async facebook(ctx: Context & RouterContext): Promise<void> {
        const url: string = OktaService.getOAuthRedirect(OktaOAuthProvider.FACEBOOK);
        return ctx.redirect(url);
    }

    static async facebookToken(ctx: Context & RouterContext, next: Next): Promise<void> {
        const app: string = Utils.getOriginApp(ctx);
        await passport.authenticate(`facebook-token:${app}`)(ctx, next);
    }

    static async facebookCallback(ctx: Context & RouterContext, next: Next): Promise<void> {
        return OktaProvider.authCodeCallback(ctx, next);
    }
}

export default OktaFacebookProvider;
