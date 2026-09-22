import { test } from 'node:test';
import assert from 'node:assert/strict';

const { createRenderer } = await import('../src/renderer.js');

const silentLog = { debug: () => {}, info: () => {}, warn: () => {}, error: () => {} };

// Build a fake puppeteer whose page records goto URLs and selector calls.
const makeFakePuppeteer = (overrides = {}) => {
    const gotoUrls = [];
    const selectorsCalled = [];

    const page = {
        goto:            async (url) => { gotoUrls.push(url); },
        content:         async () => '<html><body>rendered</body></html>',
        waitForSelector: async (sel) => { selectorsCalled.push(sel); },
    };

    const browser = {
        newPage: async () => page,
        close:   async () => {},
    };

    return {
        launch:           async () => overrides.launchError
            ? Promise.reject(overrides.launchError)
            : browser,
        _gotoUrls:        gotoUrls,
        _selectorsCalled: selectorsCalled,
    };
};

const baseConfig = { pages: [], cache: { ttl: '2d' } };

test('renderer: getPage strips ?debug from URL', async () => {
    const fake = makeFakePuppeteer();
    const renderer = createRenderer({ config: baseConfig, defaultSelector: null, log: silentLog, puppeteer: fake });
    await renderer.getPage('https://example.com/page?debug');
    assert.equal(fake._gotoUrls[0], 'https://example.com/page');
});

test('renderer: getPage strips &debug from URL', async () => {
    const fake = makeFakePuppeteer();
    const renderer = createRenderer({ config: baseConfig, defaultSelector: null, log: silentLog, puppeteer: fake });
    await renderer.getPage('https://example.com/page?foo=1&debug');
    assert.equal(fake._gotoUrls[0], 'https://example.com/page?foo=1');
});

test('renderer: getPage returns Error string when puppeteer.launch throws', async () => {
    const fake = makeFakePuppeteer({ launchError: new Error('launch failed') });
    const renderer = createRenderer({ config: baseConfig, defaultSelector: null, log: silentLog, puppeteer: fake });
    const result = await renderer.getPage('https://example.com/');
    assert.equal(result, 'Error');
});

test('renderer: getPage calls waitForSelector when page config matches URL', async () => {
    const fake = makeFakePuppeteer();
    const config = {
        pages: [{ url: 'https://example.com/', waitForSelector: 'main' }],
        cache: { ttl: '2d' },
    };
    const renderer = createRenderer({ config, defaultSelector: null, log: silentLog, puppeteer: fake });
    await renderer.getPage('https://example.com/');
    assert.ok(fake._selectorsCalled.includes('main'));
});
