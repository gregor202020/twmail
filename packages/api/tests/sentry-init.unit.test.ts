/**
 * Source-code scan: verify Sentry wiring in api package.
 *
 * These tests read source files from disk and assert the correct patterns
 * are present — no runtime, no DB, no network required.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'fs';
import { join, resolve } from 'path';

// import.meta.dirname = packages/api/tests → go up 3 levels to repo root
const root = resolve(import.meta.dirname, '..', '..', '..');
const apiSrc = join(root, 'packages', 'api', 'src');
const apiDockerfile = join(root, 'packages', 'api', 'Dockerfile');

describe('Sentry init — API (source-code scan)', () => {
  it('instrument.mjs exists in packages/api/src/', () => {
    const instrumentPath = join(apiSrc, 'instrument.mjs');
    expect(existsSync(instrumentPath), `${instrumentPath} must exist`).toBe(true);
  });

  it('instrument.mjs calls Sentry.init with dsn from process.env.SENTRY_DSN', () => {
    const instrumentPath = join(apiSrc, 'instrument.mjs');
    const source = readFileSync(instrumentPath, 'utf-8');
    expect(source).toContain('Sentry.init');
    expect(source).toContain('process.env.SENTRY_DSN');
  });

  it('instrument.mjs sets sendDefaultPii: false', () => {
    const instrumentPath = join(apiSrc, 'instrument.mjs');
    const source = readFileSync(instrumentPath, 'utf-8');
    expect(source).toContain('sendDefaultPii: false');
  });

  it('app.ts calls setupFastifyErrorHandler', () => {
    const appPath = join(apiSrc, 'app.ts');
    const source = readFileSync(appPath, 'utf-8');
    expect(source).toContain('setupFastifyErrorHandler');
  });

  it('API Dockerfile CMD uses --import for instrument.mjs', () => {
    const dockerfile = readFileSync(apiDockerfile, 'utf-8');
    expect(dockerfile).toMatch(/--import.*instrument/);
  });
});
