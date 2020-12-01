import config from 'config';

export interface IApplication {
    name: string;
    logo: string;
    principalColor: string;
    sendNotifications: boolean;
    emailSender: string;
    emailSenderName: string;
    confirmUrlRedirect: string;
}

interface IFacebookAuth {
    scope: string[];
    clientSecret: string;
    clientID: string;
    active: boolean;
}

interface IGoogleAuth {
    scope: string[];
    clientSecret: string;
    clientID: string;
    active: boolean;
}

interface ITwitterAuth {
    consumerSecret: string;
    consumerKey: string;
    active: boolean;
}

interface IAppleAuth {
    active: boolean;
    teamId: string;
    keyId: string;
    clientId: string;
    privateKeyString: string;
}

interface IJwtAuth {
    expiresInMinutes: number;
    passthrough: boolean;
    secret: string;
    active: boolean;
}

interface ILocalAuth extends Record<string, any> {
    confirmUrlRedirect: string;
    sparkpostKey: string;
    active: boolean;
    gfw: { confirmUrlRedirect: string; };
    rw: { confirmUrlRedirect: string; };
    prep: { confirmUrlRedirect: string; };
}

export interface IThirdPartyAuth {
    facebook: IFacebookAuth;
    google: IGoogleAuth;
    apple?: IAppleAuth;
    twitter: ITwitterAuth;
}

export interface ISettings {
    applications: Record<string, IApplication>;
    publicUrl: string;
    jwt: IJwtAuth;
    local: ILocalAuth;
    defaultApp: string;
    thirdParty: Record<string, IThirdPartyAuth>;
}

export default class Settings {
    private static settings:ISettings = null;

