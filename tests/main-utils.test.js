const test = require('node:test');
const assert = require('node:assert/strict');

const {
    formatTimeDifference,
    hexToRgb
} = require('../frontend/public/main-utils.js');

test('formatTimeDifference returns milliseconds for sub-second values', () => {
    assert.equal(formatTimeDifference(875), '+875ms');
});

test('formatTimeDifference returns seconds with two decimals', () => {
    assert.equal(formatTimeDifference(1250), '+1.25s');
});

test('formatTimeDifference returns minutes and seconds for long durations', () => {
    assert.equal(formatTimeDifference(61015), '+1m 1.01s');
});

test('hexToRgb expands shorthand hex colors', () => {
    assert.deepEqual(hexToRgb('#0f8'), { r: 0, g: 255, b: 136 });
});

test('hexToRgb returns zeros for invalid input', () => {
    assert.deepEqual(hexToRgb('not-a-color'), { r: 0, g: 0, b: 0 });
});
