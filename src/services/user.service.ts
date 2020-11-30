import bcrypt from 'bcrypt';
import mongoose from "mongoose";

import logger from "logger";
import UserModel, { IUser } from 'models/user.model';
import UnprocessableEntityError from "errors/unprocessableEntity.error";

export default class UserService {

    static async findOne(conditions:Record<string, any>): Promise<IUser> {
        return UserModel.findOne(conditions).exec();
    }

    static async getUserById(id:string):Promise<IUser> {
        const isValidId:boolean = mongoose.Types.ObjectId.isValid(id);

        if (!isValidId) {
            logger.info(`[Auth Service - getUserById] - Invalid id ${id} provided`);
            throw new UnprocessableEntityError(`Invalid id ${id} provided`);
        }
        return UserModel.findById(id).select('-password -salt -userToken -__v').exec();
    }

    static async migrateToUsernameAndPassword(user:IUser, email:string, password:string):Promise<IUser> {
        if (!user) {
            return null;
        }

        const salt:string = bcrypt.genSaltSync();

        user.provider = 'local';
        delete user.providerId;
        user.email = email;
        user.password = bcrypt.hashSync(password, salt);

        user.updatedAt = new Date();

        return user.save();
    }

}
