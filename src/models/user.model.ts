export interface IUser {
    id: string;
    name?: string;
    photo?: string;
    provider: string;
    providerId?: string;
    email?: string;
    password?: string;
    salt?: string;
    role: string;
    createdAt: Date;
    updatedAt: Date;
    extraUserData: { apps: string[]; };
    userToken?: string;
}
