import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import crypto from 'node:crypto';
import { LRUCache } from 'lru-cache';

const { createApp } = await import('../src/app.js');

const silentLog = { debug: () => {}, info: () => {}, warn: () => {}, error: () => {} };

const CACHE_DIR = '/tmp/test-app-cache';

const baseConfig = () => ({
    server: { maxListeners: 50, allowedHosts: [] },
    cache:  { directory: CACHE_DIR, ttl: '2d', minContentSize: 100 },
    pages:  [],
});

// Fake fsp that never actually touches the filesystem.
const makeFsp = (overrides = {}) => ({
    access:    overrides.access    ?? (() => Promise.reject(Object.assign(new Error('ENOENT'), { code: 'ENOENT' }))),
    readFile:  overrides.readFile  ?? (() => Promise.resolve('<html>disk</html>')),
    writeFile: overrides.writeFile ?? (() => Promise.resolve()),
    unlink:    overrides.unlink    ?? (() => Promise.resolve()),
});

const LONG_HTML = '<html><head><title>Test</title></head><body><main><h1>Rendered Page</h1><p>Content paragraph long enough to pass minContentSize.</p></main></body></html>';

const makeRenderer = (html = LONG_HTML) => ({
    getPage: async (_url) => html,
});

// Spin up a real HTTP server on a random port; returns { url, server }.
// Caller is responsible for closing server.
const startServer = (overrides = {}) => new Promise((resolve) => {
    const config   = overrides.config   ?? baseConfig();
    const l1Cache  = overrides.l1Cache  ?? new LRUCache({ max: 500, ttl: 1000 * 60 });
    const renderer = overrides.renderer ?? makeRenderer();
    const fsp      = overrides.fsp      ?? makeFsp();
    const fileOlderThan = overrides.fileOlderThan ?? (() => Promise.resolve(true));
    const log      = overrides.log      ?? silentLog;

    const app = createApp({ config, l1Cache, renderer, fsp, fileOlderThan, log });
    const server = http.createServer(app);
    server.listen(0, '127.0.0.1', () => {
        const { port } = server.address();
        resolve({ url: `http://127.0.0.1:${port}`, server, l1Cache });
    });
});

const closeServer = (server) => new Promise((resolve) => server.close(resolve));

// ============================================================
// GET /health
// ============================================================
test('app: GET /health returns 200 {status:"ok"}', async () => {
    const { url, server } = await startServer();
    after(() => closeServer(server));

    const res  = await fetch(`${url}/health`);
    const body = await res.json();
    assert.equal(res.status, 200);
    assert.deepEqual(body, { status: 'ok' });
});

// ============================================================
// DELETE /cache
// ============================================================
test('app: DELETE /cache without url param returns 400', async () => {
    const { url, server } = await startServer();
    after(() => closeServer(server));

    const res = await fetch(`${url}/cache`, { method: 'DELETE' });
    assert.equal(res.status, 400);
});

test('app: DELETE /cache purges file and L1, returns 200', async () => {
    const pageURL  = 'https://example.com/page';
    const fileHash = crypto.createHash('md5').update(pageURL).digest('hex');
    const l1Cache  = new LRUCache({ max: 500, ttl: 60000 });
    l1Cache.set(fileHash, '<html>cached</html>');

    let unlinkedPath;
    const fsp = makeFsp({ unlink: (p) => { unlinkedPath = p; return Promise.resolve(); } });

    const { url, server } = await startServer({ fsp, l1Cache });
    after(() => closeServer(server));

    const res  = await fetch(`${url}/cache?url=${encodeURIComponent(pageURL)}`, { method: 'DELETE' });
    const body = await res.json();
    assert.equal(res.status, 200);
    assert.equal(body.purged, true);
    assert.equal(body.url, pageURL);
    assert.equal(l1Cache.has(fileHash), false);
    assert.ok(unlinkedPath.endsWith(fileHash));
});

test('app: DELETE /cache returns 404 when file not cached', async () => {
    const fsp = makeFsp({
        unlink: () => Promise.reject(Object.assign(new Error('ENOENT'), { code: 'ENOENT' })),
    });
    const { url, server } = await startServer({ fsp });
    after(() => closeServer(server));

    const res  = await fetch(`${url}/cache?url=https://example.com/`, { method: 'DELETE' });
    const body = await res.json();
    assert.equal(res.status, 404);
    assert.equal(body.purged, false);
    assert.equal(body.reason, 'not cached');
});

