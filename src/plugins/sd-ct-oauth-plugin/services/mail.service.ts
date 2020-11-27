import SparkPost from 'sparkpost';

import logger from '../../../logger';
import Settings from "../../../services/settings.service";

export default class MailService {
    private client: SparkPost;
    private publicUrl: string;

    async setup() {
        if (Settings.getSettings().local.sparkpostKey) {
            this.client = new SparkPost(Settings.getSettings().local.sparkpostKey);
        }
        this.publicUrl = Settings.getSettings().publicUrl;
    }

    sendConfirmationMail(data, recipients, generalConfig) {
        logger.info('[MailService] Sending confirmation mail to ', recipients);
        const reqOpts = {
            substitution_data: {
                urlConfirm: `${this.publicUrl}/auth/confirm/${data.confirmationToken}`,
                fromEmail: generalConfig.application.emailSender,
                fromName: generalConfig.application.emailSenderName,
                appName: generalConfig.application.name,
                logo: generalConfig.application.logo
            },
            content: {
                template_id: 'confirm-user',
            },
            recipients,
        };

        return new Promise((resolve, reject) => {
            logger.info(reqOpts);
            this.client.transmissions.send(reqOpts, (error, res) => {
                if (error) {
                    reject(error);
                } else {
                    resolve(res);
                }
            });
        });
    }

    sendConfirmationMailWithPassword(data, recipients, generalConfig) {
        logger.info('[MailService] Sending confirmation mail to ', recipients);
        const reqOpts = {
            substitution_data: {
                urlConfirm: `${this.publicUrl}/auth/confirm/${data.confirmationToken}?${data.callbackUrl ? `callbackUrl=${data.callbackUrl}` : ''}`,
                password: data.password,
                fromEmail: generalConfig.application.emailSender,
                fromName: generalConfig.application.emailSenderName,
                appName: generalConfig.application.name,
                logo: generalConfig.application.logo
            },
            content: {
                template_id: 'confirm-user-with-password',
            },
            recipients,
        };

        return new Promise((resolve, reject) => {
            logger.info(reqOpts);
            this.client.transmissions.send(reqOpts, (error, res) => {
                if (error) {
                    reject(error);
                } else {
                    resolve(res);
                }
            });
        });
    }

    sendRecoverPasswordMail(data, recipients, generalConfig, originApp) {
        logger.info('[MailService] Sending confirmation mail to ', recipients);
        const reqOpts = {
            substitution_data: {
                urlRecover: `${this.publicUrl}/auth/reset-password/${data.token}?origin=${originApp}`,
                fromEmail: generalConfig.application.emailSender,
                fromName: generalConfig.application.emailSenderName,
                appName: generalConfig.application.name,
                logo: generalConfig.application.logo
            },
            content: {
                template_id: 'recover-password',
            },
            recipients,
        };

        return new Promise((resolve, reject) => {
            this.client.transmissions.send(reqOpts, (error, res) => {
                if (error) {
                    reject(error);
                } else {
                    resolve(res);
                }
            });
        });
    }

}
