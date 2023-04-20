import { Context } from 'koa';
import router, { Router } from 'koa-joi-router';
import logger from 'logger';
import ApplicationService from 'services/application.service';
import { CreateApplicationsDto, IApplication, UpdateApplicationsDto } from 'models/application';
import mongoose, { AggregatePaginateResult } from 'mongoose';
import ApplicationSerializer from 'serializers/application.serializer';
import { PaginateDocument, PaginateOptions, PaginateResult } from 'mongoose';
import ApplicationNotFoundError from 'errors/applicationNotFound.error';
import { pick } from 'lodash';
import Utils from 'utils';
import { IUser, IUserLegacyId } from 'services/okta.interfaces';
import PermissionError from "errors/permission.error";

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
    }).oxor('user', 'organization')
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
        const userIdFilter: IUserLegacyId = (loggedUser.role !== 'ADMIN' && loggedUser.role !== 'MANAGER') ? loggedUser.id : null;

        const originalQuery: Record<string, any> = { ...ctx.query };
        delete originalQuery.page;
        const serializedQuery: string = Utils.serializeObjToQuery(originalQuery) ? `?${Utils.serializeObjToQuery(originalQuery)}&` : '?';
        const link: string = `${ctx.request.protocol}://${Utils.getHostForPaginationLink(ctx)}${ctx.request.path}${serializedQuery}`;

        try {
            const applications: AggregatePaginateResult<IApplication> = await ApplicationService.getPaginatedApplications(filters, paginationOptions, userIdFilter)
            ctx.body = ApplicationSerializer.serializeList(applications, link);
        } catch (err) {
            logger.error(err);
        }
    }

    static async getApplicationById(ctx: Context): Promise<void> {
        const { id } = ctx.params;
        const loggedUser: IUser = Utils.getUser(ctx);

        try {
            if (!mongoose.Types.ObjectId.isValid(id)) {
                throw new ApplicationNotFoundError();
            }

            let loggedUserFilter: IUser = null;
            if (loggedUser.role !== 'ADMIN' && loggedUser.role !== 'MANAGER') {
                loggedUserFilter = loggedUser;
            }

            ctx.body = ApplicationSerializer.serialize(await ApplicationService.getApplicationById(id, loggedUserFilter));
        } catch (error) {
            if (error instanceof ApplicationNotFoundError) {
                ctx.throw(404, error.message);
                return;
            }
            if (error instanceof PermissionError) {
                ctx.throw(403, error.message);
                return;
            }
            ctx.throw(500, error.message);        }
    }

    static async createApplication(ctx: Context): Promise<void> {
        const loggedUser: IUser = Utils.getUser(ctx);

        const newApplicationData: Partial<CreateApplicationsDto> = pick(
            ctx.request.body,
            [
                'name',
                'organization',
                'user'
            ]
        );

        try {
            const application: IApplication = await ApplicationService.createApplication(newApplicationData, loggedUser);
            ctx.body = ApplicationSerializer.serialize(await application.hydrate());
        } catch (error) {
            if (error instanceof PermissionError) {
                ctx.throw(403, error.message);
                return;
            }
            ctx.throw(500, error.message);
        }
    }

    static async updateApplication(ctx: Context): Promise<void> {
        const { id } = ctx.params;
        const loggedUser: IUser = Utils.getUser(ctx);

        const newApplicationData: Partial<UpdateApplicationsDto> = pick(
            ctx.request.body,
            [
                'name',
                'organization',
                'user'
            ]
        );

        try {
            const application: IApplication = await ApplicationService.updateApplication(id, newApplicationData, loggedUser, ctx.request.body.regenApiKey);
            ctx.body = ApplicationSerializer.serialize(await application.hydrate());
        } catch (error) {
            if (error instanceof ApplicationNotFoundError) {
                ctx.throw(404, error.message);
                return;
            }
            if (error instanceof PermissionError) {
                ctx.throw(403, error.message);
                return;
            }
            ctx.throw(500, error.message);
        }
    }

    static async deleteApplication(ctx: Context): Promise<void> {
        const { id } = ctx.params;
        const loggedUser: IUser = Utils.getUser(ctx);

        try {
            const application: IApplication = await ApplicationService.deleteApplication(id, loggedUser);
            ctx.body = ApplicationSerializer.serialize(application);
        } catch (error) {
            if (error instanceof ApplicationNotFoundError) {
                ctx.throw(404, error.message);
            }
            if (error instanceof PermissionError) {
                ctx.throw(403, error.message);
                return;
            }
            ctx.throw(500, error.message);
        }
    }
}

applicationRouter.route({
    method: 'get',
    path: '/',
    validate: getApplicationsValidation,

    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore
    pre: Utils.isLogged, handler: ApplicationRouter.getApplications,
});
applicationRouter.route({
    method: 'get',
    path: '/:id',
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore
    pre: Utils.isLogged, handler: ApplicationRouter.getApplicationById,
});
applicationRouter.route({
    method: 'post',
    path: '/',
    validate: createApplicationValidation,
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore
    pre: Utils.isLogged, handler: ApplicationRouter.createApplication,
});
applicationRouter.route({
    method: 'patch',
    path: '/:id',
    validate: updateApplicationValidation,
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore
    pre: Utils.isLogged, handler: ApplicationRouter.updateApplication,
});
applicationRouter.route({
    method: 'delete',
    path: '/:id',
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore
    pre: Utils.isLogged, handler: ApplicationRouter.deleteApplication,
});

export default applicationRouter;
