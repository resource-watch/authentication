import { Context, Next } from 'koa';
import { RouterContext } from 'koa-router';
import logger from 'logger';
import Utils from 'utils';
import Settings, { IThirdPartyAuth } from 'services/settings.service';
import UserModel, { UserDocument } from 'models/user.model';
import passport from 'koa-passport';
import { Strategy as FacebookStrategy, StrategyOption } from 'passport-facebook';
import FacebookTokenStrategy from 'passport-facebook-token';
import BaseProvider from 'providers/base.provider';

export class FacebookProvider extends BaseProvider {

    static registerStrategies(): void {
        passport.serializeUser((user, done) => {
            done(null, user);
        });

        passport.deserializeUser((user, done) => {
            done(null, user);
        });

        // third party oauth
        if (Settings.getSettings().thirdParty) {
            logger.info('[FacebookProvider] Loading Facebook auth');
            const apps: string[] = Object.keys(Settings.getSettings().thirdParty);
            for (let i: number = 0, { length } = apps; i < length; i += 1) {
                logger.info(`[FacebookProvider] Loading Facebook auth settings for: ${apps[i]}`);
                const app: IThirdPartyAuth = Settings.getSettings().thirdParty[apps[i]];

                if (app.facebook && app.facebook.active) {
                    logger.info(`[FacebookProvider] Loading Facebook auth passport provider for ${apps[i]}`);
                    const configFacebook: StrategyOption = {
                        clientID: app.facebook.clientID,
                        clientSecret: app.facebook.clientSecret,
                        callbackURL: `${Settings.getSettings().publicUrl}/auth/facebook/callback`,
                        profileFields: ['id', 'displayName', 'photos', 'email'],
                        graphAPIVersion: 'v7.0',
                    };
                    const facebookStrategy: FacebookStrategy = new FacebookStrategy(configFacebook, FacebookProvider.registerUser);
                    facebookStrategy.name += `:${apps[i]}`;
                    passport.use(facebookStrategy);

                    const configFacebookToken: FacebookTokenStrategy.StrategyOptions = {
                        clientID: app.facebook.clientID,
                        clientSecret: app.facebook.clientSecret
                    };
                    const facebookTokenStrategy: FacebookTokenStrategy.StrategyInstance = new FacebookTokenStrategy(configFacebookToken, FacebookProvider.registerUser);
                    facebookTokenStrategy.name += `:${apps[i]}`;
                    passport.use(facebookTokenStrategy);
                }
            }
        }
    }

    static async registerUser(accessToken: string, refreshToken: string, profile: any, done: (error: any, user?: any) => void): Promise<void> {
        logger.info('[FacebookProvider] Registering user', profile);

        let user: UserDocument = await UserModel.findOne({
            provider: profile.provider ? profile.provider.split('-')[0] : profile.provider,
            providerId: profile.id,
        }).exec();
        logger.info(user);
        if (!user) {
            logger.info('[FacebookProvider] User does not exist');
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
                logger.info('[FacebookProvider] Updating email');
                user.email = email;
                await user.save();
            }
        }
        logger.info('[FacebookProvider] Returning user');
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

    static async facebook(ctx: Context & RouterContext, next: Next): Promise<void> {
        const app: string = Utils.getOriginApp(ctx);
        await passport.authenticate(`facebook:${app}`, {
            scope: Settings.getSettings().thirdParty[app] ? Settings.getSettings().thirdParty[app].facebook.scope : [],
        })(ctx, next);
    }

    static async facebookToken(ctx: Context & RouterContext, next: Next): Promise<void> {
        const app: string = Utils.getOriginApp(ctx);
        await passport.authenticate(`facebook-token:${app}`)(ctx, next);
    }

    static async facebookCallback(ctx: Context & RouterContext, next: Next): Promise<void> {
        const app: string = Utils.getOriginApp(ctx);
        await passport.authenticate(
            `facebook:${app}`,
            { failureRedirect: '/auth/fail' }
        )(ctx, next);
    }
}

export default FacebookProvider;
