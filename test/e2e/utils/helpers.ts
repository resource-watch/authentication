import config from "config";
import JWT from 'jsonwebtoken';
import mongoose from 'mongoose';
import Sinon, { SinonSandbox } from "sinon";

import UserModel, { IUser } from 'models/user.model';
import TempUserModel, { IUserTemp } from 'models/user-temp.model';

const { ObjectId } = mongoose.Types;

export const getUUID: () => string = () => Math.random().toString(36).substring(7);

export const createUser: (userData: IUser | Partial<IUser> | null) => Partial<IUser> = (userData: IUser | Partial<IUser> | null) => ({
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

export const createTokenForUser: (tokenData: Partial<IUser>) => string = (tokenData: Partial<IUser>) => JWT.sign(tokenData, process.env.JWT_SECRET);

export const createUserInDB: (userData: (IUser | Partial<IUser>)) => Promise<Partial<IUser>> = async (userData: IUser | Partial<IUser>): Promise<Partial<IUser>> => {
    const user: IUser = await new UserModel(createUser(userData)).save();

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

export const createUserAndToken: (userData: (IUser | Partial<IUser>)) => Promise<{ user: Partial<IUser>; token: string }> = async (userData: IUser | Partial<IUser>) => {
    const user: Partial<IUser> = await createUserInDB(userData);
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
    response.body.should.have.property('meta').and.be.an('object');
    response.body.meta.should.have.property('total-pages').and.be.a('number');
    response.body.meta.should.have.property('total-items').and.be.a('number');
    response.body.meta.should.have.property('size').and.equal(10);

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
};
