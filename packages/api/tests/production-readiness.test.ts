import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const ROOT = resolve(__dirname, '..', '..', '..');

function readFile(relativePath: string): string {
  return readFileSync(resolve(ROOT, relativePath), 'utf-8');
}

describe('Production Readiness - Source Code Scan', () => {
  describe('SES DNS verification script', () => {
    const src = readFile('scripts/verify-ses-dns.ts');

    it('scripts/verify-ses-dns.ts exists and contains GetEmailIdentityCommand', () => {
      expect(src).toContain('GetEmailIdentityCommand');
    });

    it('checks SPF via dns.resolveTxt', () => {
      expect(src).toMatch(/dns.*resolveTxt|resolveTxt/);
    });

    it('checks DMARC and verifies p=quarantine or p=reject', () => {
      expect(src).toContain('_dmarc');
      expect(src).toMatch(/p=quarantine|p=reject/);
    });
  });

  describe('.env.example', () => {
    const src = readFile('.env.example');

    it('contains SES_SENDING_DOMAIN placeholder', () => {
      expect(src).toContain('SES_SENDING_DOMAIN');
    });

    it('contains UPTIME_MONITOR_URL placeholder', () => {
      expect(src).toContain('UPTIME_MONITOR_URL');
    });
  });

  describe('Health endpoint', () => {
    it('health.ts checks both database and redis connectivity', () => {
      const src = readFile('packages/api/src/routes/health.ts');
      expect(src).toMatch(/getDb/);
      expect(src).toMatch(/getRedis/);
    });
  });

  describe('Health check script', () => {
    it('scripts/check-health.sh exists and curls the /health endpoint', () => {
      const src = readFile('scripts/check-health.sh');
      expect(src).toContain('/health');
      expect(src).toContain('curl');
    });
  });
});
