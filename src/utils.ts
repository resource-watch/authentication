import { Context, Next } from 'koa';
import logger from 'logger';
import Settings from 'services/settings.service';
import { IUser, IUserLegacyId } from 'services/okta.interfaces';
import { URL } from 'url';
import mongoose, { PaginateOptions, PipelineStage } from 'mongoose';
import { IOrganizationId } from "models/organization";
import OrganizationUserModel, { IOrganizationUser, ORGANIZATION_ROLES, Role } from "models/organization-user";
import { IApplicationId } from "models/application";
import ApplicationUserModel, { IApplicationUser } from "models/application-user";
import OrganizationApplicationModel, { IOrganizationApplication } from "models/organization-application";

export default class Utils {

    static getPaginationParameters(ctx: Context): PaginateOptions {
        let page: number = 1;
        let limit: number = 10;

        if (ctx.query.page) {
            // tslint:disable-next-line:variable-name
            const { number, size } = (ctx.query.page as Record<string, any>);
            page = number ? parseInt(number, 10) : 1;
            limit = size ? parseInt(size, 10) : 10;
        }

        return {
            page,
            limit
        };
    }

    static getUser(ctx: Context): IUser {
        // eslint-disable-next-line @typescript-eslint/ban-ts-comment
        // @ts-ignore
        return ctx.req.user || ctx.state.user || ctx.state.microservice;
    }

    static async isLogged(ctx: Context, next: Next): Promise<void> {
        logger.debug('Checking if user is logged');
        if (Utils.getUser(ctx)) {
            await next();
        } else {
            logger.debug('Not logged');
            ctx.throw(401, 'Not authenticated');
        }
    }

    static async isAdmin(ctx: Context, next: Next): Promise<void> {
        logger.info('Checking if user is admin');
        const user: IUser = Utils.getUser(ctx);
        if (!user) {
            logger.info('Not authenticated');
            ctx.throw(401, 'Not authenticated');
            return;
        }
        if (user.role === 'ADMIN') {
            logger.info('User is admin');
            await next();
        } else {
            logger.info('Not admin');
            ctx.throw(403, 'Not authorized');
        }
    }

    static async isAdminOrAppOwner(ctx: Context, next: Next): Promise<void> {
        logger.info('Checking if user is admin or owns the application');
        const user: IUser = Utils.getUser(ctx);
        if (!user) {
            logger.info('Not authenticated');
            ctx.throw(401, 'Not authenticated');
            return;
        }
        if (user.role === 'ADMIN') {
            logger.info('User is admin');
            await next();
            return;
        }

        const applicationId: IApplicationId = ctx.params.id;
        const applicationUserQuery: {
            application: IApplicationId;
            userId: IUserLegacyId,
        } = {
            application: applicationId,
            userId: user.id,
        }
        const applicationUser: IApplicationUser = await ApplicationUserModel.findOne(applicationUserQuery);
        if (applicationUser) {
            logger.info('User owns the application');
            await next();
            return;
        }

        const aggregateCriteria: PipelineStage[] = [
            { $match: { userId: user.id, role: ORGANIZATION_ROLES.ORG_ADMIN } },
            {
                $lookup: {
                    from: "organizationapplications",
                    localField: "organization",
                    foreignField: "organization",
                    as: "organizationapplications"
                }
            },
            { $unwind: "$organizationapplications" },
            {
                $match: {
                    "organizationapplications.application": new mongoose.Types.ObjectId(applicationId as string)
                }
            }
        ];

        const aggregate: Array<IOrganizationUser> = await OrganizationUserModel.aggregate(aggregateCriteria).exec();

        if (aggregate.length > 0) {
            logger.info('User owns the application through the organization');
            await next();
        } else {
            logger.info('Does not own the application');
            ctx.throw(403, 'Not authorized');
        }
    }

