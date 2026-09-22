const express = require('express');
const app = express();
const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const pino = require('pino');

const log = pino({ level: process.env.LOG_LEVEL || 'info' });
const DURATION_UNITS = { ms: 1, s: 1000, m: 60000, h: 3600000, d: 86400000, w: 604800000 };
const parseDuration = (str) => {
    const match = String(str).match(/^(\d+(?:\.\d+)?)\s*(ms|s|m|h|d|w)?$/);
    if (!match) throw new Error(`Invalid duration: ${str}`);
    return parseFloat(match[1]) * (DURATION_UNITS[match[2] || 'ms'] || 1);
};

const fileOlderThan = async (filename, duration) => {
    let stats
    try {
        stats = await fs.promises.stat(filename)
    } catch (e) {
        return true
    }
    return new Date() - stats.mtime > parseDuration(duration)
}

// Blocks private IPv4 ranges, loopback, link-local, and cloud metadata endpoints.
const PRIVATE_IP_RE = /^(https?:\/\/)(localhost|127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|169\.254\.|0\.0\.0\.0|::1)/i;

/**
 * Returns true if the URL is safe to fetch: must be http(s) and must not
 * target private/loopback addresses or a hostname not in the allowedHosts list.
 * @param {string} url
 * @param {string[]} allowedHosts  empty array means "all public hosts allowed"
 */
const isSafeUrl = (url, allowedHosts) => {
    let parsed;
    try {
        parsed = new URL(url);
    } catch {
        return false;
    }

    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
        return false;
    }

    if (PRIVATE_IP_RE.test(url)) {
        return false;
    }

    if (allowedHosts && allowedHosts.length > 0) {
        return allowedHosts.includes(parsed.hostname);
    }

    return true;
}

/**
 * Get Rendered Page
 * @param {*} url 
 * @returns 
 */
let getPage = async (url) => {
    let html = '';

    try {

        const opts = {
            headless: true,
            args: [
                "--no-sandbox",
                "--disable-setuid-sandbox",
                "--unhandled-rejections=strict",
                "--disable-dev-shm-usage",
                "--fast-start",
            ],
        };

        const browser = await puppeteer.launch(opts);

        try {
            const page = await browser.newPage();
            const isDebug = url.indexOf('debug') !== -1;

            // debug param must be stripped of the URL
            if (isDebug) {
                url = url.replace('?debug', '');
                url = url.replace('&debug', '');
                url = url.replace('debug', '');
            }

            await page.goto(url, { waitUntil: 'networkidle0' });

            if (config.pages.length > 0) {

                const pageSelector = config.pages.find((cfg) => {
                    if (cfg.url.substr(0, 3) === 'ER:') {
                        // is a regular expression)
                        log.debug(`Checking ER ${cfg.url}`)
                        const pattern = cfg.url.substr(3);
                        const flags = 'gmi';
                        const er = new RegExp(pattern, flags);
                        const result = er.exec(url);
                        const found = result !== null;
                        log.debug(found ? 'ER Matched' : 'ER Failed');
                        return found;
                    } 
                    return cfg.url === url
                });

                if (pageSelector) {
                    log.debug(`Using Page Selector ${pageSelector.waitForSelector}`);
                    if (pageSelector.waitForSelector !== null) {
                        await page.waitForSelector(pageSelector.waitForSelector);
                    }
                } else if (defaultSelector) {
                    log.debug(`Using Default Selector ${defaultSelector.waitForSelector}`);
                    await page.waitForSelector(defaultSelector.waitForSelector);
                }
            }

            html = await page.content();

        } catch (e) {
            log.error({ err: e }, 'Page render error');
        } finally {
            await browser.close();
        }

    } catch (e) {
        log.error({ err: e }, 'Browser render error');
        return 'Error'
    }

    return html

}

/**
 * main loop
 */
app.get('/{*path}', async (req, res) => {
    const pageURL = req.query.url;

    if (pageURL == undefined || !pageURL || pageURL.indexOf('http') == -1) {

        res.status(404)
            .setHeader("Content-Type", "text/plain")
            .send(`Invalid URL ${pageURL}`);

        return;
    }

    if (!isSafeUrl(pageURL, config.server.allowedHosts || [])) {
        log.warn({ url: pageURL }, 'Blocked unsafe URL');
        res.status(403)
            .setHeader("Content-Type", "text/plain")
            .send("URL not allowed");
        return;
    }

    log.info({ url: pageURL }, 'Requested page');

    const fileHash = crypto
        .createHash('md5')
        .update(pageURL)
        .digest('hex');

    const fileName = `${config.cache.directory}/${fileHash}`;

    let html = '';
    let cacheExists = false;
    try {
        await fs.promises.access(fileName);
        cacheExists = true;
    } catch { }

    if (cacheExists && !(await fileOlderThan(fileName, config.cache.ttl))) {
        log.debug({ file: fileName }, 'Reading from cache');
        html = await fs.promises.readFile(fileName, 'utf8');
    } else {
        html = await getPage(pageURL);

        if (html === 'Error') {
            log.error({ url: pageURL }, 'Render failed');
            res.status(502).setHeader("Content-Type", "text/plain").send("Render failed");
            return;
        }

        if (html.length >= config.cache.minContentSize && pageURL.indexOf('debug') === -1) {
            log.debug({ file: fileName }, 'Writing to cache');
            await fs.promises.writeFile(fileName, html);
        }
    }

    // remove unwanted endings
    html = html
        .toString()
        .replace(/\r/g, "")
        .replace(/\n/g, "")
        .trim();

    log.info({ bytes: html.length }, 'Sending page');

    res.status(200).setHeader("Content-Type", "text/html;charset=UTF-8").send(html);

});

/**
 * Default setup
 */
let config = {
    "cache": {
        "ttl": "2d",
        "directory": "./cache",
        "minContentSize": 1000
    },
    "server": {
        "port": 3001,
        "maxListeners": 50
    },
    "pages": []
};

if (fs.existsSync('./config.json')) {
    const loadedConfig = JSON.parse(fs.readFileSync('./config.json'));
    config = {
        cache:  { ...config.cache,  ...(loadedConfig.cache  || {}) },
        server: { ...config.server, ...(loadedConfig.server || {}) },
        pages:  loadedConfig.pages !== undefined ? loadedConfig.pages : config.pages,
    };
}

if (process.argv.find((arg) => arg === '--help')) {
    console.log(`
    Pre Render Server
    =================
    Cache TTL format:
        <number><unit>  e.g. 2d, 12h, 30m, 1w
        Units: ms, s, m (minute), h, d, w

    `);
    return 0;
}

app.setMaxListeners(config.server.maxListeners);

// CACHE_DIR env var overrides config; resolve to absolute path so the process
// working directory does not affect where cache files land.
config.cache.directory = path.resolve(
    process.env.CACHE_DIR || config.cache.directory
);

let defaultSelector = null;
if (config.pages.length > 0) {
    defaultSelector = config.pages.find((cfg) => cfg.url ==='*' );
}

app.listen(config.server.port, () => {

    // makes sure that cache directory exists
    if (!fs.existsSync(config.cache.directory)) {
        fs.mkdirSync(config.cache.directory);
    }

    log.info(`Pre Render Server is running at port ${config.server.port}`);

});
