const express = require('express');
const app = express();
const puppeteer = require('puppeteer');
const fs = require('fs');
const crypto = require('crypto');
const Duration = require('duration-js')
const util = require('util')

/**
 * Check file age
 * @param {*} filename 
 * @param {*} duration 
 * @returns 
 */
const fileOlderThan = (filename, duration) => {
    let stats
    try {
        stats = fs.statSync(filename)
    } catch (e) {
        return true
    }
    const fileDate = new Date(util.inspect(stats.mtime))
    const parsed = Duration.parse(duration)
    return new Date() - parsed > fileDate
}

/**
 * Console logger
 * @param {*} message 
 */
const logger = (message) => {

    const time = new Date().toISOString();
    console.log(`[${time}] ${message}`);

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
            await page.goto(url);

            if (config.pages.length > 0) {

                const pageSelector = config.pages.find((cfg) => {
                    if (cfg.url.substr(0, 1) === '/') {
                        // is a regular expression)
                        logger(`Using ER ${cfg.url}`)
                        const parts = cfg.url.split('/');
                        const pattern = parts[1] ? parts[1] : '.*';
                        const flags = parts[2] ? parts[2] : 'gm';
                        const er = new RegExp(pattern, flags);
                        const result = er.exec(url);
                        return result !== null;
                    } 
                    return cfg.url === url
                });

                if (pageSelector) {
                    logger(`Using Page Selector ${pageSelector.waitForSelector}`);
                    if (pageSelector.waitForSelector !== null) {
                        await page.waitForSelector(pageSelector.waitForSelector);
                    }
                } else if (defaultSelector) {
                    logger(`Using Default Selector ${defaultSelector.waitForSelector}`);
                    await page.waitForSelector(defaultSelector.waitForSelector);
                }
            }

            html = await page.content();

        } catch (e) {
            console.log(e);
        } finally {
            await browser.close();
        }

    } catch (e) {
        logger(e);
        return 'Error'
    }

    return html

}

/**
 * main loop
 */
app.get('*', async (req, res) => {
    const pageURL = req.query.url;

    if (pageURL == undefined || !pageURL || pageURL.indexOf('http') == -1) {

        res.status(404)
            .setHeader("Content-Type", "text/plain")
            .send(`Invalid URL ${pageURL}`);

        return;
    }

    logger(`Requested page: ${pageURL}`);

    const fileHash = crypto
        .createHash('md5')
        .update(pageURL)
        .digest('hex');

    const fileName = `${config.cache.directory}/${fileHash}`;

    let html = '';

    if (fs.existsSync(fileName) && !fileOlderThan(fileName, config.cache.ttl)) {
        logger(`Reading from cache ${fileName}`);
        html = fs.readFileSync(fileName);
    } else {
        html = await getPage(pageURL);
        if (html.length >= config.cache.minContentSize && pageURL.indexOf('debug') === -1) {
            logger(`Writing to cache ${fileName}`);
            fs.writeFileSync(fileName, html);
        }
    }

    // remove unwanted endings
    html = html
        .toString()
        .replace(/\r/g, "")
        .replace(/\n/g, "")
        .trim();

    logger(`Sending page with ${html.length} bytes.`);

    res.status(200).setHeader("Content-Type", "text/html;charset=UTF-8").send(html);

    logger('Page sent!');

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
    config = { ...config, ...loadedConfig };
}

if (process.argv.find((arg) => arg === '--help')) {
    console.log(`
    Pre Render Server 
    =================
    Cache TTL use:
        https://www.npmjs.com/package/duration-js
        m - minute
        h - hour
        d - day
        w - week

    `);
    return 0; 
}

app.setMaxListeners(config.server.maxListeners);

let defaultSelector = null;
if (config.pages.length > 0) {
    defaultSelector = config.pages.find((cfg) => cfg.url ==='*' );
}

app.listen(config.server.port, () => {

    // makes sure that cache directory exists
    if (!fs.existsSync(config.cache.directory)) {
        fs.mkdirSync(config.cache.directory);
    }

    logger(`Pre Render Server is running at port ${config.server.port}`);

});
