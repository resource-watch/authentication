import { Context, Next } from 'koa';
import { RouterContext } from 'koa-router';
import passport from 'koa-passport';
import logger from 'logger';
import Utils from 'utils';
import Settings, { IThirdPartyAuth } from 'services/settings.service';
import UserModel, { UserDocument } from 'models/user.model';
import { Strategy } from 'passport';
import BaseProvider from 'providers/base.provider';
import { Strategy as GoogleStrategy, StrategyOptions } from 'passport-google-oauth20';
// @ts-ignore
import { Strategy as GoogleTokenStrategy } from 'passport-google-token';

export class GoogleProvider extends BaseProvider {

    static async registerUser(accessToken: string, refreshToken: string, profile: any, done: (error: any, user?: any) => void): Promise<void> {
        logger.info('[GoogleProvider] Registering user', profile);

        let user: UserDocument = await UserModel.findOne({
            provider: profile.provider ? profile.provider.split('-')[0] : profile.provider,
            providerId: profile.id,
        }).exec();
        logger.info(user);
        if (!user) {
            logger.info('[GoogleProvider] User does not exist');
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
                logger.info('[GoogleProvider] Updating email');
                user.email = email;
                await user.save();
            }
        }
        logger.info('[GoogleProvider] Returning user');
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

    static registerStrategies(): void {
        passport.serializeUser((user, done) => {
            done(null, user);
        });

        passport.deserializeUser((user, done) => {
            done(null, user);
        });

        // third party oauth
        if (Settings.getSettings().thirdParty) {
            logger.info('[GoogleProvider] Loading Google auth');
            const apps: string[] = Object.keys(Settings.getSettings().thirdParty);
            for (let i: number = 0, { length } = apps; i < length; i += 1) {
                logger.info(`[GoogleProvider] Loading Google auth settings for ${apps[i]}`);
                const app: IThirdPartyAuth = Settings.getSettings().thirdParty[apps[i]];
                if (app.google?.active) {
                    logger.info(`[GoogleProvider] Loading Google auth passport provider for ${apps[i]}`);
                    const configGoogle: StrategyOptions = {
                        clientID: app.google.clientID,
                        clientSecret: app.google.clientSecret,
                        callbackURL: `${Settings.getSettings().publicUrl}/auth/google/callback`,
                        userProfileURL: 'https://www.googleapis.com/oauth2/v3/userinfo'
                    };
                    const googleStrategy: Strategy = new GoogleStrategy(configGoogle, GoogleProvider.registerUser);
                    googleStrategy.name += `:${apps[i]}`;
                    passport.use(googleStrategy);

                    const configGoogleToken: Record<string, any> = {
                        clientID: app.google.clientID,
                        clientSecret: app.google.clientSecret,
                        passReqToCallback: false
                    };
                    const googleTokenStrategy: any = new GoogleTokenStrategy(configGoogleToken, GoogleProvider.registerUser);
                    googleTokenStrategy.name += `:${apps[i]}`;
                    passport.use(googleTokenStrategy);
                }
            }
        }
    }

    static async google(ctx: Context & RouterContext, next: Next): Promise<void> {
        const app: string = Utils.getOriginApp(ctx);
        await passport.authenticate(`google:${app}`, {
            scope: Settings.getSettings().thirdParty[app]?.google?.scope ? Settings.getSettings().thirdParty[app].google.scope : ['openid']
        })(ctx, next);
    }

    static async googleToken(ctx: Context & RouterContext, next: Next): Promise<void> {
        const app: string = Utils.getOriginApp(ctx);
        await passport.authenticate(`google-token:${app}`)(ctx, next);
    }

    static async googleCallback(ctx: Context & RouterContext, next: Next): Promise<void> {
        const app: string = Utils.getOriginApp(ctx);
        await passport.authenticate(`google:${app}`, { failureRedirect: '/auth/fail' })(ctx, next);
    }
}

export default GoogleProvider;
