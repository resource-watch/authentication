import config from 'config';
import logger from 'logger';
import redis, {RedisClient} from 'redis';

import {OktaUser} from 'services/okta.interfaces';

export default class CacheService {
    private static getCacheClient(): RedisClient {
        const client: RedisClient = redis.createClient({ url: config.get('redis.url') as string });

        client.on('error', (error) => {
            logger.error(error);
        });

        return client;
    }

    static async get(key: string): Promise<OktaUser> {
        const client: RedisClient = CacheService.getCacheClient();
        logger.info(`[CacheService] Getting key ${key} from cache...`);
        return new Promise(resolve => {
            client.get(key, (err, res) => {
                if (err) { logger.error(err); }
                resolve(JSON.parse(res) as OktaUser);
            });
        });
    }

    static async set(key: string, value: OktaUser): Promise<any> {
        const client: RedisClient = CacheService.getCacheClient();
        logger.info(`[CacheService] Setting key ${key} in cache...`);
        return new Promise(resolve => {
            client.set(key, JSON.stringify(value), (err, res) => {
                if (err) { logger.error(err); }
                resolve(res);
            });
        });
    }

    static async delete(user: OktaUser): Promise<void> {
        const client: RedisClient = CacheService.getCacheClient();
        logger.info(`[CacheService] Deleting key okta-user-${user.profile.legacyId} in cache...`);
        return new Promise(resolve => {
            client.del(`okta-user-${user.profile.legacyId}`, (err) => {
                if (err) { logger.error(err); }
                resolve();
            });
        });
    }

    static async clear(): Promise<any> {
        const client: RedisClient = CacheService.getCacheClient();
        logger.info(`[CacheService] Clearing cache...`);
        return new Promise(resolve => {
            client.flushall((err, res) => {
                if (err) logger.error(err);
                resolve(res);
            });
        });
    }
}
