import config from 'config';
import logger from 'logger';
import redis, {RedisClient} from 'redis';

import {OktaUser} from 'services/okta.interfaces';

class CacheService {
    private client: RedisClient;

    constructor() {
        logger.debug('[CacheService] Initializing cache service');

        this.client = redis.createClient({ url: config.get('redis.url') as string });
    }

    async get(key: string): Promise<OktaUser> {
        logger.info(`[CacheService] Getting key ${key} from cache...`);
        return new Promise((resolve, reject) => {
            this.client.get(key, (err, res) => {
                if (err) {
                    logger.error(err);
                    reject(err);
                }
                resolve(JSON.parse(res) as OktaUser);
            });
        });
    }

    async set(key: string, value: OktaUser): Promise<any> {
        logger.info(`[CacheService] Setting key ${key} in cache...`);
        return new Promise((resolve, reject) => {
            this.client.set(key, JSON.stringify(value), 'EX', config.get('redis.defaultTTL'), (err, res) => {
                if (err) {
                    logger.error(err);
                    reject(err);
                }
                resolve(res);
            });
        });
    }

    async invalidate(user: OktaUser): Promise<void> {
        logger.info(`[CacheService] Deleting key okta-user-${user.profile.legacyId} in cache...`);
        return new Promise((resolve, reject) => {
            this.client.del(`okta-user-${user.profile.legacyId}`, (err) => {
                if (err) {
                    logger.error(err);
                    reject(err);
                }
                resolve();
            });
        });
    }

    async clear(): Promise<any> {
        logger.info(`[CacheService] Clearing cache...`);
        return new Promise((resolve, reject) => {
            this.client.flushall((err, res) => {
                if (err) {
                    logger.error(err);
                    reject(err);
                }
                resolve(res);
            });
        });
    }
}

export default new CacheService();
