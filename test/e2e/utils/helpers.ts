import config from 'config';
import JWT from 'jsonwebtoken';
import mongoose from 'mongoose';
import Sinon, { SinonSandbox } from 'sinon';

import UserModel, { UserDocument } from 'models/user.model';
import TempUserModel, { IUserTemp } from 'models/user-temp.model';
import { OktaUser } from 'services/okta.interfaces';

const { ObjectId } = mongoose.Types;

export const getUUID: () => string = () => Math.random().toString(36).substring(7);

export const createUser: (userData?: Partial<UserDocument>) => Partial<UserDocument> = (userData: Partial<UserDocument> = {}) => ({
    _id: new ObjectId(),
    name: `${getUUID()} name`,
    email: `${getUUID()}@authorization.com`,
    password: '$password.hash',
    salt: '$password.salt',
    extraUserData: {
        apps: ['rw']
    },
    role: 'USER',
    provider: 'local',
    userToken: 'myUserToken',
    photo: `http://photo.com/${getUUID()}.jpg`,
    ...userData
});

export const createTokenForUser: (tokenData: Partial<UserDocument>) => string = (tokenData: Partial<UserDocument>) => JWT.sign(tokenData, process.env.JWT_SECRET);

export const createUserInDB: (userData: Partial<UserDocument>) => Promise<Partial<UserDocument>> = async (userData: Partial<UserDocument>): Promise<Partial<UserDocument>> => {
    const user: UserDocument = await new UserModel(createUser(userData)).save();

    return {
        id: user._id.toString(),
        role: user.role,
        provider: user.provider,
        email: user.email,
        extraUserData: user.extraUserData,
        createdAt: new Date(),
        photo: user.photo,
        name: user.name
    };
};

export const createUserAndToken: (userData?: Partial<UserDocument>) => Promise<{ user: Partial<UserDocument>; token: string }> = async (userData: Partial<UserDocument> = {}) => {
    const user: Partial<UserDocument> = await createUserInDB(userData);
    const token: string = await createTokenForUser(user);

    return { user, token };
};

export const createTempUser: (userData: Partial<IUserTemp>) => Promise<IUserTemp> = async (userData: Partial<IUserTemp>) => (new TempUserModel({
    _id: new ObjectId(),
    email: `${getUUID()}@authorization.com`,
    password: '$password.hash',
    salt: '$password.salt',
    extraUserData: {
        apps: []
    },
    createdAt: '2019-02-12T10:27:24.001Z',
    role: 'USER',
    confirmationToken: getUUID(),
    ...userData
}).save());

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
        .and.contain(`before=${cursor}`);

    response.body.links.should.have.property('first').and.be.a('string')
        .and.contain(`page[size]=${limit}`)
        .and.not.contain(`before=${cursor}`)
        .and.not.contain(`after=${cursor}`);

    response.body.links.should.have.property('next').and.be.a('string')
        .and.contain(`page[size]=${limit}`)
        .and.contain(`after=${cursor}`);
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
