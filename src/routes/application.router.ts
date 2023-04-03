import { Context } from 'koa';
import router, { Router } from 'koa-joi-router';
import logger from 'logger';
import ApplicationService from 'services/application.service';
import { CreateApplicationsDto, IApplication, UpdateApplicationsDto } from 'models/application';
import mongoose from 'mongoose';
import ApplicationSerializer from 'serializers/application.serializer';
import { PaginateDocument, PaginateOptions, PaginateResult } from 'mongoose';
import ApplicationNotFoundError from 'errors/applicationNotFound.error';
import { pick } from 'lodash';
import Utils from 'utils';
import { IUser } from 'services/okta.interfaces';

const applicationRouter: Router = router();
applicationRouter.prefix('/api/v1/application');

const Joi: typeof router.Joi = router.Joi;

const getApplicationsValidation: Record<string, any> = {
    query: {
        loggedUser: Joi.any().optional(),
        userId: Joi.string().optional(),
        page: Joi.object({
            number: Joi.number().integer().min(1).default(1),
            size: Joi.number().integer().min(1).max(100).default(10),
        }).optional(),
    }
};

const createApplicationValidation: Record<string, any> = {
    type: 'json',
    query: {
        loggedUser: Joi.any().optional(),
    },
    body: Joi.object({
        name: Joi.string().required(),
        organization: Joi.string().optional(),
        user: Joi.string().optional()
    }).xor('user', 'organization')
};

const updateApplicationValidation: Record<string, any> = {
    type: 'json',
    query: {
        loggedUser: Joi.any().optional(),
    },
    params: {
        id: Joi.string().required(),
    },
    body: Joi.object({
        name: Joi.string().optional(),
        organization: Joi.alternatives().try(Joi.allow(null), Joi.string()),
        user: Joi.alternatives().try(Joi.allow(null), Joi.string()),
        regenApiKey: Joi.boolean().optional()
    }).oxor('user', 'organization')
};

class ApplicationRouter {
    static async getApplications(ctx: Context): Promise<void> {
        const loggedUser: IUser = Utils.getUser(ctx);
        logger.info('Getting subscription for user ', loggedUser.id);

        const paginationOptions: PaginateOptions = Utils.getPaginationParameters(ctx);

        const filters: Record<string, any> = pick(ctx.query, []);

        const originalQuery: Record<string, any> = { ...ctx.query };
        delete originalQuery.page;
        const serializedQuery: string = Utils.serializeObjToQuery(originalQuery) ? `?${Utils.serializeObjToQuery(originalQuery)}&` : '?';
        const link: string = `${ctx.request.protocol}://${Utils.getHostForPaginationLink(ctx)}${ctx.request.path}${serializedQuery}`;

        try {
            const applications: PaginateResult<PaginateDocument<IApplication, unknown, PaginateOptions>> = await ApplicationService.getPaginatedApplications(filters, paginationOptions);
            ctx.body = ApplicationSerializer.serializeList(applications, link);
        } catch (err) {
            logger.error(err);
        }
    }

    static async getApplicationById(ctx: Context): Promise<void> {
        const { id } = ctx.params;

        try {
            if (!mongoose.Types.ObjectId.isValid(id)) {
                throw new ApplicationNotFoundError();
            }

            const application: IApplication = await ApplicationService.getApplicationById(id);
            ctx.body = ApplicationSerializer.serialize(await application.hydrate());
        } catch (err) {
            if (err instanceof ApplicationNotFoundError) {
                ctx.throw(404, err.message);
                return;
            }
            throw err;
        }
    }

    static async createApplication(ctx: Context): Promise<void> {
        const newApplicationData: Partial<CreateApplicationsDto> = pick(
            ctx.request.body,
            [
                'name',
                'organization',
                'user'
            ]
        );

        const application: IApplication = await ApplicationService.createApplication(newApplicationData);
        ctx.body = ApplicationSerializer.serialize(await application.hydrate());
    }

    static async updateApplication(ctx: Context): Promise<void> {
        const { id } = ctx.params;

        const newApplicationData: Partial<UpdateApplicationsDto> = pick(
            ctx.request.body,
            [
                'name',
                'organization',
                'user'
            ]
        );

        try {
            const application: IApplication = await ApplicationService.updateApplication(id, newApplicationData, ctx.request.body.regenApiKey);
            ctx.body = ApplicationSerializer.serialize(await application.hydrate());
        } catch (error) {
            if (error instanceof ApplicationNotFoundError) {
                ctx.throw(404, error.message);
            }
        }
    }

    static async deleteApplication(ctx: Context): Promise<void> {
        const { id } = ctx.params;

        try {
            const application: IApplication = await ApplicationService.deleteApplication(id);
            ctx.body = ApplicationSerializer.serialize(application);
        } catch (error) {
            if (error instanceof ApplicationNotFoundError) {
                ctx.throw(404, error.message);
            }
        }
    }
}

applicationRouter.route({
    method: 'get',
    path: '/',
    validate: getApplicationsValidation,

    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore
    pre: Utils.isAdmin, handler: ApplicationRouter.getApplications,
});
applicationRouter.route({
    method: 'get',
    path: '/:id',
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore
    pre: Utils.isAdmin, handler: ApplicationRouter.getApplicationById,
});
applicationRouter.route({
    method: 'post',
    path: '/',
    validate: createApplicationValidation,
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore
    pre: Utils.isAdmin, handler: ApplicationRouter.createApplication,
});
applicationRouter.route({
    method: 'patch',
    path: '/:id',
    validate: updateApplicationValidation,
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore
    pre: Utils.isAdmin, handler: ApplicationRouter.updateApplication,
});
applicationRouter.route({
    method: 'delete',
    path: '/:id',
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore
    pre: Utils.isAdmin, handler: ApplicationRouter.deleteApplication,
});

export default applicationRouter;
