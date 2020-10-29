const appConstants = require('app.constants');
const Router = require('koa-router');
const Endpoint = require('models/endpoint.model');
const VersionModel = require('models/version.model');
const logger = require('logger');
const Utils = require('utils');
const pick = require('lodash/pick');

const router = new Router({
    prefix: '/endpoint',
});

class EndpointRouter {

    static async getAll(ctx) {
        logger.info('Obtaining endpoints');
        const query = pick(ctx.query, ['authenticated', 'applicationRequired', 'binary', 'path', 'method']);

        const version = await VersionModel.findOne({
            name: appConstants.ENDPOINT_VERSION,
        });
        ctx.body = await Endpoint.find({ ...query, version: version.version }, { __v: 0 });
    }

}

router.get('/', Utils.isLogged, Utils.isAdmin, EndpointRouter.getAll);

module.exports = router;
