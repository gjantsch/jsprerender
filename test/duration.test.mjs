import { test } from 'node:test';
import assert from 'node:assert/strict';

const { parseDuration } = await import('../src/duration.js');

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
