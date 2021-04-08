import { Context, Next } from 'koa';
import logger from 'logger';
// @ts-ignore
import Verifier from 'apple-signin-verify-token';
import { RouterContext } from 'koa-router';
import UserSerializer from '../serializers/user.serializer';
import OktaService from 'services/okta.service';
import { OktaOAuthProvider, OktaUser, IUser } from 'services/okta.interfaces';
import OktaProvider from 'providers/okta.provider';

export class OktaAppleProvider {

    static async apple(ctx: Context & RouterContext): Promise<void> {
        const url: string = OktaService.getOAuthRedirect(OktaOAuthProvider.APPLE);
        return ctx.redirect(url);
    }

    static async appleToken(ctx: Context, next: Next): Promise<any> {
        const { access_token } = ctx.request.query;
        const jwtToken: Record<string, any> = await Verifier.verify(access_token);
        if (!jwtToken.sub) {
            ctx.status = 401;
            ctx.body = {
                errors: [{ status: 401, detail: 'Invalid access token' }]
            };
            return next();
        }

        try {
            let user: IUser;
            let oktaUser: OktaUser = await OktaService.findOktaUserByProviderId(OktaOAuthProvider.APPLE, jwtToken.sub);

            if (!oktaUser) {
                logger.info('[OktaAppleProvider] User does not exist');
                user = await OktaService.createUserWithoutPassword({
                    email: jwtToken.email,
                    role: 'USER',
                    apps: [],
                    provider: OktaOAuthProvider.APPLE,
                    providerId: jwtToken.sub,
                });
            } else if (jwtToken.email) {
                logger.info('[OktaAppleProvider] Updating email');
                oktaUser = await OktaService.updateUserProtectedFields(oktaUser.id, { email: jwtToken.email });
                user = OktaService.convertOktaUserToIUser(oktaUser);
            }

            logger.info('[OktaAppleProvider] Returning user');

            // This places the user data in the ctx object as Passport would
            // @ts-ignore
            ctx.req.user = UserSerializer.serializeElement(user);
            ctx.status = 200;

            return next();
        } catch (err) {
            logger.error('[OktaAppleProvider] Error during Apple Token auth, ', err);
            ctx.throw(err);
        }
    }

    static async appleCallback(ctx: Context & RouterContext, next: Next): Promise<void> {
        return OktaProvider.authCodeCallback(ctx, next);
    }
}

export default OktaAppleProvider;
