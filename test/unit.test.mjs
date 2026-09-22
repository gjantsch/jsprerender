import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setTimeout as sleep } from 'node:timers/promises';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// ---------------------------------------------------------------------------
// parseDuration — inline copy so tests run without loading the full server
// ---------------------------------------------------------------------------
const DURATION_UNITS = { ms: 1, s: 1000, m: 60000, h: 3600000, d: 86400000, w: 604800000 };
const parseDuration = (str) => {
    const match = String(str).match(/^(\d+(?:\.\d+)?)\s*(ms|s|m|h|d|w)?$/);
    if (!match) throw new Error(`Invalid duration: ${str}`);
    return parseFloat(match[1]) * (DURATION_UNITS[match[2] || 'ms'] || 1);
};

// ---------------------------------------------------------------------------
// fileOlderThan — inline copy
// ---------------------------------------------------------------------------
const fileOlderThan = async (filename, duration) => {
    let stats;
    try {
        stats = await fs.promises.stat(filename);
    } catch {
        return true;
    }
    return new Date() - stats.mtime > parseDuration(duration);
};

// ---------------------------------------------------------------------------
// isSafeUrl — inline copy
// ---------------------------------------------------------------------------
const PRIVATE_IP_RE = /^(https?:\/\/)(localhost|127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|169\.254\.|0\.0\.0\.0|::1)/i;
const isSafeUrl = (url, allowedHosts) => {
    let parsed;
    try { parsed = new URL(url); } catch { return false; }
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return false;
    if (PRIVATE_IP_RE.test(url)) return false;
    if (allowedHosts && allowedHosts.length > 0) return allowedHosts.includes(parsed.hostname);
    return true;
};

// ---------------------------------------------------------------------------
// deepMergeConfig — inline copy
// ---------------------------------------------------------------------------
const deepMergeConfig = (defaults, loaded) => ({
    cache:  { ...defaults.cache,  ...(loaded.cache  || {}) },
    server: { ...defaults.server, ...(loaded.server || {}) },
    pages:  loaded.pages !== undefined ? loaded.pages : defaults.pages,
});

// ===========================================================================
// parseDuration tests
// ===========================================================================
test('parseDuration: milliseconds (no unit)', () => {
    assert.equal(parseDuration('500'), 500);
});
test('parseDuration: seconds', () => {
    assert.equal(parseDuration('2s'), 2000);
});
test('parseDuration: minutes', () => {
    assert.equal(parseDuration('1m'), 60000);
});
test('parseDuration: hours', () => {
    assert.equal(parseDuration('1h'), 3600000);
});
test('parseDuration: days', () => {
    assert.equal(parseDuration('2d'), 172800000);
});
test('parseDuration: weeks', () => {
    assert.equal(parseDuration('1w'), 604800000);
});
test('parseDuration: decimal', () => {
    assert.equal(parseDuration('1.5h'), 5400000);
});
test('parseDuration: invalid throws', () => {
    assert.throws(() => parseDuration('abc'), /Invalid duration/);
});

// ===========================================================================
// fileOlderThan tests
// ===========================================================================
test('fileOlderThan: missing file returns true', async () => {
    const result = await fileOlderThan('/nonexistent/file', '1d');
    assert.equal(result, true);
});

test('fileOlderThan: fresh file returns false', async () => {
    const tmp = path.join(os.tmpdir(), `jspre-test-${Date.now()}`);
    fs.writeFileSync(tmp, 'x');
    try {
        const result = await fileOlderThan(tmp, '1d');
        assert.equal(result, false);
    } finally {
        fs.unlinkSync(tmp);
    }
});

test('fileOlderThan: expired file returns true', async () => {
    const tmp = path.join(os.tmpdir(), `jspre-test-${Date.now()}`);
    fs.writeFileSync(tmp, 'x');
    // backdate mtime by 2 days
    const twoDaysAgo = new Date(Date.now() - 2 * 86400000);
    fs.utimesSync(tmp, twoDaysAgo, twoDaysAgo);
    try {
        const result = await fileOlderThan(tmp, '1d');
        assert.equal(result, true);
    } finally {
        fs.unlinkSync(tmp);
    }
});

// ===========================================================================
// isSafeUrl tests
// ===========================================================================
test('isSafeUrl: valid https URL is safe', () => {
    assert.equal(isSafeUrl('https://example.com/page', []), true);
});
test('isSafeUrl: valid http URL is safe', () => {
    assert.equal(isSafeUrl('http://example.com/', []), true);
});
test('isSafeUrl: file:// scheme is blocked', () => {
    assert.equal(isSafeUrl('file:///etc/passwd', []), false);
});
test('isSafeUrl: localhost is blocked', () => {
    assert.equal(isSafeUrl('http://localhost:8080/', []), false);
});
test('isSafeUrl: 127.x is blocked', () => {
    assert.equal(isSafeUrl('http://127.0.0.1/', []), false);
});
test('isSafeUrl: 10.x is blocked', () => {
    assert.equal(isSafeUrl('http://10.0.0.1/', []), false);
});
test('isSafeUrl: 192.168.x is blocked', () => {
    assert.equal(isSafeUrl('http://192.168.1.1/', []), false);
});
test('isSafeUrl: 172.16.x is blocked', () => {
    assert.equal(isSafeUrl('http://172.16.0.1/', []), false);
});
test('isSafeUrl: cloud metadata endpoint is blocked', () => {
    assert.equal(isSafeUrl('http://169.254.169.254/latest/meta-data/', []), false);
});
test('isSafeUrl: allowedHosts permits matching hostname', () => {
    assert.equal(isSafeUrl('https://mysite.com/page', ['mysite.com']), true);
});
test('isSafeUrl: allowedHosts blocks non-matching hostname', () => {
    assert.equal(isSafeUrl('https://other.com/page', ['mysite.com']), false);
});
test('isSafeUrl: invalid URL string returns false', () => {
    assert.equal(isSafeUrl('not-a-url', []), false);
});

// ===========================================================================
// deepMergeConfig tests
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