    static getSettings(): ISettings {
        if (Settings.settings && process.env.NODE_ENV !== 'test') {
            return Settings.settings;
        }

        Settings.settings = {
            applications: {
                rw: {
                    name: "RW API",
                    logo: "https://resourcewatch.org/static/images/logo-embed.png",
                    principalColor: "#c32d7b",
                    sendNotifications: true,
                    emailSender: "noreply@resourcewatch.org",
                    emailSenderName: "Resource Watch",
                    confirmUrlRedirect: "https://resourcewatch.org"
                },
                prep: {
                    name: "PREP",
                    logo: "https://prepdata.org/prep-logo.png",
                    principalColor: "#263e57",
                    sendNotifications: true,
                    emailSender: "noreply@prepdata.org",
                    emailSenderName: "PREP",
                    confirmUrlRedirect: "https://prepdata.org"
                },
                gfw: {
                    name: "GFW",
                    logo: "https://www.globalforestwatch.org/packs/gfw-9c5fe396ee5b15cb5f5b639a7ef771bd.png",
                    principalColor: "#97be32",
                    sendNotifications: true,
                    emailSender: "noreply@globalforestwatch.org",
                    emailSenderName: "GFW",
                    confirmUrlRedirect: "https://www.globalforestwatch.org"
                },
                "forest-atlas": {
                    name: "Forest Atlas",
                    logo: "https://wriorg.s3.amazonaws.com/s3fs-public/styles/large/public/forest-atlases-logo-1.png?itok=BV_4QvsM",
                    principalColor: "#008d6a",
                    sendNotifications: true,
                    emailSender: "noreply@resourcewatch.org",
                    emailSenderName: "Forest Atlas",
                    confirmUrlRedirect: "https://www.wri.org/our-work/project/forest-atlases"
                }
            },
            jwt: {
                expiresInMinutes: 0.0,
                passthrough: true,
                secret: config.get('jwt.token'),
                active: true
            },
            local: {
                confirmUrlRedirect: config.get('settings.local.confirmUrlRedirect'),
                sparkpostKey: config.get('settings.local.sparkpostKey'),
                active: true,
                gfw: { confirmUrlRedirect: config.get('settings.local.gfw.confirmUrlRedirect') },
                rw: { confirmUrlRedirect: config.get('settings.local.rw.confirmUrlRedirect') },
                prep: { confirmUrlRedirect: config.get('settings.local.prep.confirmUrlRedirect') }
            },
            publicUrl: config.get('server.publicUrl'),
            defaultApp: config.get('settings.defaultApp'),
            thirdParty: {
                rw: {
                    facebook: {
                        scope: ["email"],
                        clientSecret: config.get('settings.thirdParty.rw.facebook.clientSecret'),
                        clientID: config.get('settings.thirdParty.rw.facebook.clientID'),
                        active: config.get('settings.thirdParty.rw.facebook.active')
                    },
                    google: {
                        scope: [
                            "https://www.googleapis.com/auth/plus.me",
                            "https://www.googleapis.com/auth/userinfo.email"
                        ],
                        clientSecret: config.get('settings.thirdParty.rw.google.clientSecret'),
                        clientID: config.get('settings.thirdParty.rw.google.clientID'),
                        active: config.get('settings.thirdParty.rw.google.active')
                    },
                    twitter: {
                        consumerSecret: config.get('settings.thirdParty.rw.twitter.consumerSecret'),
                        consumerKey: config.get('settings.thirdParty.rw.twitter.consumerKey'),
                        active: config.get('settings.thirdParty.rw.twitter.active')
                    }
                },
                gfw: {
                    facebook: {
                        scope: ["email"],
                        clientSecret: config.get('settings.thirdParty.gfw.facebook.clientSecret'),
                        clientID: config.get('settings.thirdParty.gfw.facebook.clientID'),
                        active: config.get('settings.thirdParty.gfw.facebook.active')
                    },
                    google: {
                        scope: [
                            "https://www.googleapis.com/auth/plus.me",
                            "https://www.googleapis.com/auth/userinfo.email"
                        ],
                        clientSecret: config.get('settings.thirdParty.gfw.google.clientSecret'),
                        clientID: config.get('settings.thirdParty.gfw.google.clientID'),
                        active: config.get('settings.thirdParty.gfw.google.active')
                    },
                    apple: {
                        active: config.get('settings.thirdParty.gfw.apple.active'),
                        teamId: config.get('settings.thirdParty.gfw.apple.teamId'),
                        keyId: config.get('settings.thirdParty.gfw.apple.keyId'),
                        clientId: config.get('settings.thirdParty.gfw.apple.clientId'),
                        privateKeyString: config.get('settings.thirdParty.gfw.apple.privateKeyString')
                    },
                    twitter: {
                        consumerSecret: config.get('settings.thirdParty.gfw.twitter.consumerSecret'),
                        consumerKey: config.get('settings.thirdParty.gfw.twitter.consumerKey'),
                        active: config.get('settings.thirdParty.gfw.twitter.active')
                    }
                },
                prep: {
                    facebook: {
                        scope: ["email"],
                        clientSecret: config.get('settings.thirdParty.prep.facebook.clientSecret'),
                        clientID: config.get('settings.thirdParty.prep.facebook.clientID'),
                        active: config.get('settings.thirdParty.prep.facebook.active')
                    },
                    google: {
                        scope: [
                            "https://www.googleapis.com/auth/plus.me",
                            "https://www.googleapis.com/auth/userinfo.email"
                        ],
                        clientSecret: config.get('settings.thirdParty.prep.google.clientSecret'),
                        clientID: config.get('settings.thirdParty.prep.google.clientID'),
                        active: config.get('settings.thirdParty.prep.google.active')
                    },
                    twitter: {
                        consumerSecret: config.get('settings.thirdParty.prep.twitter.consumerSecret'),
                        consumerKey: config.get('settings.thirdParty.prep.twitter.consumerKey'),
                        active: config.get('settings.thirdParty.prep.twitter.active')
                    }
                }
            }
        };

        return Settings.settings;
    }
}
