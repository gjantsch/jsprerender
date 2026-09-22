'use strict';

// Blocks private IPv4 ranges, loopback, link-local, and cloud metadata endpoints.
const PRIVATE_IP_RE = /^(https?:\/\/)(localhost|127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|169\.254\.|0\.0\.0\.0|::1)/i;

/**
 * Returns true if the URL is safe to fetch: must be http(s) and must not
 * target private/loopback addresses or a hostname not in the allowedHosts list.
 * @param {string} url
 * @param {string[]} allowedHosts  empty array means "all public hosts allowed"
 */
const isSafeUrl = (url, allowedHosts) => {
    let parsed;
    try {
        parsed = new URL(url);
    } catch {
        return false;
    }

    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
        return false;
    }

    if (PRIVATE_IP_RE.test(url)) {
        return false;
    }

    if (allowedHosts && allowedHosts.length > 0) {
        return allowedHosts.includes(parsed.hostname);
    }

    return true;
};

module.exports = { isSafeUrl, PRIVATE_IP_RE };
