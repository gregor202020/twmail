import { createHash } from 'crypto';

const BASE_URL = process.env['BASE_URL'] ?? 'https://mail.thirdwavebbq.com.au';

/**
 * Inject a 1x1 transparent PNG tracking pixel before </body>.
 * Used for open tracking — the image request records an OPEN event.
 */
export function injectTrackingPixel(html: string, messageId: string): string {
  const pixel = `<img src="${BASE_URL}/t/o/${messageId}.png" width="1" height="1" alt="" style="display:none;" />`;

  if (html.includes('</body>')) {
    return html.replace('</body>', `${pixel}</body>`);
  }
  // If no </body> tag, append at end
  return html + pixel;
}

/**
 * Rewrite all https:// and http:// links in <a> tags for click tracking.
 * Replaces href="https://..." with href="BASE_URL/t/c/{messageId}/{linkHash}".
 * Returns { html, linkMap } where linkMap maps linkHash -> original URL.
 *
 * Skips our own tracking URLs and unsubscribe/preference URLs.
 */
export function rewriteLinks(
  html: string,
  messageId: string,
): { html: string; linkMap: Record<string, string> } {
  const linkMap: Record<string, string> = {};

  const rewritten = html.replace(/href="(https?:\/\/[^"]+)"/gi, (_match, url: string) => {
    // Don't rewrite our own tracking URLs
    if (url.startsWith(`${BASE_URL}/t/`)) {
      return _match;
    }
    // Don't rewrite unsubscribe or preference URLs
    if (url.includes('/t/u/') || url.includes('/t/preferences/')) {
      return _match;
    }
    const linkHash = hashUrl(url);
    linkMap[linkHash] = url;
    return `href="${BASE_URL}/t/c/${messageId}/${linkHash}"`;
  });

  return { html: rewritten, linkMap };
}

/**
 * Generate a short hash for a URL using SHA-256, taking the first 12 hex chars.
 */
export function hashUrl(url: string): string {
  return createHash('sha256').update(url).digest('hex').substring(0, 12);
}

/**
 * Build RFC 8058 compliant List-Unsubscribe and List-Unsubscribe-Post headers.
 * These allow mail clients to show a native one-click unsubscribe button.
 */
export function getUnsubscribeHeaders(messageId: string): Record<string, string> {
  const unsubUrl = `${BASE_URL}/t/u/${messageId}`;
  return {
    'List-Unsubscribe': `<${unsubUrl}>`,
    'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
  };
}
