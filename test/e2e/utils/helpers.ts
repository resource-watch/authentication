import config from "config";
import JWT from 'jsonwebtoken';
import mongoose from 'mongoose';
import { SinonSandbox } from "sinon";
import { promisify } from 'util';

import UserModel from 'plugins/sd-ct-oauth-plugin/models/user.model';
import TempUserModel from 'plugins/sd-ct-oauth-plugin/models/user-temp.model';

const { ObjectId } = mongoose.Types;

export const getUUID = () => Math.random().toString(36).substring(7);

export const createUser = (userData) => ({
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

export const createTokenForUser = (tokenData) => promisify(JWT.sign)(tokenData, process.env.JWT_SECRET);

export const createUserInDB = async (userData) => {
    // eslint-disable-next-line no-undef
    const user = await new UserModel(createUser(userData)).save();

    return {
        id: user._id.toString(),
        role: user.role,
        provider: user.provider,
        email: user.email,
        extraUserData: user.extraUserData,
        createdAt: Date.now(),
        photo: user.photo,
        name: user.name
    };
};

export const createUserAndToken = async (userData) => {
    const user = await createUserInDB(userData);
    const token = await createTokenForUser(user);

    return { user, token };
};

export const createTempUser = async (userData) => (TempUserModel({
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

export const ensureHasPaginationElements = (response) => {
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

export const stubConfigValue = (sandbox: SinonSandbox, stubMap: Record<string, any>): void => {
    const stub = sandbox.stub(config, 'get');
    Object.keys(stubMap).forEach(key => { stub.withArgs(key).returns(stubMap[key]); });
}
