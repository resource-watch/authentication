import config from "config";
import JWT from 'jsonwebtoken';
import mongoose from 'mongoose';
import Sinon, { SinonSandbox } from "sinon";

import UserModel, { IUser, UserDocument } from 'models/user.model';
import TempUserModel, { IUserTemp } from 'models/user-temp.model';

const { ObjectId } = mongoose.Types;

export const getUUID: () => string = () => Math.random().toString(36).substring(7);

export const createUser: (userData: UserDocument | Partial<UserDocument> | null) => Partial<UserDocument> = (userData: UserDocument | Partial<UserDocument> | null) => ({
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

export const createUserInDB: (userData: (UserDocument | Partial<UserDocument>)) => Promise<Partial<UserDocument>> = async (userData: UserDocument | Partial<UserDocument>): Promise<Partial<UserDocument>> => {
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

export const createUserAndToken: (userData: (UserDocument | Partial<UserDocument>)) => Promise<{ user: Partial<UserDocument>; token: string }> = async (userData: UserDocument | Partial<UserDocument>) => {
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
    response.body.links.should.have.property('self').and.be.a('string');
    response.body.links.should.have.property('first').and.be.a('string');
    response.body.links.should.have.property('last').and.be.a('string');
    response.body.links.should.have.property('prev').and.be.a('string');
    response.body.links.should.have.property('next').and.be.a('string');
};

export const stubConfigValue: (sandbox: Sinon.SinonSandbox, stubMap: Record<string, any>) => void = (sandbox: SinonSandbox, stubMap: Record<string, any>): void => {
    const stub: any = sandbox.stub(config, 'get');
    Object.keys(stubMap).forEach(key => {
        stub.withArgs(key).returns(stubMap[key]);
    });
    stub.callThrough();
};

export const assertTokenInfo: (response: ChaiHttp.Response, user: (IUser | Partial<IUser>)) => void = (response: ChaiHttp.Response, user: IUser | Partial<IUser>) => {
    response.status.should.equal(200);
    response.body.should.have.property('_id').and.equal(user.id.toString());
    response.body.should.have.property('extraUserData').and.be.an('object');
    response.body.extraUserData.should.have.property('apps').and.be.an('array').and.deep.equal(user.extraUserData.apps);
    response.body.should.have.property('email').and.equal(user.email);
    response.body.should.have.property('role').and.equal(user.role);
    response.body.should.have.property('provider').and.equal(user.provider);
    response.body.should.have.property('createdAt');
    response.body.should.have.property('updatedAt');
};
