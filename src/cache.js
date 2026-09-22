'use strict';

const fs = require('fs');
const { parseDuration } = require('./duration');

const fileOlderThan = async (filename, duration) => {
    let stats;
    try {
        stats = await fs.promises.stat(filename);
    } catch (e) {
        return true;
    }
    return new Date() - stats.mtime > parseDuration(duration);
};

const deepMergeConfig = (defaults, loaded) => ({
    cache:  { ...defaults.cache,  ...(loaded.cache  || {}) },
    server: { ...defaults.server, ...(loaded.server || {}) },
    pages:  loaded.pages !== undefined ? loaded.pages : defaults.pages,
});

module.exports = { fileOlderThan, deepMergeConfig };
