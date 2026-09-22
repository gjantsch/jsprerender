import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const { fileOlderThan, deepMergeConfig } = await import('../src/cache.js');

// ===========================================================================
// fileOlderThan
// ===========================================================================
test('fileOlderThan: missing file returns true', async () => {
    assert.equal(await fileOlderThan('/nonexistent/file', '1d'), true);
});

test('fileOlderThan: fresh file returns false', async () => {
    const tmp = path.join(os.tmpdir(), `jspre-cache-${Date.now()}`);
    fs.writeFileSync(tmp, 'x');
    try {
        assert.equal(await fileOlderThan(tmp, '1d'), false);
    } finally {
        fs.unlinkSync(tmp);
    }
});

test('fileOlderThan: expired file returns true', async () => {
    const tmp = path.join(os.tmpdir(), `jspre-cache-${Date.now()}`);
    fs.writeFileSync(tmp, 'x');
    const twoDaysAgo = new Date(Date.now() - 2 * 86400000);
    fs.utimesSync(tmp, twoDaysAgo, twoDaysAgo);
    try {
        assert.equal(await fileOlderThan(tmp, '1d'), true);
    } finally {
        fs.unlinkSync(tmp);
    }
});

// ===========================================================================
// deepMergeConfig
// ===========================================================================
const defaults = {
    cache:  { ttl: '2d', directory: './cache', minContentSize: 1000 },
    server: { port: 3001, maxListeners: 50 },
    pages:  [],
};

test('deepMergeConfig: partial cache override preserves other cache defaults', () => {
    const result = deepMergeConfig(defaults, { cache: { ttl: '1h' } });
    assert.equal(result.cache.ttl, '1h');
    assert.equal(result.cache.directory, './cache');
    assert.equal(result.cache.minContentSize, 1000);
});

test('deepMergeConfig: partial server override preserves other server defaults', () => {
    const result = deepMergeConfig(defaults, { server: { port: 4000 } });
    assert.equal(result.server.port, 4000);
    assert.equal(result.server.maxListeners, 50);
});

test('deepMergeConfig: pages overridden when provided', () => {
    const pages = [{ url: '*', waitForSelector: 'body' }];
    const result = deepMergeConfig(defaults, { pages });
    assert.deepEqual(result.pages, pages);
});

test('deepMergeConfig: defaults pages preserved when not in loaded config', () => {
    const result = deepMergeConfig({ ...defaults, pages: [{ url: '*', waitForSelector: null }] }, {});
    assert.equal(result.pages.length, 1);
});

test('deepMergeConfig: empty loaded config returns all defaults', () => {
    const result = deepMergeConfig(defaults, {});
    assert.deepEqual(result.cache, defaults.cache);
    assert.deepEqual(result.server, defaults.server);
});
