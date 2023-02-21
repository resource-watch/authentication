import config from 'config';
import JWT from 'jsonwebtoken';
import Sinon, { SinonSandbox } from 'sinon';
import { faker } from "@faker-js/faker";
import mongoose, { HydratedDocument } from 'mongoose';
import { OktaUser, IUser, IUserLegacyId } from 'services/okta.interfaces';
import { IDeletion } from 'models/deletion';
import ApplicationModel, { IApplication, IApplicationId } from "models/application";
import OrganizationModel, { IOrganization, IOrganizationId } from "models/organization";
import OrganizationUserModel, { Role } from "models/organization-user";
import OrganizationApplicationModel from "models/organization-application";
import ApplicationUserModel from "models/application-user";
import { expect } from "chai";

export const getUUID: () => string = () => Math.random().toString(36).substring(7);

export const createTokenForUser: (tokenData: Partial<IUser>) => string = (tokenData: Partial<IUser>) => JWT.sign(tokenData, process.env.JWT_SECRET);

export const ensureHasPaginationElements: (response: ChaiHttp.Response) => void = (response: ChaiHttp.Response) => {
    response.body.should.have.property('links').and.be.an('object');

    response.body.links.should.have.property('self').and.be.a('string')
        .and.match(/page\[number]=\d+/)
        .and.match(/page\[size]=\d+/);

    response.body.links.should.have.property('first').and.be.a('string')
        .and.match(/page\[number]=1/)
        .and.match(/page\[size]=\d+/);

    response.body.links.should.have.property('prev').and.be.a('string')
        .and.match(/page\[number]=\d+/)
        .and.match(/page\[size]=\d+/);

    response.body.links.should.have.property('next').and.be.a('string')
        .and.match(/page\[number]=\d+/)
        .and.match(/page\[size]=\d+/);
};

export const ensureHasOktaPaginationElements: (response: ChaiHttp.Response, limit: number, cursor: string) => void = (response, limit, cursor) => {
    response.body.should.have.property('links').and.be.an('object');

    response.body.links.should.have.property('self').and.be.a('string')
        .and.contain(`page[size]=${limit}`)
        .and.contain(`page[before]=${cursor}`);

    response.body.links.should.have.property('first').and.be.a('string')
        .and.contain(`page[size]=${limit}`)
        .and.not.contain(`page[before]=${cursor}`)
        .and.not.contain(`page[after]=${cursor}`);

    response.body.links.should.have.property('next').and.be.a('string')
        .and.contain(`page[size]=${limit}`)
        .and.contain(`page[after]=${cursor}`);
};

export const stubConfigValue: (sandbox: Sinon.SinonSandbox, stubMap: Record<string, any>) => void = (sandbox: SinonSandbox, stubMap: Record<string, any>): void => {
    const stub: any = sandbox.stub(config, 'get');
    Object.keys(stubMap).forEach(key => {
        stub.withArgs(key).returns(stubMap[key]);
    });
    stub.callThrough();
};

export const assertOktaTokenInfo: (response: ChaiHttp.Response, user: OktaUser) => void = (response: ChaiHttp.Response, user: OktaUser) => {
    response.status.should.equal(200);
    response.body.should.have.property('_id').and.equal(user.profile.legacyId);
    response.body.should.have.property('extraUserData').and.be.an('object');
    response.body.extraUserData.should.have.property('apps').and.be.an('array').and.deep.equal(user.profile.apps);
    response.body.should.have.property('email').and.equal(user.profile.email);
    response.body.should.have.property('role').and.equal(user.profile.role);
    response.body.should.have.property('createdAt');
    response.body.should.have.property('updatedAt');
};

export const createDeletion: (anotherData?: Partial<IDeletion>) => Partial<IDeletion> & { requestorUserId: IUserLegacyId; userId: IUserLegacyId; status: string } = (anotherData: Partial<IDeletion> = {}) => {
    const uuid: string = new mongoose.Types.ObjectId().toString();

    return {
        userId: uuid,
        requestorUserId: uuid,
        status: `pending`,
        ...anotherData
    };
};

export const createApplication: (anotherData?: Partial<IApplication>) => Promise<HydratedDocument<IApplication>> = (anotherData: Partial<IApplication> = {}) => {
    return new ApplicationModel({
        name: faker.internet.domainWord(),
        apiKeyId: faker.internet.password(10, false, /[a-zA-Z0-9]/),
        apiKeyValue: faker.datatype.uuid(),
        ...anotherData
    }).save();
};

export const createOrganization: (anotherData?: Partial<IOrganization>) => Promise<HydratedDocument<IOrganization>> = (anotherData: Partial<IOrganization> = {}) => {
    return new OrganizationModel({
        name: new mongoose.Types.ObjectId().toString(),
        ...anotherData
    }).save();
};

export type AssertConnectionArgs = {
    organization?: IOrganization,
    user?: OktaUser
    application?: IApplication
    organizationId?: IOrganizationId,
    applicationId?: IApplicationId,
    userId?: IUserLegacyId,
    role?: Role,
}

export const assertNoConnection: (args: AssertConnectionArgs) => Promise<any[]> = async (args: AssertConnectionArgs) => {
    const returnValue = await getConnection(args);
    expect(returnValue).to.be.a('array').and.length(0);
    return returnValue;
};

export const assertConnection: (args: AssertConnectionArgs) => Promise<any[]> = async (args: AssertConnectionArgs) => {
    const returnValue = await getConnection(args);
    expect(returnValue).to.be.a('array').and.length.gte(1);
    return returnValue;
};

const getConnection: (args: AssertConnectionArgs) => Promise<any[]> = async (args: AssertConnectionArgs) => {
    if (Object.keys(args).length > 3 || Object.keys(args).length === 0) {
        throw new Error('Asserting Organization/Application/User connection require 1 or 2 arguments')
    }

    let applicationId: IApplicationId;
    let organizationId: IOrganizationId;
    let userId: IUserLegacyId;

    if ('application' in args) {
        applicationId = args.application ? args.application._id.toString() : null;
    }
    if ('applicationId' in args) {
        applicationId = args.applicationId;
    }

    if ('organization' in args) {
        organizationId = args.organization ? args.organization._id.toString() : null;
    }
    if ('organizationId' in args) {
        organizationId = args.organizationId;
    }

    if ('user' in args) {
        userId = args.user ? args.user.profile.legacyId : null;
    }
    if ('userId' in args) {
        userId = args.userId;
    }

    let returnValue: any;

    const query: Record<string, any> = {};
    if (typeof organizationId !== "undefined") {
        query.organization = organizationId;
    }
    if (typeof applicationId !== "undefined") {
        query.application = applicationId;
    }
    if (typeof userId !== "undefined") {
        query.userId = userId;
    }

    if (typeof organizationId !== "undefined" && typeof applicationId !== "undefined") {
        returnValue = OrganizationApplicationModel.find(query);
    } else if (typeof organizationId !== "undefined" && typeof userId !== "undefined") {
        if ('role' in args) {
            query.role = args.role;
        }
        returnValue = OrganizationUserModel.find(query);
    } else if (typeof applicationId !== "undefined" && typeof userId !== "undefined") {
        returnValue = ApplicationUserModel.find(query);
    }

    return returnValue;
}
