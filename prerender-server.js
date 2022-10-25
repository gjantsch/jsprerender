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
        const page = await browser.newPage();        
        await page.goto(url);
        html = await page.content();
        const allResultsSelector = 'meta[name="twitter:card"]';
        await page.waitForSelector(allResultsSelector);
        await browser.close();

    } catch (e) {
        console.log(e);
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

    console.log(`Requested page: ${pageURL}`);

    const fileHash = crypto
        .createHash('md5')
        .update(pageURL)
        .digest('hex');

    const fileName = `${cacheDirectory}/${fileHash}`;

    let html = '';

    if (fs.existsSync(fileName) && !fileOlderThan(fileName, cacheTTL)) {
        console.log(`Reading from cache ${fileName}`);
        html = fs.readFileSync(fileName);
    } else {
        html = await getPage(pageURL);
        if (html.length >= minContentSize) {
            console.log(`Writing to cache ${fileName}`);
            fs.writeFileSync(fileName, html);
        }
    }

    // remove unwanted endings
    html = html
        .toString()
        .replace(/\r/g, "")
        .replace(/\n/g, "")
        .trim();

    console.log(`Sending page with ${html.length} bytes.`);

    res.status(200).setHeader("Content-Type", "text/html;charset=UTF-8").send(html);

    console.log('Page sent!');

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

app.listen(port, () => {

    // makes sure that cache directory exists
    if (!fs.existsSync(cacheDirectory)) {
        fs.mkdirSync(cacheDirectory);
    }

    console.log(`Pre Render Server is running at port ${port}`);

});
