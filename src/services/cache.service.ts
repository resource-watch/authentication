import config from 'config';
import logger from 'logger';
import redis, {RedisClient} from 'redis';

import {OktaUser} from 'services/okta.interfaces';

class CacheService {
    private client: RedisClient;

    constructor() {
        const redis_url = config.get('redis.url') as string;
        logger.debug('[CacheService] Initializing cache service, connecting to', redis_url);
        this.client = redis.createClient({ url: redis_url });
    }

    async get(key: string): Promise<OktaUser> {
        logger.info(`[CacheService] Getting key ${key} from cache...`);
        return new Promise((resolve: (value: (PromiseLike<OktaUser> | OktaUser)) => void, reject: (reason?: any) => void) => {
            this.client.get(key, (err: Error, res: string) => {
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
        return new Promise((resolve: (value: (PromiseLike<any> | any)) => void, reject: (reason?: any) => void) => {
            this.client.set(key, JSON.stringify(value), 'EX', config.get('redis.defaultTTL'), (err: Error, res: "OK") => {
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
        return new Promise((resolve: (value: (PromiseLike<void> | void)) => void, reject: (reason?: any) => void) => {
            this.client.del(`okta-user-${user.profile.legacyId}`, (err: Error) => {
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
        return new Promise((resolve: (value: (PromiseLike<any> | any)) => void, reject: (reason?: any) => void) => {
            this.client.flushall((err: Error, res: string) => {
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