test('app: DELETE /cache returns 500 on unexpected unlink error', async () => {
    const fsp = makeFsp({
        unlink: () => Promise.reject(Object.assign(new Error('EIO'), { code: 'EIO' })),
    });
    const { url, server } = await startServer({ fsp });
    after(() => closeServer(server));

    const res = await fetch(`${url}/cache?url=https://example.com/`, { method: 'DELETE' });
    assert.equal(res.status, 500);
});

// ============================================================
// GET /{*path} — input validation
// ============================================================
test('app: GET without url param returns 404', async () => {
    const { url, server } = await startServer();
    after(() => closeServer(server));

    const res = await fetch(`${url}/render`);
    assert.equal(res.status, 404);
});

test('app: GET with non-http url returns 404', async () => {
    const { url, server } = await startServer();
    after(() => closeServer(server));

    const res = await fetch(`${url}/render?url=${encodeURIComponent('ftp://example.com/')}`);
    assert.equal(res.status, 404);
});

test('app: GET with private IP returns 403', async () => {
    const { url, server } = await startServer();
    after(() => closeServer(server));

    const res = await fetch(`${url}/render?url=${encodeURIComponent('http://192.168.1.1/')}`);
    assert.equal(res.status, 403);
});

test('app: GET with host not in allowedHosts returns 403', async () => {
    const config = { ...baseConfig(), server: { ...baseConfig().server, allowedHosts: ['mysite.com'] } };
    const { url, server } = await startServer({ config });
    after(() => closeServer(server));

    const res = await fetch(`${url}/render?url=${encodeURIComponent('https://other.com/')}`);
    assert.equal(res.status, 403);
});

// ============================================================
// GET /{*path} — render paths
// ============================================================
test('app: GET cold render returns 200 with rendered HTML', async () => {
    const { url, server } = await startServer();
    after(() => closeServer(server));

    const res  = await fetch(`${url}/render?url=${encodeURIComponent('https://example.com/')}`);
    const body = await res.text();
    assert.equal(res.status, 200);
    assert.ok(body.includes('Rendered'));
});

test('app: GET returns 502 when renderer returns Error', async () => {
    const renderer = makeRenderer('Error');
    const { url, server } = await startServer({ renderer });
    after(() => closeServer(server));

    const res = await fetch(`${url}/render?url=${encodeURIComponent('https://example.com/')}`);
    assert.equal(res.status, 502);
});

test('app: GET strips \\r from response body', async () => {
    const renderer = makeRenderer('<html>\r\n<body>\r\n</body>\r\n</html>');
    const { url, server } = await startServer({ renderer });
    after(() => closeServer(server));

    const res  = await fetch(`${url}/render?url=${encodeURIComponent('https://example.com/')}`);
    const body = await res.text();
    assert.ok(!body.includes('\r'));
});

test('app: GET with L1 hit skips renderer', async () => {
    const pageURL  = 'https://example.com/l1hit';
    const fileHash = crypto.createHash('md5').update(pageURL).digest('hex');
    const l1Cache  = new LRUCache({ max: 500, ttl: 60000 });
    l1Cache.set(fileHash, '<html>l1cached</html>');

    let renderCalls = 0;
    const renderer = { getPage: async () => { renderCalls++; return '<html>fresh</html>'; } };

    const { url, server } = await startServer({ l1Cache, renderer });
    after(() => closeServer(server));

    const res  = await fetch(`${url}/render?url=${encodeURIComponent(pageURL)}`);
    const body = await res.text();
    assert.equal(res.status, 200);
    assert.equal(renderCalls, 0);
    assert.ok(body.includes('l1cached'));
});

// ============================================================
// Cache flow
// ============================================================
test('app: GET serves from disk cache when file is fresh', async () => {
    const diskHtml = '<html><body>from-disk</body></html>';
    const fsp = makeFsp({
        access:   () => Promise.resolve(),
        readFile: () => Promise.resolve(diskHtml),
    });
    const fileOlderThan = () => Promise.resolve(false);

    let renderCalls = 0;
    const renderer = { getPage: async () => { renderCalls++; return '<html>fresh</html>'; } };

    const { url, server } = await startServer({ fsp, fileOlderThan, renderer });
    after(() => closeServer(server));

    const res  = await fetch(`${url}/render?url=${encodeURIComponent('https://example.com/')}`);
    const body = await res.text();
    assert.equal(res.status, 200);
    assert.equal(renderCalls, 0);
    assert.ok(body.includes('from-disk'));
});

