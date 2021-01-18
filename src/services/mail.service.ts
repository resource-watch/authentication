import SparkPost, { Recipient } from 'sparkpost';

import logger from 'logger';
import Settings from "services/settings.service";

export default class MailService {
    private client: SparkPost;
    private publicUrl: string;

    async setup(): Promise<void> {
        if (Settings.getSettings().local.sparkpostKey) {
            this.client = new SparkPost(Settings.getSettings().local.sparkpostKey);
        }
        this.publicUrl = Settings.getSettings().publicUrl;
    }

    sendConfirmationMail(
        data: Record<string, any>,
        recipients: Recipient[],
        generalConfig: Record<string, any>
    ): Promise<any> {
        logger.info('[MailService] Sending confirmation mail to ', recipients);
        const reqOpts: SparkPost.CreateTransmission = {
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

    sendConfirmationMailWithPassword(
        data: Record<string, any>,
        recipients: Recipient[],
        generalConfig: Record<string, any>
    ): Promise<any> {
        logger.info('[MailService] Sending confirmation mail to ', recipients);
        const reqOpts: SparkPost.CreateTransmission = {
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

    sendRecoverPasswordMail(
        data: Record<string, any>,
        recipients: Recipient[],
        generalConfig: Record<string, any>,
        originApp: string
    ): Promise<any> {
        logger.info('[MailService] Sending confirmation mail to ', recipients);
        const reqOpts: SparkPost.CreateTransmission = {
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
            if (!this.client) {
                throw new Error('Email service not configured, cannot send emails');
            }

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