    static async isAdminOrManagerOrAppReader(ctx: Context, next: Next): Promise<void> {
        logger.info('Checking if user is admin or owns the application');
        const user: IUser = Utils.getUser(ctx);
        if (!user) {
            logger.info('Not authenticated');
            ctx.throw(401, 'Not authenticated');
            return;
        }
        if (user.role === 'ADMIN') {
            logger.info('User is admin');
            await next();
            return;
        }
        if (user.role === 'MANAGER') {
            logger.info('User is manager');
            await next();
            return;
        }

        const applicationId: IApplicationId = ctx.params.id;
        const applicationUserQuery: {
            application: IApplicationId;
            userId: IUserLegacyId,
        } = {
            application: applicationId,
            userId: user.id,
        }
        const applicationUser: IApplicationUser = await ApplicationUserModel.findOne(applicationUserQuery);
        if (applicationUser) {
            logger.info('User owns the application');
            await next();
            return;
        }

        const aggregateCriteria: PipelineStage[] = [
            { $match: { userId: user.id } },
            {
                $lookup: {
                    from: "organizationapplications",
                    localField: "organization",
                    foreignField: "organization",
                    as: "organizationapplications"
                }
            },
            { $unwind: "$organizationapplications" },
            {
                $match: {
                    "organizationapplications.application": new mongoose.Types.ObjectId(applicationId as string)
                }
            }
        ];

        const aggregate: Array<IOrganizationUser> = await OrganizationUserModel.aggregate(aggregateCriteria).exec();

        if (aggregate.length > 0) {
            logger.info('User has read access to the application through the organization');
            await next();
        } else {
            logger.info('Does not have read access to the application');
            ctx.throw(403, 'Not authorized');
        }
    }

    static async organizationHasNoApplications(ctx: Context, next: Next): Promise<void> {
        logger.info('Checking if the organization has no applications');
        const organizationId: IOrganizationId = ctx.params.id;
        const organizationApplicationQuery: {
            organization: IOrganizationId;
        } = {
            organization: organizationId,
        }
        const organizationApplications: IOrganizationApplication[] = await OrganizationApplicationModel.find(organizationApplicationQuery);
        if (organizationApplications.length > 0) {
            logger.info('Organization has applications');
            ctx.throw(400, 'Organizations with associated applications cannot be deleted');
        } else {
            await next();
            return;
        }
    }

    static async isAdminOrOrgAdmin(ctx: Context, next: Next): Promise<void> {
        logger.info('Checking if user is admin or organization admin');
        const user: IUser = Utils.getUser(ctx);
        if (!user) {
            logger.info('Not authenticated');
            ctx.throw(401, 'Not authenticated');
            return;
        }
        if (user.role === 'ADMIN') {
            logger.info('User is admin');
            await next();
            return;
        }

        const organizationId: IOrganizationId = ctx.params.id;
        const query: {
            role: "ORG_MEMBER" | "ORG_ADMIN";
            organization: IOrganizationId;
            userId: IUserLegacyId
        } = {
            role: ORGANIZATION_ROLES.ORG_ADMIN,
            organization: organizationId,
            userId: user.id
        }
        const organizationUser: IOrganizationUser = await OrganizationUserModel.findOne(query);
        if (organizationUser) {
            logger.info('User is org admin');
            await next();
        } else {
            logger.info('Not org admin');
            ctx.throw(403, 'Not authorized');
        }
    }

    static async isAdminOrManagerOrOrgAdmin(ctx: Context, next: Next): Promise<void> {
        logger.info('Checking if user is admin or is organization admin');
        const user: IUser = Utils.getUser(ctx);
        if (!user) {
            logger.info('Not authenticated');
            ctx.throw(401, 'Not authenticated');
            return;
        }
        if (user.role === 'ADMIN') {
            logger.info('User is admin');
            await next();
            return;
        }
        if (user.role === 'MANAGER') {
            logger.info('User is manager');
            await next();
            return;
        }

        const organizationId: IOrganizationId = ctx.params.id;
        const query: {
            organization: IOrganizationId;
            user: IUserLegacyId,
            role: Role
        } = {
            organization: organizationId,
            user: user.id,
            role: ORGANIZATION_ROLES.ORG_ADMIN
        }
        const organizationUser: IOrganizationUser = await OrganizationUserModel.findOne(query);
        if (organizationUser) {
            logger.info('User belongs to organization');
            await next();
        } else {
            logger.info('Does not belong to organization');
            ctx.throw(403, 'Not authorized');
        }
    }

