import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const { loadConfig } = await import('../src/config.js');

// ===========================================================================
// loadConfig
// ===========================================================================
test('loadConfig: returns defaults when no config file exists', () => {
    const config = loadConfig('/nonexistent/path/config.json');
    assert.equal(config.server.port, 3001);
    assert.equal(config.server.maxListeners, 50);
    assert.equal(config.cache.ttl, '2d');
    assert.equal(config.cache.minContentSize, 1000);
    assert.deepEqual(config.pages, []);
});

test('loadConfig: partial cache override preserves other cache defaults', () => {
    const tmp = path.join(os.tmpdir(), `jspre-cfg-${Date.now()}.json`);
    fs.writeFileSync(tmp, JSON.stringify({ cache: { ttl: '1h' } }));
    try {
        const config = loadConfig(tmp);
        assert.equal(config.cache.ttl, '1h');
        assert.equal(config.cache.minContentSize, 1000);
    } finally {
        fs.unlinkSync(tmp);
    }
});

test('loadConfig: partial server override preserves other server defaults', () => {
    const tmp = path.join(os.tmpdir(), `jspre-cfg-${Date.now()}.json`);
    fs.writeFileSync(tmp, JSON.stringify({ server: { port: 4000 } }));
    try {
        const config = loadConfig(tmp);
        assert.equal(config.server.port, 4000);
        assert.equal(config.server.maxListeners, 50);
    } finally {
        fs.unlinkSync(tmp);
    }
});

test('loadConfig: CACHE_DIR env var overrides directory and resolves to absolute path', () => {
    const prev = process.env.CACHE_DIR;
    process.env.CACHE_DIR = '/tmp/my-cache';
    try {
        const config = loadConfig('/nonexistent/config.json');
        assert.equal(config.cache.directory, '/tmp/my-cache');
        assert.ok(path.isAbsolute(config.cache.directory));
    } finally {
        if (prev === undefined) delete process.env.CACHE_DIR;
        else process.env.CACHE_DIR = prev;
    }
});

test('loadConfig: cache.directory is resolved to absolute path even without CACHE_DIR', () => {
    const prev = process.env.CACHE_DIR;
    delete process.env.CACHE_DIR;
    try {
        const config = loadConfig('/nonexistent/config.json');
        assert.ok(path.isAbsolute(config.cache.directory));
    } finally {
        if (prev !== undefined) process.env.CACHE_DIR = prev;
    }
});
