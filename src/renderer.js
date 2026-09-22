'use strict';

const createRenderer = ({ config, defaultSelector, log, puppeteer = require('puppeteer') }) => {
    const getPage = async (url) => {
        let html = '';

        try {
            const opts = {
                headless: true,
                args: [
                    '--no-sandbox',
                    '--disable-setuid-sandbox',
                    '--unhandled-rejections=strict',
                    '--disable-dev-shm-usage',
                    '--fast-start',
                ],
            };

            const browser = await puppeteer.launch(opts);

            try {
                const page = await browser.newPage();
                const isDebug = url.indexOf('debug') !== -1;

                if (isDebug) {
                    url = url.replace('?debug', '');
                    url = url.replace('&debug', '');
                    url = url.replace('debug', '');
                }

                await page.goto(url, { waitUntil: 'networkidle0' });

                if (config.pages.length > 0) {
                    const pageSelector = config.pages.find((cfg) => {
                        if (cfg.url.substr(0, 3) === 'ER:') {
                            log.debug(`Checking ER ${cfg.url}`);
                            const pattern = cfg.url.substr(3);
                            const er = new RegExp(pattern, 'gmi');
                            const found = er.exec(url) !== null;
                            log.debug(found ? 'ER Matched' : 'ER Failed');
                            return found;
                        }
                        return cfg.url === url;
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
            return 'Error';
        }

        return html;
    };

    return { getPage };
};

module.exports = { createRenderer };
