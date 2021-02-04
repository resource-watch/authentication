import { Context, Next } from 'koa';
import logger from 'logger';
import Utils from 'utils';
import Settings, { IThirdPartyAuth } from 'services/settings.service';
import UserModel, { UserDocument } from 'models/user.model';
import passport from 'koa-passport';
// @ts-ignore
import Verifier from 'apple-signin-verify-token';
import AppleStrategy, { DecodedIdToken, Profile, VerifyCallback } from 'passport-apple';
import { Request } from 'express';
import { RouterContext } from 'koa-router';
import BaseProvider from 'providers/base.provider';
import UserSerializer from '../serializers/user.serializer';

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
            logger.info('[AppleProvider] Loading Apple auth');
            const apps: string[] = Object.keys(Settings.getSettings().thirdParty);
            for (let i: number = 0, { length } = apps; i < length; i += 1) {
                logger.info(`[AppleProvider] Loading Apple auth settings for ${apps[i]}`);
                const app: IThirdPartyAuth = Settings.getSettings().thirdParty[apps[i]];

                if (app.apple?.active) {
                    logger.info(`[AppleProvider] Loading Apple auth passport provider for ${apps[i]}`);
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
        logger.info('[AppleProvider - registerUser] Registering user', profile);
        logger.debug('[AppleProvider - registerUser] accessToken', accessToken);
        logger.debug('[AppleProvider - registerUser] refreshToken', refreshToken);
        logger.debug('[AppleProvider - registerUser] decodedIdToken', decodedIdToken);

        let user: UserDocument = await UserModel.findOne({
            provider: 'apple',
            providerId: decodedIdToken.sub,
        }).exec();
        logger.info(user);
        const { email } = decodedIdToken;
        if (!user) {
            logger.info('[AppleProvider] User does not exist');
            user = await new UserModel({
                email,
                provider: 'apple',
                providerId: decodedIdToken.sub
            }).save();
        } else {
            logger.info('[AppleProvider] Updating email');
            user.email = email;
            await user.save();
        }
        logger.info('[AppleProvider] Returning user');
        verified(null, {
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

        let user: UserDocument = await UserModel.findOne({
            provider: 'apple',
            providerId: jwtToken.sub,
        }).exec();

        if (!user) {
            logger.info('[AppleProvider] User does not exist');
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
        logger.info('[AppleProvider] Returning user');

        // This places the user data in the ctx object as Passport would
        // @ts-ignore
        ctx.req.user = UserSerializer.serializeElement(user);
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
