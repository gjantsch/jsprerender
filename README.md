# jsprerender
A prerender server for ReactJS, VueJS, Angular pages.
[![CI](https://github.com/gjantsch/jsprerender/actions/workflows/ci.yml/badge.svg?branch=main&event=branch_protection_rule)](https://github.com/gjantsch/jsprerender/actions/workflows/ci.yml)

## Requirements

- Node.js >= 24
- Chromium (included automatically via Puppeteer)

## Getting started

```bash
npm install
npm start
```

Or with Docker:

```bash
docker build -t jsprerender .
docker run -p 3001:3001 jsprerender
```

## Configuration

Create a `config.json` in the project root (see `config.json.sample`):

```json
{
    "server": {
        "port": 3001,
        "maxListeners": 50,
        "allowedHosts": ["mysite.com", "other.com"]
    },
    "cache": {
        "ttl": "2d",
        "directory": "./cache",
        "minContentSize": 1000
    },
    "pages": [
        {
            "url": "*",
            "waitForSelector": "meta[name=\"twitter:card\"]"
        },
        {
            "url": "https://mysite.com/",
            "waitForSelector": null
        }
    ]
}
```

All fields are optional — defaults are used for anything omitted.

### server

| Field | Default | Description |
|---|---|---|
| `port` | `3001` | TCP port the server listens on |
| `maxListeners` | `50` | Max concurrent event listeners |
| `allowedHosts` | _(none)_ | Whitelist of hostnames. When set, requests for any other host are rejected with 403. Omit or set to `[]` to allow all hosts. |

### cache

| Field | Default | Description |
|---|---|---|
| `ttl` | `2d` | How long a cached file is considered fresh before re-rendering |
| `directory` | `./cache` | Directory for on-disk HTML cache |
| `minContentSize` | `1000` | Minimum response size in bytes to be eligible for caching. Smaller responses are served but not stored. |

Cache TTL format: `<number><unit>` — e.g. `2d`, `12h`, `30m`, `1w`.
Units: `ms`, `s`, `m` (minute), `h`, `d`, `w`.

### pages

Each entry maps a URL pattern to a CSS selector that signals the page is fully rendered.

`page.url` accepts:
- An exact URL: `"https://mysite.com/page"`
- A Regular Expression prefixed with `ER:`: `"ER:.*mypattern.*"`
- The wildcard `"*"` as a catch-all default selector

`waitForSelector` is a CSS3 selector Puppeteer waits for before capturing the page.
Set to `null` to capture immediately without waiting.

## Environment variables

| Variable | Default | Description |
|---|---|---|
| `LOG_LEVEL` | `info` | Pino log level: `trace`, `debug`, `info`, `warn`, `error` |
| `CACHE_DIR` | value from `config.json` | Overrides `cache.directory`. Useful in Docker/Kubernetes to mount a volume. |

## API

### Render a page

```
GET /?url=<encoded-url>
```

```bash
curl 'http://127.0.0.1:3001/?url=https://mysite.com/mypage'
```

To render without caching the result, add `debug` anywhere in the URL:

```bash
curl 'http://127.0.0.1:3001/?url=https://mysite.com/mypage?debug'
```

### Purge a cached page

```
DELETE /cache?url=<encoded-url>
```

Removes the on-disk cache file and the in-memory L1 entry for the given URL.

```bash
curl -X DELETE 'http://127.0.0.1:3001/cache?url=https://mysite.com/mypage'
```

### Health check

```
GET /health
```

Returns `{"status":"ok"}` with HTTP 200. Suitable for load balancer and container health probes.

## Running tests

```bash
npm test
```
