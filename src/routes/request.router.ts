import { Context } from 'koa';
import router, { Router, Config } from 'koa-joi-router';
import logger from 'logger';
import Utils from 'utils';
import jwt from 'jsonwebtoken';
import { IUser, JWTPayload } from "services/okta.interfaces";
import UserSerializer from "serializers/user.serializer";
import { UserModelStub } from "models/user.model.stub";
import OktaService from "services/okta.service";
import Settings from "services/settings.service";
import { IApplication } from "models/application";
import ApplicationService from "services/application.service";
import ApplicationSerializer from "serializers/application.serializer";

const requestRouter: Router = router();
requestRouter.prefix('/api/v1/request');

const Joi: typeof router.Joi = router.Joi;

const validateRequestValidation: Config["validate"] = {
    type: 'json',
    header: Joi.object({
        authorization: Joi.string().required(),
    }).unknown(true),
    body: Joi.object({
        userToken: Joi.string().optional(),
        apiKey: Joi.string().optional(),
    })
};


class RequestRouter {
    static async validateRequest(ctx: Context): Promise<void> {
        const { userToken, apiKey } = ctx.request.body;
        const response: { user?: Record<string, any>, application?: Record<string, any> } = {};

        if (userToken) {
            logger.debug(`[RequestRouter] Validating userToken: ${userToken} and apiKey ${apiKey ? apiKey : '<not provided>'}`);
            let decodedUserToken: JWTPayload
            try {
                let splitUserToken: string;
                const parts: string[] = userToken.split(' ');

                if (parts.length === 2) {
                    const scheme: string = parts[0];
                    const credentials: string = parts[1];

                    if (/^Bearer$/i.test(scheme)) {
                        splitUserToken = credentials;
                    }
                } else {
                    splitUserToken = userToken;
                }

                const secret: string = Settings.getSettings().jwt.secret;
                decodedUserToken = (jwt.verify(splitUserToken, secret) as JWTPayload);
            } catch (error) {
                if (error instanceof jwt.JsonWebTokenError) {
                    ctx.throw(401, 'Invalid userToken');
                } else {
                    ctx.throw(500, 'Internal server error validating userToken');
                }
                return;
            }

            if (decodedUserToken.id === 'microservice') {
                response.user = { data: { id: 'microservice' } };
            } else {
                const isRevoked: boolean = await OktaService.checkRevokedToken(ctx, decodedUserToken);
                if (isRevoked) {
                    ctx.throw(401, 'Token revoked');
                    return;
                }

                const user: IUser = await OktaService.getUserById(decodedUserToken.id);
                if (!user) {
                    ctx.throw(404, 'User not found');
                    return;
                }
                response.user = await UserSerializer.serialize(await UserModelStub.hydrate(user));
            }
        }

        if (apiKey) {
            const application: IApplication = await ApplicationService.getApplicationByApiKey(apiKey);

            response.application = ApplicationSerializer.serialize(await application.hydrate());
        }

        ctx.body = response
    }
}

requestRouter.route({
    method: 'post',
    path: '/validate',
    validate: validateRequestValidation,
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore
    pre: Utils.isMicroservice, handler: RequestRouter.validateRequest,
});

export default requestRouter;
