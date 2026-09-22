'use strict';

const DURATION_UNITS = { ms: 1, s: 1000, m: 60000, h: 3600000, d: 86400000, w: 604800000 };

const parseDuration = (str) => {
    const match = String(str).match(/^(\d+(?:\.\d+)?)\s*(ms|s|m|h|d|w)?$/);
    if (!match) throw new Error(`Invalid duration: ${str}`);
    return parseFloat(match[1]) * (DURATION_UNITS[match[2] || 'ms'] || 1);
};

module.exports = { parseDuration, DURATION_UNITS };
