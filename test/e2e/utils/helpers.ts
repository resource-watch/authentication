import config from "config";
import JWT from 'jsonwebtoken';
import mongoose from 'mongoose';
import Sinon, { SinonSandbox } from "sinon";

import UserModel, { IUserDocument } from 'models/user.model';
import TempUserModel, { IUserTemp } from 'models/user-temp.model';

const { ObjectId } = mongoose.Types;

export const getUUID: () => string = () => Math.random().toString(36).substring(7);

export const createUser: (userData: IUserDocument | Partial<IUserDocument> | null) => Partial<IUserDocument> = (userData: IUserDocument | Partial<IUserDocument> | null) => ({
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

export const createTokenForUser: (tokenData: Partial<IUserDocument>) => string = (tokenData: Partial<IUserDocument>) => JWT.sign(tokenData, process.env.JWT_SECRET);

export const createUserInDB: (userData: (IUserDocument | Partial<IUserDocument>)) => Promise<Partial<IUserDocument>> = async (userData: IUserDocument | Partial<IUserDocument>): Promise<Partial<IUserDocument>> => {
    const user: IUserDocument = await new UserModel(createUser(userData)).save();

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

export const createUserAndToken: (userData: (IUserDocument | Partial<IUserDocument>)) => Promise<{ user: Partial<IUserDocument>; token: string }> = async (userData: IUserDocument | Partial<IUserDocument>) => {
    const user: Partial<IUserDocument> = await createUserInDB(userData);
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
    stub.callThrough();
};
