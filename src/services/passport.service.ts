import bcrypt from 'bcrypt';
import passport from 'koa-passport';
import { BasicStrategy } from 'passport-http';
import { IStrategyOption, Strategy as TwitterStrategy } from 'passport-twitter';
import { Strategy as FacebookStrategy, StrategyOption } from 'passport-facebook';
import { Strategy as GoogleStrategy, StrategyOptions } from 'passport-google-oauth20';
import { Strategy as LocalStrategy } from 'passport-local';
// @ts-ignore
import { Strategy as GoogleTokenStrategy } from 'passport-google-token';
import FacebookTokenStrategy from 'passport-facebook-token';

import logger from 'logger';
import NoTwitterAccountError from "errors/noTwitterAccount.error";
import UserModel, { IUser } from 'models/user.model';
import Settings, { IThirdPartyAuth } from "services/settings.service";
import UserService from 'services/user.service';
import { Strategy } from "passport";
import PassportFacebookToken from "passport-facebook-token";

async function registerUser(accessToken: string, refreshToken: string, profile: any, done: (error: any, user?: any) => void): Promise<void> {
    logger.info('[passportService] Registering user', profile);

    let user: IUser = await UserModel.findOne({
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
            photo = profile.photos && profile.photos.length > 0 ? profile.photos[0].value : null;
            if (profile.emails && profile.emails.length > 0) {
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
            if (profile.emails && profile.emails.length > 0) {
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

async function registerUserBasic(userId: string, password: string, done: (error: any, user?: any) => void): Promise<void> {
    try {
        logger.info('[passportService] Verifying basic auth');
        if (userId === Settings.getSettings().basic.userId && password === Settings.getSettings().basic.password) {
            done(null, {
                id: '57ab3917d1d5fb2f00b20f2d',
                provider: 'basic',
                role: Settings.getSettings().basic.role,
            });
        } else {
            done(null, false);
        }
    } catch (e) {
        logger.info(e);
    }
}

export default async function registerStrategies(): Promise<void> {
    async function registerUserBasicTwitter(
        accessToken: string,
        refreshToken: string,
        profile: Record<string, any>,
        done: (error: any, user?: any) => void
    ): Promise<void> {
        logger.info('[passportService] Registering user', profile);

        const user: IUser = await UserService.getUser({
            provider: 'twitter',
            providerId: profile.id,
        });

        logger.info(user);

        if (!user) {
            done(new NoTwitterAccountError());
        } else {
            let email: string = null;
            if (profile && profile.emails && profile.emails.length > 0) {
                email = profile.emails[0].value;
            }
            if (email && email !== user.email) {
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

    passport.serializeUser((user, done) => {
        done(null, user);
    });

    passport.deserializeUser((user, done) => {
        done(null, user);
    });

    if (Settings.getSettings().local && Settings.getSettings().local.active) {
        logger.info('[passportService] Loading local strategy');
        const login: (username: string, password: string, done: (error: any, user?: any) => void) => Promise<void> = async (username: string, password: string, done: (error: any, user?: any) => void): Promise<void> => {
            const user: IUser = await UserModel.findOne({
                email: username,
                provider: 'local'
            }).exec();
            if (user && user.salt && user.password === bcrypt.hashSync(password, user.salt)) {
                done(null, {
                    id: user._id,
                    name: user.name,
                    photo: user.photo,
                    provider: user.provider,
                    providerId: user.providerId,
                    email: user.email,
                    role: user.role,
                    createdAt: user.createdAt,
                    extraUserData: user.extraUserData
                });
            } else {
                done(null, false);
            }
        };
        const localStrategy: Strategy = new LocalStrategy({
            usernameField: 'email',
            passwordField: 'password',
        }, login);
        passport.use(localStrategy);
    }

    if (Settings.getSettings().basic && Settings.getSettings().basic.active) {
        logger.info('[passportService] Loading basic strategy');
        const basicStrategy: BasicStrategy = new BasicStrategy(registerUserBasic);
        passport.use(basicStrategy);
    }

    // third party oauth
    if (Settings.getSettings().thirdParty) {
        logger.info('[passportService] Loading third-party oauth');
        const apps: string[] = Object.keys(Settings.getSettings().thirdParty);
        for (let i: number = 0, { length } = apps; i < length; i += 1) {
            logger.info(`[passportService] Loading third-party oauth of app: ${apps[i]}`);
            const app: IThirdPartyAuth = Settings.getSettings().thirdParty[apps[i]];
            if (app.twitter && app.twitter.active) {
                logger.info(`[passportService] Loading twitter strategy of ${apps[i]}`);
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

            if (app.google && app.google.active) {
                logger.info(`[passportService] Loading google strategy ${apps[i]}`);
                const configGoogle: StrategyOptions = {
                    clientID: app.google.clientID,
                    clientSecret: app.google.clientSecret,
                    callbackURL: `${Settings.getSettings().publicUrl}/auth/google/callback`,
                    userProfileURL: 'https://www.googleapis.com/oauth2/v3/userinfo'
                };
                const googleStrategy: Strategy = new GoogleStrategy(configGoogle, registerUser);
                googleStrategy.name += `:${apps[i]}`;
                passport.use(googleStrategy);

                const configGoogleToken: Record<string, any> = {
                    clientID: app.google.clientID,
                    clientSecret: app.google.clientSecret,
                    passReqToCallback: false
                };
                const googleTokenStrategy: any = new GoogleTokenStrategy(configGoogleToken, registerUser);
                googleTokenStrategy.name += `:${apps[i]}`;
                passport.use(googleTokenStrategy);
            }

            if (app.facebook && app.facebook.active) {
                logger.info(`[passportService] Loading facebook strategy ${apps[i]}`);
                const configFacebook: StrategyOption = {
                    clientID: app.facebook.clientID,
                    clientSecret: app.facebook.clientSecret,
                    callbackURL: `${Settings.getSettings().publicUrl}/auth/facebook/callback`,
                    profileFields: ['id', 'displayName', 'photos', 'email'],
                    graphAPIVersion: 'v7.0',
                };
                const facebookStrategy: Strategy = new FacebookStrategy(configFacebook, registerUser);
                facebookStrategy.name += `:${apps[i]}`;
                passport.use(facebookStrategy);

                const configFacebookToken: StrategyOptions = {
                    clientID: app.facebook.clientID,
                    clientSecret: app.facebook.clientSecret,
                    passReqToCallback: false
                };
                const facebookTokenStrategy: PassportFacebookToken.StrategyInstance = new FacebookTokenStrategy(configFacebookToken, registerUser);
                facebookTokenStrategy.name += `:${apps[i]}`;
                passport.use(facebookTokenStrategy);
            }
        }
    }
}
