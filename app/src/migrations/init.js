const Plugin = require('models/plugin.model');
const Version = require('models/version.model');
const logger = require('logger');

module.exports = async function init() {
    const version = await Version.find();
    if (version && version.length > 0) {
        logger.info('Database ready!!');
        return;
    }

    logger.info('Initializing migration');
    await Plugin.deleteMany({});
    logger.info('Creating new plugins');

    await new Plugin({
        name: 'oauth',
        description: 'Plugin oauth with passport',
        mainFile: 'plugins/sd-ct-oauth-plugin',
        active: true,
        config: {
            applications: {
                rw: {
                    name: 'RW API',
                    logo: 'https://resourcewatch.org/static/images/logo-embed.png',
                    principalColor: '#c32d7b',
                    sendNotifications: true,
                    emailSender: 'noreply@resourcewatch.org',
                    emailSenderName: 'RW API',
                    confirmUrlRedirect: 'http://resourcewatch.org'
                },
                gfw: {
                    name: 'GFW',
                    logo: 'https://www.globalforestwatch.org/packs/gfw-9c5fe396ee5b15cb5f5b639a7ef771bd.png',
                    principalColor: '#97be32',
                    sendNotifications: true,
                    emailSender: 'noreply@globalforestwatch.org',
                    emailSenderName: 'GFW',
                    confirmUrlRedirect: 'https://www.globalforestwatch.org'
                }
            },
            defaultApp: 'gfw',
            thirdParty: {
                rw: {
                    twitter: {
                        active: false,
                        consumerKey: process.env.RW_TWITTER_CONSUMER_KEY,
                        consumerSecret: process.env.RW_TWITTER_CONSUMER_SECRET,
                    },
                    google: {
                        active: false,
                        clientID: process.env.RW_GOOGLE_CLIENT_ID,
                        clientSecret: process.env.RW_GOOGLE_CLIENT_SECRET,
                        scope: ['https://www.googleapis.com/auth/plus.me', 'https://www.googleapis.com/auth/userinfo.email'],
                    },
                    facebook: {
                        active: false,
                        clientID: process.env.RW_FACEBOOK_CLIENT_ID,
                        clientSecret: process.env.RW_FACEBOOK_CLIENT_SECRET,
                        scope: ['email'],
                    },
                },
                prep: {
                    twitter: {
                        active: false,
                        consumerKey: process.env.PREP_TWITTER_CONSUMER_KEY,
                        consumerSecret: process.env.PREP_TWITTER_CONSUMER_SECRET,
                    },
                    google: {
                        active: false,
                        clientID: process.env.PREP_GOOGLE_CLIENT_ID,
                        clientSecret: process.env.PREP_GOOGLE_CLIENT_SECRET,
                        scope: ['https://www.googleapis.com/auth/plus.me', 'https://www.googleapis.com/auth/userinfo.email'],
                    },
                    facebook: {
                        active: false,
                        clientID: process.env.PREP_FACEBOOK_CLIENT_ID,
                        clientSecret: process.env.PREP_FACEBOOK_CLIENT_SECRET,
                        scope: ['email'],
                    },
                },
                gfw: {
                    twitter: {
                        active: false,
                        consumerKey: process.env.GFW_TWITTER_CONSUMER_KEY,
                        consumerSecret: process.env.GFW_TWITTER_CONSUMER_SECRET,
                    },
                    google: {
                        active: false,
                        clientID: process.env.GFW_GOOGLE_CLIENT_ID,
                        clientSecret: process.env.GFW_GOOGLE_CLIENT_SECRET,
                        scope: ['https://www.googleapis.com/auth/plus.me', 'https://www.googleapis.com/auth/userinfo.email'],
                    },
                    facebook: {
                        active: false,
                        clientID: process.env.GFW_FACEBOOK_CLIENT_ID,
                        clientSecret: process.env.GFW_FACEBOOK_CLIENT_SECRET,
                        scope: ['email'],
                    },
                }
            },
            local: {
                active: true,
                sparkpostKey: process.env.SPARKPOST_KEY,
                confirmUrlRedirect: process.env.CONFIRM_URL_REDIRECT,
                gfw: {
                    confirmUrlRedirect: process.env.CONFIRM_URL_REDIRECT,
                },
                rw: {
                    confirmUrlRedirect: process.env.CONFIRM_URL_REDIRECT,
                },
                prep: {
                    confirmUrlRedirect: process.env.CONFIRM_URL_REDIRECT,
                }
            },
            basic: {
                active: false,
                userId: process.env.BASICAUTH_USERNAME,
                password: process.env.BASICAUTH_PASSWORD,
                role: 'ADMIN',
            },
            jwt: {
                active: true,
                secret: process.env.JWT_SECRET,
                passthrough: true,
                expiresInMinutes: 0,
            },
            publicUrl: process.env.PUBLIC_URL,
            allowPublicRegistration: true
        },
        ordering: 2,
    }).save();

    const ENDPOINT_VERSION = 'ENDPOINT_VERSION';
    await new Version({ name: ENDPOINT_VERSION, version: 1 }).save();
};
