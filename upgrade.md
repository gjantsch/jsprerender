# Node.js Upgrade Plan

## Status: COMPLETE

All steps have been implemented and merged to main.

---

## What was done

| Item | Before | After |
|---|---|---|
| Node.js | (unspecified) | v24 LTS (Krypton) — pinned via `.nvmrc` and `engines` |
| `express` | `^4.17.1` | `^5.2.1` |
| `puppeteer` | `^19.1.1` | `^25.11.0` (v24 skipped — had high CVEs in extract-zip) |
| `duration-js` | `^4.0.0` | removed — replaced with inline `parseDuration()` |
| `package-lock.json` | absent | committed for reproducible installs |
| CI | none | GitHub Actions on Node 24, runs tests + `npm audit` |

---

## Steps completed

### Step 1 — Pin the Node.js version ✓
- `.nvmrc` with `24`
- `engines: { "node": ">=24.0.0" }` in `package.json`

### Step 2 — Upgrade `puppeteer` ✓
- Targeted v24 initially; `npm audit` revealed high CVEs (`GHSA-jmr9-qjv8-65gv`, `GHSA-7pqw-9j4j-h8q3`) in `extract-zip` affecting all of puppeteer ≤24.x
- Upgraded directly to `^25.11.0` — resolves both CVEs, 0 vulnerabilities

### Step 3 — Upgrade `express` v4 → v5 ✓
- Updated to `^5.2.1`
- Wildcard route changed from `'*'` to `'/{*path}'` (path-to-regexp v8 breaking change)

### Step 4 — Remove `duration-js` ✓
- Replaced with 4-line inline `parseDuration()` supporting `ms/s/m/h/d/w`

### Step 5 — Update `package.json` metadata ✓
- Added `name`, `version`, `description`, `main`, `engines`, `scripts`, `license`

### Step 6 — Audit and lock dependencies ✓
- `package-lock.json` committed
- `npm audit` clean: 0 vulnerabilities

### Step 7 — CI matrix ✓
- `.github/workflows/ci.yml` — Node 24, `npm ci`, `npm test`, `npm audit --audit-level=high`
- Runs on push to `main` and on all pull requests
