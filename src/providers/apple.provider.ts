import { Context, Next } from "koa";
import logger from "logger";
import Utils from "utils";
import Settings, { IThirdPartyAuth } from "services/settings.service";
import { IUser } from "models/user.model";
import UserModel from "../models/user.model";
import passport from "koa-passport";
// @ts-ignore
import Verifier from 'apple-signin-verify-token';
import AppleStrategy, { DecodedIdToken, Profile, VerifyCallback } from 'passport-apple';
import { Request } from 'express';
import { RouterContext } from "koa-router";
import BaseProvider from "./base.provider";

export class AppleProvider extends BaseProvider {

    static registerStrategies(): void {
        passport.serializeUser((user, done) => {
            done(null, user);
        });

        passport.deserializeUser((user, done) => {
            done(null, user);
        });

        // third party oauth
        if (Settings.getSettings().thirdParty) {
            logger.info('[passportService] Loading third-party oauth');
            const apps: string[] = Object.keys(Settings.getSettings().thirdParty);
            for (let i: number = 0, { length } = apps; i < length; i += 1) {
                logger.info(`[passportService] Loading third-party oauth of app: ${apps[i]}`);
                const app: IThirdPartyAuth = Settings.getSettings().thirdParty[apps[i]];

                if (app.apple && app.apple.active) {
                    logger.info(`[passportService] Loading apple strategy ${apps[i]}`);
                    const configApple: AppleStrategy.AuthenticateOptionsWithRequest = {
                        clientID: app.apple.clientId,
                        teamID: app.apple.teamId,
                        callbackURL: `${Settings.getSettings().publicUrl}/auth/apple/callback`,
                        keyID: app.apple.keyId,
                        privateKeyString: app.apple.privateKeyString,
                        passReqToCallback: true,
                        scope: 'name email'
                    };
                    const appleStrategy: AppleStrategy = new AppleStrategy(configApple, AppleProvider.registerUser);
                    appleStrategy.name += `:${apps[i]}`;
                    passport.use(appleStrategy);
                }
            }
        }
    }

    static async registerUser(req: Request, accessToken: string, refreshToken: string, decodedIdToken: DecodedIdToken, profile: Profile, verified: VerifyCallback): Promise<void> {
        logger.info('[passportService - registerAppleUser] Registering user', profile);
        logger.debug('[passportService - registerAppleUser] accessToken', accessToken);
        logger.debug('[passportService - registerAppleUser] refreshToken', refreshToken);
        logger.debug('[passportService - registerAppleUser] decodedIdToken', decodedIdToken);

        let user: IUser = await UserModel.findOne({
            provider: 'apple',
            providerId: decodedIdToken.sub,
        }).exec();
        logger.info(user);
        const { email } = decodedIdToken;
        if (!user) {
            logger.info('[passportService] User does not exist');
            user = await new UserModel({
                email,
                provider: 'apple',
                providerId: decodedIdToken.sub
            }).save();
        } else {
            logger.info('[passportService] Updating email');
            user.email = email;
            await user.save();
        }
        logger.info('[passportService] Returning user');
        verified(null, {
            // eslint-disable-next-line no-underscore-dangle
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

    static async apple(ctx: Context & RouterContext, next: Next): Promise<void> {
        const app: string = Utils.getOriginApp(ctx);
        await passport.authenticate(`apple:${app}`)(ctx, next);
    }

    static async appleToken(ctx: Context, next: Next): Promise<any> {
        const appName: string = Utils.getOriginApp(ctx);
        const app: IThirdPartyAuth = Settings.getSettings().thirdParty[appName];


        // eslint-disable-next-line camelcase
        const { access_token } = ctx.request.query;

        const jwtToken: Record<string, any> = await Verifier.verify(access_token);

        if (!jwtToken.sub || jwtToken.aud !== app.apple.clientId) {
            ctx.status = 401;
            ctx.body = {
                errors: [{
                    status: 401,
                    detail: 'Invalid access token'
                }]
            };
        }

        let user: IUser = await UserModel.findOne({
            provider: 'apple',
            providerId: jwtToken.sub,
        }).exec();

        if (!user) {
            logger.info('[Auth router] User does not exist');
            user = await new UserModel({
                email: jwtToken.email,
                provider: 'apple',
                providerId: jwtToken.sub
            }).save();
        } else if (jwtToken.email) {
            logger.info('[Auth router] Updating email');
            user.email = jwtToken.email;
            await user.save();
        }
        logger.info('[passportService] Returning user');

        // This places the user data in the ctx object as Passport would
        // @ts-ignore
        ctx.req.user = user;
        ctx.status = 200;

        return next();
    }

    static async appleCallback(ctx: Context & RouterContext, next: Next): Promise<void> {
        const app: string = Utils.getOriginApp(ctx);
        await passport.authenticate(`apple:${app}`, {
            failureRedirect: '/auth/fail',
        })(ctx, next);
    }
}

export default AppleProvider;
