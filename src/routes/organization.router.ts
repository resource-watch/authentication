import { Context } from 'koa';
import router, { Router } from 'koa-joi-router';
import logger from 'logger';
import { CreateOrganizationsDto, IOrganization } from 'models/organization';
import mongoose from 'mongoose';
import OrganizationSerializer from 'serializers/organization.serializer';
import { PaginateDocument, PaginateOptions, PaginateResult } from 'mongoose';
import OrganizationNotFoundError from 'errors/organizationNotFound.error';
import { pick } from 'lodash';
import Utils from 'utils';
import { IUser } from 'services/okta.interfaces';
import OrganizationService from "services/organization.service";
import { ORGANIZATION_ROLES } from "models/organization-user";

const organizationRouter: Router = router();
organizationRouter.prefix('/api/v1/organization');

const Joi: typeof router.Joi = router.Joi;

const getOrganizationsValidation: Record<string, any> = {
    query: {
        loggedUser: Joi.any().optional(),
        userId: Joi.string().optional(),
        page: Joi.object({
            number: Joi.number().integer().min(1).default(1),
            size: Joi.number().integer().min(1).max(100).default(10),
        }).optional(),
    }
};

const createOrganizationValidation: Record<string, any> = {
    type: 'json',
    query: {
        loggedUser: Joi.any().optional(),
    },
    body: {
        name: Joi.string().required(),
        applications: Joi.array().items(Joi.string()).optional(),
        users: Joi
            .array()
            .items(Joi.object({
                id: Joi.string().required(),
                role: Joi.string().valid(...Object.values(ORGANIZATION_ROLES)).required()
            }))
            .min(1)
            .has(
                Joi.object({
                    id: Joi.string().required(),
                    role: Joi.string().valid(ORGANIZATION_ROLES.ORG_ADMIN).required()
                })
            )
            .required()
            .messages({
                'array.hasUnknown': `"users" must contain a user with role ORG_ADMIN`,
            })
    }
};

const updateOrganizationValidation: Record<string, any> = {
    type: 'json',
    query: {
        loggedUser: Joi.any().optional(),
    },
    params: {
        id: Joi.string().required(),
    },
    body: {
        name: Joi.string().optional(),
        applications: Joi.array().items(Joi.string()).optional(),
        users: Joi
            .array()
            .items(Joi.object({
                id: Joi.string().required(),
                role: Joi.string().valid(...Object.values(ORGANIZATION_ROLES)).required()
            }))
            .min(1)
            .has(
                Joi.object({
                    id: Joi.string().required(),
                    role: Joi.string().valid(ORGANIZATION_ROLES.ORG_ADMIN).required()
                }))
            .optional()
            .messages({
                'array.hasUnknown': `"users" must contain a user with role ORG_ADMIN`,
            })
    }
};

class OrganizationRouter {
    static async getOrganizations(ctx: Context): Promise<void> {
        const loggedUser: IUser = Utils.getUser(ctx);
        logger.info('Getting subscription for user ', loggedUser.id);

        const paginationOptions: PaginateOptions = Utils.getPaginationParameters(ctx);

        const filters: Record<string, any> = pick(ctx.query, []);

        const originalQuery: Record<string, any> = { ...ctx.query };
        delete originalQuery.page;
        const serializedQuery: string = Utils.serializeObjToQuery(originalQuery) ? `?${Utils.serializeObjToQuery(originalQuery)}&` : '?';
        const link: string = `${ctx.request.protocol}://${Utils.getHostForPaginationLink(ctx)}${ctx.request.path}${serializedQuery}`;

        try {
            const organizations: PaginateResult<PaginateDocument<IOrganization, unknown, PaginateOptions>> = await OrganizationService.getOrganizations(filters, paginationOptions);
            ctx.body = OrganizationSerializer.serializeList(organizations, link);
        } catch (err) {
            logger.error(err);
        }
    }

    static async getOrganizationById(ctx: Context): Promise<void> {
        const { id } = ctx.params;

        try {
            if (!mongoose.Types.ObjectId.isValid(id)) {
                throw new OrganizationNotFoundError();
            }

            const organization: IOrganization = await OrganizationService.getOrganizationById(id);
            ctx.body = OrganizationSerializer.serialize(await organization.hydrate());
        } catch (err) {
            if (err instanceof OrganizationNotFoundError) {
                ctx.throw(404, err.message);
                return;
            }
            throw err;
        }
    }

    static async createOrganization(ctx: Context): Promise<void> {
        const newOrganizationData: Partial<CreateOrganizationsDto> = pick(
            ctx.request.body,
            [
                'name',
                'applications',
                'users'
            ]
        );

        const organization: IOrganization = await OrganizationService.createOrganization(newOrganizationData);
        ctx.body = OrganizationSerializer.serialize(await organization.hydrate());
    }

    static async updateOrganization(ctx: Context): Promise<void> {
        const { id } = ctx.params;

        const newOrganizationData: Partial<CreateOrganizationsDto> = pick(
            ctx.request.body,
            [
                'name',
                'applications',
                'users'
            ]
        );

        try {
            const organization: IOrganization = await OrganizationService.updateOrganization(id, newOrganizationData);
            ctx.body = OrganizationSerializer.serialize(await organization.hydrate());
        } catch (error) {
            if (error instanceof OrganizationNotFoundError) {
                ctx.throw(404, error.message);
            } else {
                ctx.throw(500, error.message);
            }
        }
    }

    static async deleteOrganization(ctx: Context): Promise<void> {
        const { id } = ctx.params;

        try {
            const organization: IOrganization = await OrganizationService.deleteOrganization(id);
            ctx.body = OrganizationSerializer.serialize(organization);
        } catch (error) {
            if (error instanceof OrganizationNotFoundError) {
                ctx.throw(404, error.message);
            }
        }
    }
}

organizationRouter.route({
    method: 'get',
    path: '/',
    validate: getOrganizationsValidation,
    pre: Utils.isAdmin,
    handler: OrganizationRouter.getOrganizations,
});
organizationRouter.route({
    method: 'get',
    path: '/:id',
    pre: Utils.isAdmin,
    handler: OrganizationRouter.getOrganizationById,
});
organizationRouter.route({
    method: 'post',
    path: '/',
    validate: createOrganizationValidation,
    pre: Utils.isAdmin,
    handler: OrganizationRouter.createOrganization,
});
organizationRouter.route({
    method: 'patch',
    path: '/:id',
    validate: updateOrganizationValidation,
    pre: Utils.isAdmin,
    handler: OrganizationRouter.updateOrganization,
});
organizationRouter.route({
    method: 'delete',
    path: '/:id',
    pre: Utils.isAdmin,
    handler: OrganizationRouter.deleteOrganization,
});

export default organizationRouter;
