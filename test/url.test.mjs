import { test } from 'node:test';
import assert from 'node:assert/strict';

const { isSafeUrl } = await import('../src/url.js');

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
