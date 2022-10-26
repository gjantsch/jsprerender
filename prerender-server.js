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

            // root doesnt have twitter card
            if (url != 'https://queropaonaporta.com.br/') {
                const allResultsSelector = 'meta[name="twitter:card"]';
                await page.waitForSelector(allResultsSelector);
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

    const fileName = `${cacheDirectory}/${fileHash}`;

    let html = '';

    if (fs.existsSync(fileName) && !fileOlderThan(fileName, cacheTTL)) {
        logger(`Reading from cache ${fileName}`);
        html = fs.readFileSync(fileName);
    } else {
        html = await getPage(pageURL);
        if (html.length >= minContentSize) {
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

// https://www.npmjs.com/package/duration-js
// m - minute
// h - hour
// d - day
// w - week
const cacheTTL = '2d';
const cacheDirectory = './cache';
const minContentSize = 1000;
const port = 3001;

app.setMaxListeners(50);

app.listen(port, () => {

    // makes sure that cache directory exists
    if (!fs.existsSync(cacheDirectory)) {
        fs.mkdirSync(cacheDirectory);
    }

    logger(`Pre Render Server is running at port ${port}`);

});
