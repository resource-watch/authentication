import { Context, Next } from 'koa';
import router, { Config, Router } from 'koa-joi-router';
import logger from 'logger';
import DeletionService from 'services/deletion.service';
import { DELETION_STATUS, IDeletion } from 'models/deletion';
import mongoose from 'mongoose';
import DeletionSerializer from 'serializers/deletion.serializer';
import { URL } from 'url';
import { PaginateDocument, PaginateOptions, PaginateResult } from 'mongoose';
import DeletionNotFoundError from 'errors/deletionNotFound.error';
import DeletionAlreadyExistsError from '../errors/deletionAlreadyExists.error';
import { pick } from 'lodash';

interface User {
    id: string;
    role: string;
    extraUserData?: Record<string, any>;
}

const deletionRouter: Router = router();
deletionRouter.prefix('/api/v1/deletion');

const Joi: typeof router.Joi = router.Joi;

const getDeletionsConfig: Config = {
    validate: {
        query: {
            loggedUser: Joi.any().optional(),
            userId: Joi.string().optional(),
            requestorUserId: Joi.string().optional(),
            page: Joi.object({
                number: Joi.number().integer().min(1).default(1),
                size: Joi.number().integer().min(1).max(250).default(10),
            }).optional(),
            status: Joi.string().optional().allow(...DELETION_STATUS),
        }
    }
};

const createDeletionConfig: Config = {
    validate: {
        type: 'json',
        query: {
            loggedUser: Joi.any().optional(),
        },
        body: {
            userId: Joi.string().optional(),
            datasetsDeleted: Joi.boolean().optional().default(false),
            layersDeleted: Joi.boolean().optional().default(false),
            widgetsDeleted: Joi.boolean().optional().default(false),
            userAccountDeleted: Joi.boolean().optional().default(false),
            userDataDeleted: Joi.boolean().optional().default(false),
            graphDataDeleted: Joi.boolean().optional().default(false),
            collectionsDeleted: Joi.boolean().optional().default(false),
            favouritesDeleted: Joi.boolean().optional().default(false),
            vocabulariesDeleted: Joi.boolean().optional().default(false),
            areasDeleted: Joi.boolean().optional().default(false),
            storiesDeleted: Joi.boolean().optional().default(false),
            subscriptionsDeleted: Joi.boolean().optional().default(false),
            dashboardsDeleted: Joi.boolean().optional().default(false),
            profilesDeleted: Joi.boolean().optional().default(false),
            topicsDeleted: Joi.boolean().optional().default(false),
        }
    }
};

const updateDeletionConfig: Config = {
    validate: {
        type: 'json',
        query: {
            loggedUser: Joi.any().optional(),
        },
        params: {
            id: Joi.string().required(),
        },
        body: {
            status: Joi.string().optional().allow(...DELETION_STATUS),
            datasetsDeleted: Joi.boolean().optional(),
            layersDeleted: Joi.boolean().optional(),
            widgetsDeleted: Joi.boolean().optional(),
            userAccountDeleted: Joi.boolean().optional(),
            userDataDeleted: Joi.boolean().optional(),
            graphDataDeleted: Joi.boolean().optional(),
            collectionsDeleted: Joi.boolean().optional(),
            favouritesDeleted: Joi.boolean().optional(),
            vocabulariesDeleted: Joi.boolean().optional(),
            areasDeleted: Joi.boolean().optional(),
            storiesDeleted: Joi.boolean().optional(),
            subscriptionsDeleted: Joi.boolean().optional(),
            dashboardsDeleted: Joi.boolean().optional(),
            profilesDeleted: Joi.boolean().optional(),
            topicsDeleted: Joi.boolean().optional(),
        }
    }
};

const serializeObjToQuery: (obj: Record<string, any>) => string = (obj: Record<string, any>) => Object.keys(obj).reduce((a, k) => {
    a.push(`${k}=${encodeURIComponent(obj[k])}`);
    return a;
}, []).join('&');

const getHostForPaginationLink: (ctx: Context) => (string | string[]) = (ctx: Context) => {
    if ('x-rw-domain' in ctx.request.header) {
        return ctx.request.header['x-rw-domain'];
    }
    if ('referer' in ctx.request.header) {
        const url: URL = new URL(ctx.request.header.referer);
        return url.host;
    }
    return ctx.request.host;
};

const getUser: (ctx: Context) => User = (ctx: Context): User => {
    // @ts-ignore
    return ctx.req.user || ctx.state.user || ctx.state.microservice;
};

