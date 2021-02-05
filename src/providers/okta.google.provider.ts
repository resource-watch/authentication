import { Context, Next } from 'koa';
import { RouterContext } from 'koa-router';
import passport from 'koa-passport';
import logger from 'logger';
import Utils from 'utils';
import Settings, { IThirdPartyAuth } from 'services/settings.service';
import {IUser} from 'models/user.model';
import BaseProvider from 'providers/base.provider';
// @ts-ignore
import { Strategy as GoogleTokenStrategy } from 'passport-google-token';
import {OktaOAuthProvider, OktaUser} from 'services/okta.interfaces';
import OktaService from 'services/okta.service';
import {v4 as uuidv4} from 'uuid';
import OktaProvider from 'providers/okta.provider';

export class OktaGoogleProvider extends BaseProvider {

    static async registerUser(accessToken: string, refreshToken: string, profile: any, done: (error: any, user?: any) => void): Promise<void> {
        try {
            logger.info('[OktaGoogleProvider] Registering user', profile);
            let oktaUser: OktaUser = await OktaService.findOktaUserByProviderId(OktaOAuthProvider.GOOGLE, profile.id);
            let user: IUser;
            if (!oktaUser) {
                logger.info('[OktaGoogleProvider] User does not exist');
                let email: string = null;
                if (profile) {
                    if (profile.emails?.length > 0) {
                        email = profile.emails[0].value;
                    } else if (profile.email) {
                        ({ email } = profile);
                    }
                }

                user = await OktaService.createUserWithoutPassword({
                    email,
                    name: profile?.displayName,
                    photo: profile.photos?.length > 0 ? profile.photos[0].value : null,
                    role: 'USER',
                    apps: [],
                });
            } else {
                let email: string = null;
                if (profile) {
                    if (profile.emails?.length > 0) {
                        email = profile.emails[0].value;
                    } else if (profile.email) {
                        ({email} = profile);
                    }
                }

                if (email) {
                    oktaUser = await OktaService.updateUserProtectedFields(oktaUser.id, {email});
                }

                user = OktaService.convertOktaUserToIUser(oktaUser);
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
        const state: string = uuidv4();
        ctx.session.oAuthState = state;

        const url: string = OktaService.getOAuthRedirect(OktaOAuthProvider.GOOGLE, Utils.getOriginApp(ctx), state);
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
