import { Context } from 'koa';
import router, { Router } from 'koa-joi-router';
import logger from 'logger';
import { CreateOrganizationsDto, IOrganization } from 'models/organization';
import mongoose, { AggregatePaginateResult } from 'mongoose';
import OrganizationSerializer from 'serializers/organization.serializer';
import { PaginateOptions } from 'mongoose';
import OrganizationNotFoundError from 'errors/organizationNotFound.error';
import { pick } from 'lodash';
import Utils from 'utils';
import { IUser, IUserLegacyId } from 'services/okta.interfaces';
import OrganizationService from "services/organization.service";
import { ORGANIZATION_ROLES } from "models/organization-user";
import PermissionError from "errors/permission.error";

const organizationRouter: Router = router();
organizationRouter.prefix('/organization');

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
            .unique((a: any, b: any) => a.role === ORGANIZATION_ROLES.ORG_ADMIN && b.role === ORGANIZATION_ROLES.ORG_ADMIN)
            .required()
            .messages({
                'array.hasUnknown': `"users" must contain a user with role ORG_ADMIN`,
                'array.unique': `"users" must contain single a user with role ORG_ADMIN`,
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
            .unique((a: any, b: any) => a.role === ORGANIZATION_ROLES.ORG_ADMIN && b.role === ORGANIZATION_ROLES.ORG_ADMIN)
            .optional()
            .messages({
                'array.hasUnknown': `"users" must contain a user with role ORG_ADMIN`,
                'array.unique': `"users" must contain single a user with role ORG_ADMIN`,
            })
    }
};

class OrganizationRouter {
    static async getOrganizations(ctx: Context): Promise<void> {
        const loggedUser: IUser = Utils.getUser(ctx);
        logger.info('Getting subscription for user ', loggedUser.id);

        const paginationOptions: PaginateOptions = Utils.getPaginationParameters(ctx);

        const filters: Record<string, any> = pick(ctx.query, []);
        const userIdFilter: IUserLegacyId = (loggedUser.role !== 'ADMIN' && loggedUser.role !== 'MANAGER') ? loggedUser.id : null;

        const originalQuery: Record<string, any> = { ...ctx.query };
        delete originalQuery.page;
        const serializedQuery: string = Utils.serializeObjToQuery(originalQuery) ? `?${Utils.serializeObjToQuery(originalQuery)}&` : '?';
        const apiVersion: string = ctx.mountPath.split('/')[ctx.mountPath.split('/').length - 1];
        const link: string = `${ctx.request.protocol}://${Utils.getHostForPaginationLink(ctx)}/${apiVersion}${ctx.request.path}${serializedQuery}`;

        try {
            const organizations: AggregatePaginateResult<IOrganization> = await OrganizationService.getPaginatedOrganizations(filters, paginationOptions, userIdFilter);
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
        const loggedUser: IUser = Utils.getUser(ctx);

        const newOrganizationData: Partial<CreateOrganizationsDto> = pick(
            ctx.request.body,
            [
                'name',
                'applications',
                'users'
            ]
        );

        try {
            const organization: IOrganization = await OrganizationService.updateOrganization(id, newOrganizationData, loggedUser);
            ctx.body = OrganizationSerializer.serialize(await organization.hydrate());
        } catch (error) {
            if (error instanceof OrganizationNotFoundError) {
                ctx.throw(404, error.message);
                return;
            }

            if (error instanceof PermissionError) {
                ctx.throw(403, 'Not authorized');
                return;
            }
            ctx.throw(500, error.message);
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
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore
    pre: Utils.isLogged, handler: OrganizationRouter.getOrganizations,
});
organizationRouter.route({
    method: 'get',
    path: '/:id',
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore
    pre: Utils.isAdminOrManagerOrOrgMember, handler: OrganizationRouter.getOrganizationById,
});
organizationRouter.route({
    method: 'post',
    path: '/',
    validate: createOrganizationValidation,
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore
    pre: Utils.isAdmin, handler: OrganizationRouter.createOrganization,
});

organizationRouter.route({
    method: 'patch',
    path: '/:id',
    validate: updateOrganizationValidation,
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore
    pre: Utils.isAdminOrOrgAdmin, handler: OrganizationRouter.updateOrganization,
});
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore
organizationRouter.route({
    method: 'delete',
    path: '/:id',
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore
    pre: [Utils.isAdmin, Utils.organizationHasNoApplications], handler: OrganizationRouter.deleteOrganization,
});

export default organizationRouter;