test('app: GET populates L1 from disk hit', async () => {
    const pageURL  = 'https://example.com/diskpop';
    const fileHash = crypto.createHash('md5').update(pageURL).digest('hex');
    const diskHtml = '<html><body>disk-pop</body></html>';

    const fsp = makeFsp({
        access:   () => Promise.resolve(),
        readFile: () => Promise.resolve(diskHtml),
    });
    const fileOlderThan = () => Promise.resolve(false);
    const l1Cache = new LRUCache({ max: 500, ttl: 60000 });

    const { url, server } = await startServer({ fsp, fileOlderThan, l1Cache });
    after(() => closeServer(server));

    await fetch(`${url}/render?url=${encodeURIComponent(pageURL)}`);
    assert.ok(l1Cache.has(fileHash));
});

test('app: GET writes to disk and L1 after cold render', async () => {
    const pageURL  = 'https://example.com/coldwrite';
    const fileHash = crypto.createHash('md5').update(pageURL).digest('hex');

    let writtenPath;
    const fsp = makeFsp({
        writeFile: (p, _content) => { writtenPath = p; return Promise.resolve(); },
    });
    const l1Cache = new LRUCache({ max: 500, ttl: 60000 });

    const { url, server } = await startServer({ fsp, l1Cache });
    after(() => closeServer(server));

    await fetch(`${url}/render?url=${encodeURIComponent(pageURL)}`);
    assert.ok(writtenPath.endsWith(fileHash));
    assert.ok(l1Cache.has(fileHash));
});

test('app: GET skips disk write when content below minContentSize', async () => {
    const config = { ...baseConfig(), cache: { ...baseConfig().cache, minContentSize: 99999 } };
    let writeFileCalled = false;
    const fsp = makeFsp({ writeFile: () => { writeFileCalled = true; return Promise.resolve(); } });
    const l1Cache = new LRUCache({ max: 500, ttl: 60000 });

    const { url, server } = await startServer({ config, fsp, l1Cache });
    after(() => closeServer(server));

    await fetch(`${url}/render?url=${encodeURIComponent('https://example.com/')}`);
    assert.equal(writeFileCalled, false);
    assert.equal(l1Cache.size, 0);
});

test('app: GET skips disk write when url contains "debug"', async () => {
    let writeFileCalled = false;
    const fsp = makeFsp({ writeFile: () => { writeFileCalled = true; return Promise.resolve(); } });

    const { url, server } = await startServer({ fsp });
    after(() => closeServer(server));

    await fetch(`${url}/render?url=${encodeURIComponent('https://example.com/?debug')}`);
    assert.equal(writeFileCalled, false);
});

// ============================================================
// L1 integration
// ============================================================
test('app: second request uses L1, renderer called only once', async () => {
    let renderCalls = 0;
    const renderer = { getPage: async () => { renderCalls++; return LONG_HTML; } };
    const l1Cache  = new LRUCache({ max: 500, ttl: 60000 });

    const { url, server } = await startServer({ renderer, l1Cache });
    after(() => closeServer(server));

    const pageURL = encodeURIComponent('https://example.com/l1double');
    await fetch(`${url}/render?url=${pageURL}`);
    await fetch(`${url}/render?url=${pageURL}`);
    assert.equal(renderCalls, 1);
});

test('app: DELETE /cache clears L1 so next request re-renders', async () => {
    const pageURL  = 'https://example.com/rererender';
    const fileHash = crypto.createHash('md5').update(pageURL).digest('hex');

    let renderCalls = 0;
    const renderer = { getPage: async () => { renderCalls++; return '<html>rerendered</html>'; } };
    const l1Cache  = new LRUCache({ max: 500, ttl: 60000 });
    const fsp = makeFsp({ unlink: () => Promise.resolve() });

    const { url, server } = await startServer({ renderer, l1Cache, fsp });
    after(() => closeServer(server));

    // Seed L1 directly.
    l1Cache.set(fileHash, '<html>stale</html>');

    // Purge.
    await fetch(`${url}/cache?url=${encodeURIComponent(pageURL)}`, { method: 'DELETE' });
    assert.equal(l1Cache.has(fileHash), false);

    // Next render should hit the renderer again.
    await fetch(`${url}/render?url=${encodeURIComponent(pageURL)}`);
    assert.equal(renderCalls, 1);
});
