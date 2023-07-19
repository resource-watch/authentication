import { Context } from 'koa';
import router, { Config, Router } from 'koa-joi-router';
import logger from 'logger';
import DeletionService from 'services/deletion.service';
import { DELETION_STATUS, IDeletion } from 'models/deletion';
import mongoose from 'mongoose';
import DeletionSerializer from 'serializers/deletion.serializer';
import { PaginateDocument, PaginateOptions, PaginateResult } from 'mongoose';
import DeletionNotFoundError from 'errors/deletionNotFound.error';
import DeletionAlreadyExistsError from 'errors/deletionAlreadyExists.error';
import { pick } from 'lodash';
import Utils from 'utils';
import { IUser } from 'services/okta.interfaces';

const deletionRouter: Router = router();
deletionRouter.prefix('/deletion');

const Joi: typeof router.Joi = router.Joi;

const getDeletionsConfig: Config = {
    validate: {
        query: {
            loggedUser: Joi.any().optional(),
            userId: Joi.string().optional(),
            requestorUserId: Joi.string().optional(),
            page: Joi.object({
                number: Joi.number().integer().min(1).default(1),
                size: Joi.number().integer().min(1).max(100).default(10),
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
            loggedUser: Joi.any().optional(),
            userId: Joi.string().optional(),
            datasetsDeleted: Joi.boolean().optional().default(false),
            layersDeleted: Joi.boolean().optional().default(false),
            widgetsDeleted: Joi.boolean().optional().default(false),
            userAccountDeleted: Joi.boolean().optional().default(false),
            userDataDeleted: Joi.boolean().optional().default(false),
            collectionsDeleted: Joi.boolean().optional().default(false),
            favouritesDeleted: Joi.boolean().optional().default(false),
            areasDeleted: Joi.boolean().optional().default(false),
            applicationsDeleted: Joi.boolean().optional().default(false),
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
            loggedUser: Joi.any().optional(),
            status: Joi.string().optional().allow(...DELETION_STATUS),
            datasetsDeleted: Joi.boolean().optional(),
            layersDeleted: Joi.boolean().optional(),
            widgetsDeleted: Joi.boolean().optional(),
            userAccountDeleted: Joi.boolean().optional(),
            userDataDeleted: Joi.boolean().optional(),
            collectionsDeleted: Joi.boolean().optional(),
            favouritesDeleted: Joi.boolean().optional(),
            areasDeleted: Joi.boolean().optional(),
            applicationsDeleted: Joi.boolean().optional(),
            storiesDeleted: Joi.boolean().optional(),
            subscriptionsDeleted: Joi.boolean().optional(),
            dashboardsDeleted: Joi.boolean().optional(),
            profilesDeleted: Joi.boolean().optional(),
            topicsDeleted: Joi.boolean().optional(),
        }
    }
};

class DeletionRouter {
    static async getDeletions(ctx: Context): Promise<void> {
        const loggedUser: IUser = Utils.getUser(ctx);
        logger.info('Getting subscription for user ', loggedUser.id);

        const paginationOptions: PaginateOptions = Utils.getPaginationParameters(ctx);

        const filters: Record<string, any> = pick(ctx.query, ['userId', 'requestorUserId', 'status']);

        const originalQuery: Record<string, any> = { ...ctx.query };
        delete originalQuery.page;
        delete originalQuery.loggedUser;
        const serializedQuery: string = Utils.serializeObjToQuery(originalQuery) ? `?${Utils.serializeObjToQuery(originalQuery)}&` : '?';
        const apiVersion: string = ctx.mountPath.split('/')[ctx.mountPath.split('/').length - 1];
        const link: string = `${ctx.request.protocol}://${Utils.getHostForPaginationLink(ctx)}/${apiVersion}${ctx.request.path}${serializedQuery}`;

        try {
            const deletions: PaginateResult<PaginateDocument<IDeletion, unknown, PaginateOptions>> = await DeletionService.getDeletions(filters, paginationOptions);
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
        const requestorUser: IUser = Utils.getUser(ctx);
        const newDeletionData: Partial<IDeletion> = pick(
            ctx.request.body,
            [
                'userId',
                'datasetsDeleted',
                'layersDeleted',
                'widgetsDeleted',
                'userAccountDeleted',
                'userDataDeleted',
                'collectionsDeleted',
                'favouritesDeleted',
                'areasDeleted',
                'applicationsDeleted',
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
                'collectionsDeleted',
                'favouritesDeleted',
                'areasDeleted',
                'applicationsDeleted',
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

// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore
deletionRouter.get('/', getDeletionsConfig, Utils.isAdmin, DeletionRouter.getDeletions);

// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore
deletionRouter.get('/:id', Utils.isAdmin, DeletionRouter.getDeletionById);

// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore
deletionRouter.post('/', createDeletionConfig, Utils.isAdmin, DeletionRouter.createDeletion);

// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore
deletionRouter.patch('/:id', updateDeletionConfig, Utils.isAdmin, DeletionRouter.updateDeletion);

// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore
deletionRouter.delete('/:id', Utils.isAdmin, DeletionRouter.deleteDeletion);

export default deletionRouter;
