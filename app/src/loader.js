/* eslint-disable import/no-dynamic-require  */
const logger = require('logger');
const Plugin = require('models/plugin.model');
const fs = require('fs');

const routersPath = `${__dirname}/routes`;
const mount = require('koa-mount');
const Utils = require('utils');

async function loadPlugins(app) {
    logger.info('Loading plugins');
    const generalConfig = Utils.getGeneralConfig();
    const plugins = await Plugin.find({ active: true }).sort({ ordering: 1 });

    // Explicitly loading some plugins, since the remaining will be handled by CT
    const filteredPlugins = plugins.filter((plg) => ['oauth', 'manageErrors', 'sessionMongo', 'appKey'].includes(plg.name));

    filteredPlugins.forEach((plugin) => {
        try {
            logger.info(`Loading ${plugin.name} plugin`);
            require(plugin.mainFile).middleware(app, plugin, generalConfig);
        } catch (e) {
            logger.error(e);
            throw e;
        }
    });
}

function loadAPI(app, path, pathApi) {
    const routesFiles = fs.readdirSync(path);
    let existIndexRouter = false;
    routesFiles.forEach((file) => {
        const newPath = path ? `${path}/${file}` : file;
        const stat = fs.statSync(newPath);

        if (!stat.isDirectory()) {
            if (file.lastIndexOf('.router.js') !== -1) {
                if (file === 'index.router.js') {
                    existIndexRouter = true;
                } else {
                    logger.debug('Loading route %s, in path %s', newPath, pathApi);
                    if (pathApi) {
                        app.use(mount(pathApi, require(newPath).routes())); // eslint-disable-line global-require,max-len
                    } else {
                        app.use(require(newPath).routes()); // eslint-disable-line global-require,max-len
                    }
                }
            }
        } else {
            // is folder
            const newPathAPI = pathApi ? `${pathApi}/${file}` : `/${file}`;
            loadAPI(app, newPath, newPathAPI);
        }
    });
    if (existIndexRouter) {
        // load indexRouter when finish other Router
        const newPath = path ? `${path}/index.router.js` : 'index.router.js';
        logger.debug('Loading route %s, in path %s', newPath, pathApi);
        if (pathApi) {
            app.use(mount(pathApi, require(newPath).routes())); // eslint-disable-line global-require,max-len
        } else {
            app.use(require(newPath).routes()); // eslint-disable-line global-require,max-len
        }
    }
}

function loadRoutes(app) {
    logger.debug('Loading routes...');
    loadAPI(app, routersPath);
    logger.debug('Loaded routes correctly!');
}

module.exports = {
    loadPlugins,
    loadRoutes,
};
