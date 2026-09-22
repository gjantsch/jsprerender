'use strict';

const fs   = require('fs');
const pino = require('pino');
const { LRUCache }       = require('lru-cache');
const { loadConfig }     = require('./src/config');
const { parseDuration }  = require('./src/duration');
const { fileOlderThan }  = require('./src/cache');
const { createRenderer } = require('./src/renderer');
const { createApp }      = require('./src/app');

if (process.argv.includes('--help')) {
    console.log(`
    Pre Render Server
    =================
    Cache TTL format:
        <number><unit>  e.g. 2d, 12h, 30m, 1w
        Units: ms, s, m (minute), h, d, w

    `);
    process.exit(0);
}

const log    = pino({ level: process.env.LOG_LEVEL || 'info' });
const config = loadConfig();

const l1Cache = new LRUCache({
    max: 500,
    ttl: parseDuration(config.cache.ttl),
});

const defaultSelector = config.pages.find(c => c.url === '*') || null;

const renderer = createRenderer({ config, defaultSelector, log });
const app      = createApp({ config, l1Cache, renderer, fsp: fs.promises, fileOlderThan, log });

app.listen(config.server.port, () => {
    if (!fs.existsSync(config.cache.directory)) {
        fs.mkdirSync(config.cache.directory, { recursive: true });
    }
    log.info(`Pre Render Server is running at port ${config.server.port}`);
});
