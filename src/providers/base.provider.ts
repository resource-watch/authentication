import { Context } from "koa";
import logger from "logger";
import UserService from "services/user.service";
import Utils from "utils";
import { IUser } from "models/user.model";

abstract class BaseProvider {
    static async createToken(ctx: Context, createInUser: boolean): Promise<string> {
        logger.info('Generating token');
        return UserService.createToken(Utils.getUser(ctx), createInUser);
    }

    static async generateJWT(ctx: Context): Promise<void> {
        logger.info('Generating token');
        try {
            const token: string = await BaseProvider.createToken(ctx, true);
            ctx.body = { token };
        } catch (e) {
            logger.info(e);
        }
    }

    static async updateApplications(ctx: Context): Promise<void> {
        try {
            if (ctx.session?.applications) {
                let user: IUser = Utils.getUser(ctx);
                if (user.role === 'USER') {
                    user = await UserService.updateApplicationsForUser(user.id, ctx.session.applications);
                } else {
                    user = await UserService.getUserById(user.id);
                }
                delete ctx.session.applications;
                if (user) {
                    await ctx.login({
                        id: user._id,
                        provider: user.provider,
                        providerId: user.providerId,
                        role: user.role,
                        createdAt: user.createdAt,
                        extraUserData: user.extraUserData,
                        email: user.email,
                        photo: user.photo,
                        name: user.name
                    });
                }
            }
            ctx.redirect('/auth/success');
        } catch (err) {
            logger.info(err);
            ctx.redirect('/auth/fail');
        }

    }

}

export default BaseProvider;