    static async isAdminOrManagerOrOrgMember(ctx: Context, next: Next): Promise<void> {
        logger.info('Checking if user is admin or belongs to organization');
        const user: IUser = Utils.getUser(ctx);
        if (!user) {
            logger.info('Not authenticated');
            ctx.throw(401, 'Not authenticated');
            return;
        }
        if (user.role === 'ADMIN') {
            logger.info('User is admin');
            await next();
            return;
        }
        if (user.role === 'MANAGER') {
            logger.info('User is manager');
            await next();
            return;
        }

        const organizationId: IOrganizationId = ctx.params.id;
        const query: {
            organization: IOrganizationId;
            userId: IUserLegacyId,
        } = {
            organization: organizationId,
            userId: user.id,
        }
        const organizationUser: IOrganizationUser = await OrganizationUserModel.findOne(query);
        if (organizationUser) {
            logger.info('User belongs to organization');
            await next();
        } else {
            logger.info('Does not belong to organization');
            ctx.throw(403, 'Not authorized');
        }
    }

    static async isNotOrgAdmin(ctx: Context, next: Next): Promise<void> {
        logger.info('Checking if user is not ORG_ADMIN');
        const user: IUser = Utils.getUser(ctx);
        if (!user) {
            logger.info('Not authenticated');
            ctx.throw(401, 'Not authenticated');
            return;
        }

        const query: {
            role: Role;
            userId: IUserLegacyId,
        } = {
            role: ORGANIZATION_ROLES.ORG_ADMIN,
            userId: user.id,
        }
        const organizationUser: IOrganizationUser = await OrganizationUserModel.findOne(query);
        if (organizationUser) {
            logger.info('User is admin of an organization');
            ctx.throw(400, 'Cannot delete user that is admin of an organization');
        } else {
            logger.info('Does not admin an organization');
            await next();
        }
    }

    static async isAdminOrManager(ctx: Context, next: Next): Promise<void> {
        logger.info('Checking if user is admin or manager');
        const user: IUser = Utils.getUser(ctx);
        if (!user) {
            logger.info('Not authenticated');
            ctx.throw(401, 'Not authenticated');
            return;
        }
        if (user.role === 'ADMIN' || user.role === 'MANAGER') {
            await next();
        } else {
            logger.info('Not admin');
            ctx.throw(403, 'Not authorized');
        }
    }

    static async isAdminOrMicroserviceOrSameUserToDelete(ctx: Context, next: Next): Promise<void> {
        logger.info('Checking if user is admin or same user to delete');
        const user: IUser = Utils.getUser(ctx);
        const userIdToDelete: string = ctx.params.id;
        if (!user) {
            logger.info('Not authenticated');
            ctx.throw(401, 'Not authenticated');
            return;
        }
        if (user.role === 'ADMIN' || user.id === 'microservice' || user.id === userIdToDelete) {
            await next();
        } else {
            logger.info('Not admin nor same user to be deleted');
            ctx.throw(403, 'Not authorized');
        }
    }

    static async isMicroservice(ctx: Context, next: Next): Promise<void> {
        logger.info('Checking if user is a microservice');
        const user: IUser = Utils.getUser(ctx);
        if (!user) {
            logger.info('Not authenticated');
            ctx.throw(401, 'Not authenticated');
            return;
        }
        if (user.id === 'microservice') {
            await next();
        } else {
            logger.info('Not admin');
            ctx.throw(403, 'Not authorized');
        }
    }

    static async isAdminOrMicroservice(ctx: Context, next: Next): Promise<void> {
        logger.info('Checking if user is a microservice');
        const user: IUser = Utils.getUser(ctx);
        if (!user) {
            logger.info('Not authenticated');
            ctx.throw(401, 'Not authenticated');
            return;
        }
        if (user.role === 'ADMIN' || user.id === 'microservice') {
            await next();
        } else {
            logger.info('Not admin nor microservice');
            ctx.throw(403, 'Not authorized');
        }
    }

    static getOriginApp(ctx: Context): string {
        if (ctx.query.origin) {
            return ctx.query.origin as string;
        }

        if (ctx.session?.originApplication) {
            return ctx.session.originApplication;
        }

        return Settings.getSettings().defaultApp;
    }

    static serializeObjToQuery(obj: Record<string, any>): string {
        return Object.keys(obj).reduce((a: any[], k: string) => {
            a.push(`${k}=${encodeURIComponent(obj[k])}`);
            return a;
        }, []).join('&');
    }

    static getHostForPaginationLink(ctx: Context): string {
        if ('x-rw-domain' in ctx.request.header) {
            return ctx.request.header['x-rw-domain'] as string;
        }

        if ('referer' in ctx.request.header) {
            const url: URL = new URL(ctx.request.header.referer);
            return url.host;
        }
        return ctx.request.host;
    }
}