class DeletionRouter {
    static async getDeletions(ctx: Context): Promise<void> {
        const loggedUser: User = getUser(ctx);
        logger.info('Getting subscription for user ', loggedUser.id);

        let page: number = 1;
        let limit: number = 10;

        if (ctx.query.page) {
            // tslint:disable-next-line:variable-name
            const { number, size } = (ctx.query.page as Record<string, any>);
            page = ctx.query.page && number ? parseInt(number, 10) : 1;
            limit = ctx.query.page && size ? parseInt(size, 10) : 10;
            if (limit > 100) {
                ctx.throw(400, 'Invalid page size (>100).');
            }
        }

        const paginationOptions: PaginateOptions = {
            page,
            limit
        };

        const filters: Record<string, any> = pick(ctx.query, ['userId', 'requestorUserId', 'status']);

        const originalQuery: Record<string, any> = { ...ctx.query };
        delete originalQuery.page;
        const serializedQuery: string = serializeObjToQuery(originalQuery) ? `?${serializeObjToQuery(originalQuery)}&` : '?';
        const link: string = `${ctx.request.protocol}://${getHostForPaginationLink(ctx)}${ctx.request.path}${serializedQuery}`;

        try {
            const deletions: PaginateResult<PaginateDocument<IDeletion, {}, PaginateOptions>> = await DeletionService.getDeletions(filters, paginationOptions);
            ctx.body = DeletionSerializer.serializeList(deletions, link);
        } catch (err) {
            logger.error(err);
        }
    }

    static async getDeletionById(ctx: Context): Promise<void> {
        const { id } = ctx.params;

        try {
            if (!mongoose.Types.ObjectId.isValid(id)) {
                throw new DeletionNotFoundError();
            }

            const deletion: IDeletion = await DeletionService.getDeletionById(id);
            ctx.body = DeletionSerializer.serialize(deletion);
        } catch (err) {
            if (err instanceof DeletionNotFoundError) {
                ctx.throw(404, err.message);
                return;
            }
            throw err;
        }
    }

    static async createDeletion(ctx: Context): Promise<void> {
        const requestorUser: User = getUser(ctx);
        const newDeletionData: Partial<IDeletion> = pick(
            ctx.request.body,
            [
                'userId',
                'datasetsDeleted',
                'layersDeleted',
                'widgetsDeleted',
                'userAccountDeleted',
                'userDataDeleted',
                'graphDataDeleted',
                'collectionsDeleted',
                'favouritesDeleted',
                'vocabulariesDeleted',
                'areasDeleted',
                'storiesDeleted',
                'subscriptionsDeleted',
                'dashboardsDeleted',
                'profilesDeleted',
                'topicsDeleted',
            ]
        );

        newDeletionData.requestorUserId = requestorUser.id;
        if (!newDeletionData.userId) {
            newDeletionData.userId = requestorUser.id;
        }

        try {
            await DeletionService.getDeletionByUserId(newDeletionData.userId);
            throw new DeletionAlreadyExistsError();
        } catch (error) {
            if (!(error instanceof DeletionNotFoundError)) {
                throw error;
            }
        }

        const deletion: IDeletion = await DeletionService.createDeletion(newDeletionData);
        ctx.body = DeletionSerializer.serialize(deletion);
    }

    static async updateDeletion(ctx: Context): Promise<void> {
        const { id } = ctx.params;

        const newDeletionData: Partial<IDeletion> = pick(
            ctx.request.body,
            [
                'status',
                'datasetsDeleted',
                'layersDeleted',
                'widgetsDeleted',
                'userAccountDeleted',
                'userDataDeleted',
                'graphDataDeleted',
                'collectionsDeleted',
                'favouritesDeleted',
                'vocabulariesDeleted',
                'areasDeleted',
                'storiesDeleted',
                'subscriptionsDeleted',
                'dashboardsDeleted',
                'profilesDeleted',
                'topicsDeleted',
            ]
        );

        try {
            const deletion: IDeletion = await DeletionService.updateDeletion(id, newDeletionData);
            ctx.body = DeletionSerializer.serialize(deletion);
        } catch (error) {
            if (error instanceof DeletionNotFoundError) {
                ctx.throw(404, error.message);
            }
        }
    }

    static async deleteDeletion(ctx: Context): Promise<void> {
        const { id } = ctx.params;

        try {
            const deletion: IDeletion = await DeletionService.deleteDeletion(id);
            ctx.body = DeletionSerializer.serialize(deletion);
        } catch (error) {
            if (error instanceof DeletionNotFoundError) {
                ctx.throw(404, error.message);
            }
        }
    }
}


const isAdmin: (ctx: Context, next: Next) => Promise<any> = async (ctx: Context, next: Next): Promise<any> => {
    const loggedUser: User = getUser(ctx);

    if (!loggedUser || Object.keys(loggedUser).length === 0) {
        ctx.throw(401, 'Unauthorized');
        return;
    }
    if (loggedUser.role !== 'ADMIN') {
        ctx.throw(403, 'Not authorized');
        return;
    }
    await next();
};


deletionRouter.get('/', getDeletionsConfig, isAdmin, DeletionRouter.getDeletions);
deletionRouter.get('/:id', isAdmin, DeletionRouter.getDeletionById);
deletionRouter.post('/', createDeletionConfig, isAdmin, DeletionRouter.createDeletion);
deletionRouter.patch('/:id', updateDeletionConfig, isAdmin, DeletionRouter.updateDeletion);
deletionRouter.delete('/:id', isAdmin, DeletionRouter.deleteDeletion);

export default deletionRouter;
