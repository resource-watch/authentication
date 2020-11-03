const Plugin = require('models/plugin.model');
const mongoose = require('mongoose');
const config = require('config');
const { ObjectId } = require('mongoose').Types;
const JWT = require('jsonwebtoken');
const { promisify } = require('util');
const UserModel = require('plugins/sd-ct-oauth-plugin/models/user.model');
const TempUserModel = require('plugins/sd-ct-oauth-plugin/models/user-temp.model');
const mongooseOptions = require('../../../../config/mongoose');

const mongoUri = process.env.CT_MONGO_URI || `mongodb://${config.get('mongodb.host')}:${config.get('mongodb.port')}/${config.get('mongodb.database')}`;
const getUUID = () => Math.random().toString(36).substring(7);

const createUser = (userData) => ({
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

const createTokenForUser = (tokenData) => promisify(JWT.sign)(tokenData, process.env.JWT_SECRET);

const createUserInDB = async (userData) => {
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

const createUserAndToken = async (userData) => {
    const user = await createUserInDB(userData);
    const token = await createTokenForUser(user);

    return { user, token };
};

const createTempUser = async (userData) => (TempUserModel({
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

const ensureHasPaginationElements = (response) => {
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

async function setPluginSetting(pluginName, settingKey, settingValue) {
    return new Promise((resolve, reject) => {
        async function onDbReady(err) {
            if (err) {
                reject(new Error(err));
            }

            const plugin = await Plugin.findOne({ name: pluginName }).exec();
            if (!plugin) {
                reject(new Error(`Plugin '${pluginName}' could not be found.`));
            }

            const newConfig = {};
            const pluginObjectKey = `config.${settingKey}`;
            newConfig[pluginObjectKey] = settingValue;

            return Plugin.updateOne({ name: pluginName }, { $set: newConfig }).exec().then(resolve);
        }

        mongoose.connect(mongoUri, mongooseOptions, onDbReady);
    });
}

module.exports = {
    createUser,
    setPluginSetting,
    getUUID,
    createUserAndToken,
    createUserInDB,
    createTempUser,
    ensureHasPaginationElements
};
