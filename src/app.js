'use strict';

const express = require('express');
const crypto  = require('crypto');
const { isSafeUrl } = require('./url');

const createApp = ({ config, l1Cache, renderer, fsp, fileOlderThan, log }) => {
    const app = express();
    app.setMaxListeners(config.server.maxListeners || 50);

    app.get('/health', (_req, res) => {
        res.status(200).json({ status: 'ok' });
    });

    app.delete('/cache', async (req, res) => {
        const pageURL = req.query.url;
        if (!pageURL) {
            return res.status(400).setHeader('Content-Type', 'text/plain').send('Missing url parameter');
        }
        const fileHash = crypto.createHash('md5').update(pageURL).digest('hex');
        const fileName = `${config.cache.directory}/${fileHash}`;
        try {
            await fsp.unlink(fileName);
            l1Cache.delete(fileHash);
            log.info({ url: pageURL }, 'Cache entry purged');
            res.status(200).json({ purged: true, url: pageURL });
        } catch (e) {
            if (e.code === 'ENOENT') {
                res.status(404).json({ purged: false, url: pageURL, reason: 'not cached' });
            } else {
                log.error({ err: e, url: pageURL }, 'Cache purge failed');
                res.status(500).setHeader('Content-Type', 'text/plain').send('Purge failed');
            }
        }
    });

    app.get('/{*path}', async (req, res) => {
        const pageURL = req.query.url;

        if (!pageURL || pageURL.indexOf('http') === -1) {
            return res.status(404).setHeader('Content-Type', 'text/plain').send(`Invalid URL ${pageURL}`);
        }

        if (!isSafeUrl(pageURL, config.server.allowedHosts || [])) {
            log.warn({ url: pageURL }, 'Blocked unsafe URL');
            return res.status(403).setHeader('Content-Type', 'text/plain').send('URL not allowed');
        }

        log.info({ url: pageURL }, 'Requested page');

        const fileHash = crypto.createHash('md5').update(pageURL).digest('hex');
        const fileName = `${config.cache.directory}/${fileHash}`;

        let html = '';

        const l1Hit = l1Cache.get(fileHash);
        if (l1Hit) {
            log.debug({ url: pageURL }, 'L1 cache hit');
            html = l1Hit;
        } else {
            let cacheExists = false;
            try {
                await fsp.access(fileName);
                cacheExists = true;
            } catch { }

            if (cacheExists && !(await fileOlderThan(fileName, config.cache.ttl))) {
                log.debug({ file: fileName }, 'Reading from disk cache');
                html = await fsp.readFile(fileName, 'utf8');
                l1Cache.set(fileHash, html);
            } else {
                html = await renderer.getPage(pageURL);

                if (html === 'Error') {
                    log.error({ url: pageURL }, 'Render failed');
                    return res.status(502).setHeader('Content-Type', 'text/plain').send('Render failed');
                }

                if (html.length >= config.cache.minContentSize && pageURL.indexOf('debug') === -1) {
                    log.debug({ file: fileName }, 'Writing to cache');
                    await fsp.writeFile(fileName, html);
                    l1Cache.set(fileHash, html);
                }
            }
        }

        html = html.toString().replace(/\r/g, '').replace(/\n/g, '').trim();
        log.info({ bytes: html.length }, 'Sending page');
        res.status(200).setHeader('Content-Type', 'text/html;charset=UTF-8').send(html);
    });

    return app;
};

module.exports = { createApp };
