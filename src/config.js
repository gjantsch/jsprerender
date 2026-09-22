'use strict';

const fs   = require('fs');
const path = require('path');
const { deepMergeConfig } = require('./cache');

const DEFAULTS = {
    cache: {
        ttl: '2d',
        directory: './cache',
        minContentSize: 1000,
    },
    server: {
        port: 3001,
        maxListeners: 50,
    },
    pages: [],
};

const loadConfig = (filePath = './config.json') => {
    let config = {
        cache:  { ...DEFAULTS.cache },
        server: { ...DEFAULTS.server },
        pages:  [...DEFAULTS.pages],
    };

    if (fs.existsSync(filePath)) {
        const loaded = JSON.parse(fs.readFileSync(filePath, 'utf8'));
        config = deepMergeConfig(config, loaded);
    }

    config.cache.directory = path.resolve(
        process.env.CACHE_DIR || config.cache.directory
    );

    return config;
};

module.exports = { loadConfig, DEFAULTS };
