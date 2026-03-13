#!/usr/bin/env node
/**
 * Seed script to insert default email templates.
 *
 * Usage:
 *   npx tsx packages/api/src/seed-templates.ts
 *   # or from packages/api:
 *   npm run seed:templates
 *
 * Environment: DATABASE_URL must be set.
 */
import { getDb, destroyDb } from '@twmail/shared';
import type { NewTemplate } from '@twmail/shared';

// ---------------------------------------------------------------------------
// Brand constants
// ---------------------------------------------------------------------------
const BLUE = '#0170B9';
const RED = '#C41E2A';
const BLACK = '#0A0A0A';
const SURFACE = '#FAFAFA';
const WHITE = '#FFFFFF';
const GRAY = '#666666';
const LIGHT_GRAY = '#EEEEEE';

// ---------------------------------------------------------------------------
// Shared partials
// ---------------------------------------------------------------------------
function headerBlock(title?: string): string {
  return `
    <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:${BLUE};">
      <tr>
        <td align="center" style="padding:24px 20px;">
          <table width="600" cellpadding="0" cellspacing="0" border="0">
            <tr>
              <td align="left" style="font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;font-size:28px;font-weight:700;color:${WHITE};letter-spacing:1px;">
                THIRD WAVE BBQ
              </td>
            </tr>
            ${title ? `<tr><td style="font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;font-size:14px;color:rgba(255,255,255,0.85);padding-top:4px;">${title}</td></tr>` : ''}
          </table>
        </td>
      </tr>
    </table>`;
}

function footerBlock(): string {
  return `
    <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:${BLACK};">
      <tr>
        <td align="center" style="padding:32px 20px;">
          <table width="600" cellpadding="0" cellspacing="0" border="0">
            <tr>
              <td align="center" style="font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;font-size:20px;font-weight:700;color:${WHITE};padding-bottom:12px;">
                THIRD WAVE BBQ
              </td>
            </tr>
            <tr>
              <td align="center" style="font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;font-size:13px;color:#999999;line-height:22px;">
                123 Smokehouse Lane, Melbourne VIC 3000<br>
                <a href="#" style="color:${BLUE};text-decoration:underline;">Website</a> &nbsp;|&nbsp;
                <a href="#" style="color:${BLUE};text-decoration:underline;">Instagram</a> &nbsp;|&nbsp;
                <a href="#" style="color:${BLUE};text-decoration:underline;">Facebook</a>
              </td>
            </tr>
            <tr>
              <td align="center" style="font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;font-size:11px;color:#777777;padding-top:16px;">
                You received this because you subscribed to Third Wave BBQ emails.<br>
                <a href="{{unsubscribe_url}}" style="color:#999999;text-decoration:underline;">Unsubscribe</a> &nbsp;|&nbsp;
                <a href="{{preferences_url}}" style="color:#999999;text-decoration:underline;">Manage Preferences</a>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>`;
}

function ctaButton(text: string, href: string = '#', bgColor: string = RED): string {
  return `
    <table cellpadding="0" cellspacing="0" border="0" style="margin:0 auto;">
      <tr>
        <td align="center" style="background-color:${bgColor};border-radius:6px;">
          <a href="${href}" target="_blank" style="display:inline-block;padding:14px 36px;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;font-size:16px;font-weight:700;color:${WHITE};text-decoration:none;letter-spacing:0.5px;">
            ${text}
          </a>
        </td>
      </tr>
    </table>`;
}

function wrapDocument(body: string, preheader: string = ''): string {
  return `<!DOCTYPE html>
<html lang="en" xmlns="http://www.w3.org/1999/xhtml" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <meta http-equiv="X-UA-Compatible" content="IE=edge">
  <meta name="x-apple-disable-message-reformatting">
  <title>Third Wave BBQ</title>
  <!--[if mso]>
  <noscript><xml><o:OfficeDocumentSettings><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml></noscript>
  <![endif]-->
  <style>
    body,table,td,a{-webkit-text-size-adjust:100%;-ms-text-size-adjust:100%;}
    table,td{mso-table-lspace:0;mso-table-rspace:0;}
    img{-ms-interpolation-mode:bicubic;border:0;height:auto;line-height:100%;outline:none;text-decoration:none;}
    body{margin:0;padding:0;width:100%!important;height:100%!important;}
    @media only screen and (max-width:620px){
      .email-container{width:100%!important;max-width:100%!important;}
      .fluid{width:100%!important;max-width:100%!important;height:auto!important;}
      .stack-column{display:block!important;width:100%!important;max-width:100%!important;}
      .stack-column-center{text-align:center!important;}
      .center-on-narrow{text-align:center!important;display:block!important;margin-left:auto!important;margin-right:auto!important;float:none!important;}
      table.center-on-narrow{display:inline-block!important;}
      .hide-mobile{display:none!important;}
    }
  </style>
</head>
<body style="margin:0;padding:0;background-color:#E5E5E5;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;">
  ${preheader ? `<div style="display:none;font-size:1px;color:#E5E5E5;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;">${preheader}</div>` : ''}
  <center style="width:100%;background-color:#E5E5E5;">
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background-color:#E5E5E5;">
      <tr>
        <td align="center" valign="top">
          <table class="email-container" role="presentation" cellpadding="0" cellspacing="0" border="0" width="600" style="max-width:600px;margin:0 auto;background-color:${WHITE};">
            <tr><td>
${body}
            </td></tr>
          </table>
        </td>
      </tr>
    </table>
  </center>
</body>
</html>`;
}

// ---------------------------------------------------------------------------
// Template 1: Newsletter - Classic
// ---------------------------------------------------------------------------
const newsletterClassic = wrapDocument(
  `
${headerBlock('Monthly Newsletter')}

<!-- Hero Image -->
<table width="100%" cellpadding="0" cellspacing="0" border="0">
  <tr>
    <td style="background-color:${LIGHT_GRAY};height:280px;" align="center">
      <table cellpadding="0" cellspacing="0" border="0">
        <tr>
          <td align="center" style="font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;font-size:14px;color:#999999;">
            [Header Image - 600 x 280]
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>

<!-- Body -->
<table width="100%" cellpadding="0" cellspacing="0" border="0">
  <tr>
    <td style="padding:36px 40px 0;">
      <h1 style="margin:0 0 12px;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;font-size:26px;font-weight:700;color:${BLACK};line-height:1.3;">
        Hey {{first_name}}, Here's What's Smokin'
      </h1>
      <p style="margin:0 0 20px;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;font-size:16px;color:${GRAY};line-height:1.6;">
        Welcome to this month's roundup from Third Wave BBQ. We've been busy in the pit, and we're excited to share what's new on the menu, upcoming events, and a few behind-the-scenes stories from the smokehouse.
      </p>
      <p style="margin:0 0 20px;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;font-size:16px;color:${GRAY};line-height:1.6;">
        Our pitmasters have been experimenting with a new cherry-wood smoked brisket that's been getting rave reviews. We've also launched our weekend brunch menu featuring smoked pulled pork eggs benedict and burnt-end hash.
      </p>
      <p style="margin:0 0 28px;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;font-size:16px;color:${GRAY};line-height:1.6;">
        Read on for all the details, or swing by this weekend to taste for yourself.
      </p>
    </td>
  </tr>
  <tr>
    <td align="center" style="padding:0 40px 36px;">
      ${ctaButton('Read the Full Story')}
    </td>
  </tr>
</table>

<!-- Divider -->
<table width="100%" cellpadding="0" cellspacing="0" border="0">
  <tr><td style="padding:0 40px;"><hr style="border:none;border-top:1px solid ${LIGHT_GRAY};margin:0;"></td></tr>
</table>

<!-- Secondary Story -->
<table width="100%" cellpadding="0" cellspacing="0" border="0">
  <tr>
    <td style="padding:28px 40px;">
      <h2 style="margin:0 0 10px;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;font-size:20px;font-weight:700;color:${BLACK};">
        Pitmaster's Tip of the Month
      </h2>
      <p style="margin:0 0 16px;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;font-size:15px;color:${GRAY};line-height:1.6;">
        Want bark that makes people stop and stare? The secret is a 50/50 blend of coarse black pepper and kosher salt, applied generously 12 hours before the cook. Let the rub form a pellicle overnight in the fridge, uncovered. Trust the process.
      </p>
      <a href="#" style="font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;font-size:15px;font-weight:600;color:${BLUE};text-decoration:underline;">
        More tips &rarr;
      </a>
    </td>
  </tr>
</table>

${footerBlock()}
`,
  "What's smokin' this month at Third Wave BBQ",
);

// ---------------------------------------------------------------------------
// Template 2: Newsletter - Two Column
// ---------------------------------------------------------------------------
const newsletterTwoColumn = wrapDocument(
  `
${headerBlock('Weekly Digest')}

<!-- Intro -->
<table width="100%" cellpadding="0" cellspacing="0" border="0">
  <tr>
    <td style="padding:32px 40px 20px;">
      <h1 style="margin:0 0 8px;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;font-size:24px;font-weight:700;color:${BLACK};">
        This Week at Third Wave BBQ
      </h1>
      <p style="margin:0;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;font-size:15px;color:${GRAY};line-height:1.5;">
        Hi {{first_name}}, here's a quick look at what's happening.
      </p>
    </td>
  </tr>
</table>

<!-- Two Column Section -->
<table width="100%" cellpadding="0" cellspacing="0" border="0">
  <tr>
    <td style="padding:0 32px 28px;" valign="top">
      <table width="100%" cellpadding="0" cellspacing="0" border="0">
        <tr>
          <!-- Left Column -->
          <td class="stack-column" width="48%" valign="top" style="padding:8px;">
            <table width="100%" cellpadding="0" cellspacing="0" border="0">
              <tr>
                <td style="background-color:${LIGHT_GRAY};height:180px;border-radius:8px;" align="center">
                  <span style="font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;font-size:13px;color:#999999;">[Image 260x180]</span>
                </td>
              </tr>
              <tr>
                <td style="padding:14px 0 0;">
                  <h3 style="margin:0 0 6px;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;font-size:17px;font-weight:700;color:${BLACK};">
                    New: Smoked Turkey Breast
                  </h3>
                  <p style="margin:0 0 10px;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;font-size:14px;color:${GRAY};line-height:1.5;">
                    Brined for 24 hours, smoked over pecan wood. Available every Friday and Saturday while supplies last. Served with our house-made cranberry-jalapeno relish.
                  </p>
                  <a href="#" style="font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;font-size:14px;font-weight:600;color:${BLUE};text-decoration:none;">
                    Learn more &rarr;
                  </a>
                </td>
              </tr>
            </table>
          </td>

          <!-- Gutter -->
          <td class="hide-mobile" width="4%">&nbsp;</td>

          <!-- Right Column -->
          <td class="stack-column" width="48%" valign="top" style="padding:8px;">
            <table width="100%" cellpadding="0" cellspacing="0" border="0">
              <tr>
                <td style="background-color:${LIGHT_GRAY};height:180px;border-radius:8px;" align="center">
                  <span style="font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;font-size:13px;color:#999999;">[Image 260x180]</span>
                </td>
              </tr>
              <tr>
                <td style="padding:14px 0 0;">
                  <h3 style="margin:0 0 6px;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;font-size:17px;font-weight:700;color:${BLACK};">
                    Live Music Saturdays
                  </h3>
                  <p style="margin:0 0 10px;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;font-size:14px;color:${GRAY};line-height:1.5;">
                    Join us every Saturday night from 7pm for live blues and soul. This week featuring The Slow Burners. Pair it with a cold one from our craft beer selection.
                  </p>
                  <a href="#" style="font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;font-size:14px;font-weight:600;color:${BLUE};text-decoration:none;">
                    See lineup &rarr;
                  </a>
                </td>
              </tr>
            </table>
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>

<!-- Divider -->
<table width="100%" cellpadding="0" cellspacing="0" border="0">
  <tr><td style="padding:0 40px;"><hr style="border:none;border-top:1px solid ${LIGHT_GRAY};margin:0;"></td></tr>
</table>

<!-- Two Column Section 2 -->
<table width="100%" cellpadding="0" cellspacing="0" border="0">
  <tr>
    <td style="padding:20px 32px 28px;" valign="top">
      <table width="100%" cellpadding="0" cellspacing="0" border="0">
        <tr>
          <td class="stack-column" width="48%" valign="top" style="padding:8px;">
            <table width="100%" cellpadding="0" cellspacing="0" border="0">
              <tr>
                <td style="background-color:${LIGHT_GRAY};height:180px;border-radius:8px;" align="center">
                  <span style="font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;font-size:13px;color:#999999;">[Image 260x180]</span>
                </td>
              </tr>
              <tr>
                <td style="padding:14px 0 0;">
                  <h3 style="margin:0 0 6px;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;font-size:17px;font-weight:700;color:${BLACK};">
                    Catering Season Is Open
                  </h3>
                  <p style="margin:0 0 10px;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;font-size:14px;color:${GRAY};line-height:1.5;">
                    Planning a party or corporate event? We bring the full pit experience to you. Custom menus, on-site smoking, and all the fixings.
                  </p>
                  <a href="#" style="font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;font-size:14px;font-weight:600;color:${BLUE};text-decoration:none;">
                    Get a quote &rarr;
                  </a>
                </td>
              </tr>
            </table>
          </td>
          <td class="hide-mobile" width="4%">&nbsp;</td>
          <td class="stack-column" width="48%" valign="top" style="padding:8px;">
            <table width="100%" cellpadding="0" cellspacing="0" border="0">
              <tr>
                <td style="background-color:${LIGHT_GRAY};height:180px;border-radius:8px;" align="center">
                  <span style="font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;font-size:13px;color:#999999;">[Image 260x180]</span>
                </td>
              </tr>
              <tr>
                <td style="padding:14px 0 0;">
                  <h3 style="margin:0 0 6px;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;font-size:17px;font-weight:700;color:${BLACK};">
                    Behind the Pit
                  </h3>
                  <p style="margin:0 0 10px;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;font-size:14px;color:${GRAY};line-height:1.5;">
                    Ever wondered what goes into a 16-hour brisket? Our head pitmaster shares the full process, from trimming to the final slice.
                  </p>
                  <a href="#" style="font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;font-size:14px;font-weight:600;color:${BLUE};text-decoration:none;">
                    Watch video &rarr;
                  </a>
                </td>
              </tr>
            </table>
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>

${footerBlock()}
`,
  'This week: new menu items, live music, and more',
);

// ---------------------------------------------------------------------------
// Template 3: Promotional - Sale
// ---------------------------------------------------------------------------
const promotionalSale = wrapDocument(
  `
${headerBlock()}

<!-- Hero Sale Banner -->
<table width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:${RED};">
  <tr>
    <td align="center" style="padding:48px 40px;">
      <table cellpadding="0" cellspacing="0" border="0">
        <tr>
          <td align="center">
            <p style="margin:0 0 8px;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;font-size:14px;font-weight:600;color:rgba(255,255,255,0.85);text-transform:uppercase;letter-spacing:3px;">
              Limited Time Offer
            </p>
            <h1 style="margin:0 0 16px;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;font-size:52px;font-weight:800;color:${WHITE};line-height:1.1;">
              20% OFF
            </h1>
            <p style="margin:0 0 6px;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;font-size:18px;color:rgba(255,255,255,0.9);line-height:1.4;">
              All catering orders placed this week
            </p>
            <p style="margin:0;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;font-size:14px;color:rgba(255,255,255,0.7);">
              Use code: <strong style="color:${WHITE};font-size:16px;">SMOKE20</strong>
            </p>
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>

<!-- Intro text -->
<table width="100%" cellpadding="0" cellspacing="0" border="0">
  <tr>
    <td style="padding:32px 40px 12px;">
      <p style="margin:0;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;font-size:16px;color:${GRAY};line-height:1.6;">
        Hey {{first_name}}, we're firing up a special deal just for our email family. Whether it's a backyard gathering or a corporate lunch, we'll bring the smoke.
      </p>
    </td>
  </tr>
</table>

<!-- Product Grid (2 col) -->
<table width="100%" cellpadding="0" cellspacing="0" border="0">
  <tr>
    <td style="padding:16px 32px 28px;">
      <table width="100%" cellpadding="0" cellspacing="0" border="0">
        <tr>
          <td class="stack-column" width="48%" valign="top" style="padding:8px;">
            <table width="100%" cellpadding="0" cellspacing="0" border="0" style="border:1px solid ${LIGHT_GRAY};border-radius:8px;overflow:hidden;">
              <tr>
                <td style="background-color:${SURFACE};height:140px;" align="center">
                  <span style="font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;font-size:13px;color:#999999;">[Product Image]</span>
                </td>
              </tr>
              <tr>
                <td style="padding:16px;">
                  <h3 style="margin:0 0 4px;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;font-size:16px;font-weight:700;color:${BLACK};">Brisket Platter</h3>
                  <p style="margin:0 0 8px;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;font-size:13px;color:${GRAY};line-height:1.4;">Feeds 8-10. Sliced brisket, two sides, pickles &amp; bread.</p>
                  <p style="margin:0;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;font-size:15px;font-weight:700;color:${RED};">
                    <s style="color:#999;font-weight:400;">$120</s> &nbsp;$96
                  </p>
                </td>
              </tr>
            </table>
          </td>
          <td class="hide-mobile" width="4%">&nbsp;</td>
          <td class="stack-column" width="48%" valign="top" style="padding:8px;">
            <table width="100%" cellpadding="0" cellspacing="0" border="0" style="border:1px solid ${LIGHT_GRAY};border-radius:8px;overflow:hidden;">
              <tr>
                <td style="background-color:${SURFACE};height:140px;" align="center">
                  <span style="font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;font-size:13px;color:#999999;">[Product Image]</span>
                </td>
              </tr>
              <tr>
                <td style="padding:16px;">
                  <h3 style="margin:0 0 4px;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;font-size:16px;font-weight:700;color:${BLACK};">Ribs &amp; Wings Combo</h3>
                  <p style="margin:0 0 8px;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;font-size:13px;color:${GRAY};line-height:1.4;">Feeds 6-8. Full rack of ribs, dozen wings, slaw &amp; beans.</p>
                  <p style="margin:0;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;font-size:15px;font-weight:700;color:${RED};">
                    <s style="color:#999;font-weight:400;">$95</s> &nbsp;$76
                  </p>
                </td>
              </tr>
            </table>
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>

<!-- CTA -->
<table width="100%" cellpadding="0" cellspacing="0" border="0">
  <tr>
    <td align="center" style="padding:8px 40px 40px;">
      ${ctaButton('Shop All Platters')}
    </td>
  </tr>
</table>

<!-- Fine print -->
<table width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:${SURFACE};">
  <tr>
    <td align="center" style="padding:16px 40px;">
      <p style="margin:0;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;font-size:12px;color:#999999;">
        Offer valid through Sunday. Cannot be combined with other promotions. Minimum order $50.
      </p>
    </td>
  </tr>
</table>

${footerBlock()}
`,
  '20% off all catering orders this week!',
);

// ---------------------------------------------------------------------------
// Template 4: Promotional - Event
// ---------------------------------------------------------------------------
const promotionalEvent = wrapDocument(
  `
${headerBlock()}

<!-- Hero Event Banner -->
<table width="100%" cellpadding="0" cellspacing="0" border="0">
  <tr>
    <td style="background-color:${SURFACE};height:260px;" align="center">
      <span style="font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;font-size:14px;color:#999999;">[Event Hero Image - 600 x 260]</span>
    </td>
  </tr>
</table>

<!-- Event Details -->
<table width="100%" cellpadding="0" cellspacing="0" border="0">
  <tr>
    <td style="padding:36px 40px 0;">
      <p style="margin:0 0 8px;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;font-size:13px;font-weight:600;color:${RED};text-transform:uppercase;letter-spacing:2px;">
        You're Invited
      </p>
      <h1 style="margin:0 0 16px;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;font-size:30px;font-weight:700;color:${BLACK};line-height:1.2;">
        Third Wave BBQ Summer Cookout
      </h1>
      <p style="margin:0 0 24px;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;font-size:16px;color:${GRAY};line-height:1.6;">
        {{first_name}}, join us for an afternoon of live fire cooking, cold drinks, and great company. Our pitmasters will be showcasing whole-hog cooking alongside guest chefs from around Melbourne.
      </p>
    </td>
  </tr>
</table>

<!-- Date/Location Cards -->
<table width="100%" cellpadding="0" cellspacing="0" border="0">
  <tr>
    <td style="padding:0 40px 28px;">
      <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:${SURFACE};border-radius:8px;">
        <tr>
          <td class="stack-column" width="50%" style="padding:24px 28px;border-right:1px solid ${LIGHT_GRAY};" valign="top">
            <p style="margin:0 0 4px;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;font-size:11px;font-weight:600;color:${BLUE};text-transform:uppercase;letter-spacing:2px;">When</p>
            <p style="margin:0 0 2px;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;font-size:18px;font-weight:700;color:${BLACK};">Saturday, March 22</p>
            <p style="margin:0;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;font-size:14px;color:${GRAY};">12:00 PM &ndash; 6:00 PM</p>
          </td>
          <td class="stack-column" width="50%" style="padding:24px 28px;" valign="top">
            <p style="margin:0 0 4px;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;font-size:11px;font-weight:600;color:${BLUE};text-transform:uppercase;letter-spacing:2px;">Where</p>
            <p style="margin:0 0 2px;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;font-size:18px;font-weight:700;color:${BLACK};">Third Wave BBQ</p>
            <p style="margin:0;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;font-size:14px;color:${GRAY};">123 Smokehouse Lane, Melbourne</p>
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>

<!-- What to expect -->
<table width="100%" cellpadding="0" cellspacing="0" border="0">
  <tr>
    <td style="padding:0 40px 12px;">
      <h2 style="margin:0 0 12px;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;font-size:18px;font-weight:700;color:${BLACK};">What to Expect</h2>
      <table cellpadding="0" cellspacing="0" border="0">
        <tr><td style="padding:6px 0;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;font-size:15px;color:${GRAY};line-height:1.5;">&#x2022; Whole-hog roast and live-fire grilling</td></tr>
        <tr><td style="padding:6px 0;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;font-size:15px;color:${GRAY};line-height:1.5;">&#x2022; Live music from The Slow Burners</td></tr>
        <tr><td style="padding:6px 0;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;font-size:15px;color:${GRAY};line-height:1.5;">&#x2022; Craft beer and cocktail bar</td></tr>
        <tr><td style="padding:6px 0;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;font-size:15px;color:${GRAY};line-height:1.5;">&#x2022; Kids' activities and face painting</td></tr>
      </table>
    </td>
  </tr>
</table>

<!-- RSVP CTA -->
<table width="100%" cellpadding="0" cellspacing="0" border="0">
  <tr>
    <td align="center" style="padding:24px 40px 12px;">
      ${ctaButton('RSVP Now - Free Entry')}
    </td>
  </tr>
  <tr>
    <td align="center" style="padding:0 40px 36px;">
      <p style="margin:0;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;font-size:13px;color:#999999;">
        Spots are limited. RSVP to guarantee your place.
      </p>
    </td>
  </tr>
</table>

${footerBlock()}
`,
  "You're invited to our Summer Cookout!",
);

// ---------------------------------------------------------------------------
// Template 5: Welcome Email
// ---------------------------------------------------------------------------
const welcomeEmail = wrapDocument(
  `
${headerBlock()}

<!-- Welcome Hero -->
<table width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:${BLUE};">
  <tr>
    <td align="center" style="padding:48px 40px;">
      <h1 style="margin:0 0 12px;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;font-size:34px;font-weight:800;color:${WHITE};line-height:1.2;">
        Welcome to the Family!
      </h1>
      <p style="margin:0;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;font-size:16px;color:rgba(255,255,255,0.85);line-height:1.5;">
        You're now part of the Third Wave BBQ crew, {{first_name}}.
      </p>
    </td>
  </tr>
</table>

<!-- Body -->
<table width="100%" cellpadding="0" cellspacing="0" border="0">
  <tr>
    <td style="padding:36px 40px 0;">
      <p style="margin:0 0 20px;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;font-size:16px;color:${GRAY};line-height:1.6;">
        Thanks for signing up. We're passionate about one thing: low-and-slow smoked meats done right. No shortcuts, no gimmicks - just quality ingredients, hardwood smoke, and time.
      </p>
      <p style="margin:0 0 20px;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;font-size:16px;color:${GRAY};line-height:1.6;">
        Here's what you can expect from us:
      </p>
    </td>
  </tr>
</table>

<!-- Benefits -->
<table width="100%" cellpadding="0" cellspacing="0" border="0">
  <tr>
    <td style="padding:0 40px;">
      <table width="100%" cellpadding="0" cellspacing="0" border="0">
        <tr>
          <td style="padding:16px 0;border-bottom:1px solid ${LIGHT_GRAY};">
            <table cellpadding="0" cellspacing="0" border="0">
              <tr>
                <td width="48" valign="top">
                  <div style="width:40px;height:40px;background-color:${SURFACE};border-radius:50%;text-align:center;line-height:40px;font-size:18px;">&#x2709;</div>
                </td>
                <td style="padding-left:12px;" valign="top">
                  <h3 style="margin:0 0 4px;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;font-size:15px;font-weight:700;color:${BLACK};">Weekly Updates</h3>
                  <p style="margin:0;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;font-size:14px;color:${GRAY};line-height:1.5;">Menu specials, events, and stories from the pit.</p>
                </td>
              </tr>
            </table>
          </td>
        </tr>
        <tr>
          <td style="padding:16px 0;border-bottom:1px solid ${LIGHT_GRAY};">
            <table cellpadding="0" cellspacing="0" border="0">
              <tr>
                <td width="48" valign="top">
                  <div style="width:40px;height:40px;background-color:${SURFACE};border-radius:50%;text-align:center;line-height:40px;font-size:18px;">&#x2605;</div>
                </td>
                <td style="padding-left:12px;" valign="top">
                  <h3 style="margin:0 0 4px;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;font-size:15px;font-weight:700;color:${BLACK};">Subscriber-Only Deals</h3>
                  <p style="margin:0;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;font-size:14px;color:${GRAY};line-height:1.5;">Exclusive discounts and early access to events.</p>
                </td>
              </tr>
            </table>
          </td>
        </tr>
        <tr>
          <td style="padding:16px 0;">
            <table cellpadding="0" cellspacing="0" border="0">
              <tr>
                <td width="48" valign="top">
                  <div style="width:40px;height:40px;background-color:${SURFACE};border-radius:50%;text-align:center;line-height:40px;font-size:18px;">&#x270D;</div>
                </td>
                <td style="padding-left:12px;" valign="top">
                  <h3 style="margin:0 0 4px;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;font-size:15px;font-weight:700;color:${BLACK};">Pitmaster Recipes &amp; Tips</h3>
                  <p style="margin:0;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;font-size:14px;color:${GRAY};line-height:1.5;">Learn the craft with guides from our team.</p>
                </td>
              </tr>
            </table>
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>

<!-- CTA -->
<table width="100%" cellpadding="0" cellspacing="0" border="0">
  <tr>
    <td align="center" style="padding:32px 40px 40px;">
      ${ctaButton('Check Out Our Menu')}
    </td>
  </tr>
</table>

${footerBlock()}
`,
  'Welcome to Third Wave BBQ!',
);

// ---------------------------------------------------------------------------
// Template 6: Order Confirmation
// ---------------------------------------------------------------------------
const orderConfirmation = wrapDocument(
  `
${headerBlock('Order Confirmation')}

<!-- Confirmation Badge -->
<table width="100%" cellpadding="0" cellspacing="0" border="0">
  <tr>
    <td align="center" style="padding:36px 40px 8px;">
      <div style="width:64px;height:64px;background-color:#E8F5E9;border-radius:50%;text-align:center;line-height:64px;font-size:32px;">&#x2713;</div>
    </td>
  </tr>
  <tr>
    <td align="center" style="padding:12px 40px 0;">
      <h1 style="margin:0 0 8px;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;font-size:26px;font-weight:700;color:${BLACK};">
        Order Confirmed!
      </h1>
      <p style="margin:0;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;font-size:15px;color:${GRAY};">
        Thanks for your order, {{first_name}}. Here are the details.
      </p>
    </td>
  </tr>
</table>

<!-- Order Info -->
<table width="100%" cellpadding="0" cellspacing="0" border="0">
  <tr>
    <td style="padding:28px 40px 0;">
      <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:${SURFACE};border-radius:8px;">
        <tr>
          <td style="padding:20px 24px;">
            <table width="100%" cellpadding="0" cellspacing="0" border="0">
              <tr>
                <td style="font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;font-size:12px;font-weight:600;color:${BLUE};text-transform:uppercase;letter-spacing:1px;padding-bottom:4px;">Order Number</td>
                <td align="right" style="font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;font-size:12px;font-weight:600;color:${BLUE};text-transform:uppercase;letter-spacing:1px;padding-bottom:4px;">Date</td>
              </tr>
              <tr>
                <td style="font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;font-size:16px;font-weight:700;color:${BLACK};">{{order_number}}</td>
                <td align="right" style="font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;font-size:16px;color:${BLACK};">{{order_date}}</td>
              </tr>
            </table>
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>

<!-- Order Details Table -->
<table width="100%" cellpadding="0" cellspacing="0" border="0">
  <tr>
    <td style="padding:24px 40px;">
      <table width="100%" cellpadding="0" cellspacing="0" border="0">
        <!-- Header -->
        <tr>
          <td style="padding:10px 0;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;font-size:12px;font-weight:600;color:${BLACK};text-transform:uppercase;letter-spacing:1px;border-bottom:2px solid ${BLACK};">Item</td>
          <td align="center" style="padding:10px 0;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;font-size:12px;font-weight:600;color:${BLACK};text-transform:uppercase;letter-spacing:1px;border-bottom:2px solid ${BLACK};">Qty</td>
          <td align="right" style="padding:10px 0;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;font-size:12px;font-weight:600;color:${BLACK};text-transform:uppercase;letter-spacing:1px;border-bottom:2px solid ${BLACK};">Price</td>
        </tr>
        <!-- Item 1 -->
        <tr>
          <td style="padding:14px 0;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;font-size:15px;color:${BLACK};border-bottom:1px solid ${LIGHT_GRAY};">Smoked Brisket Platter</td>
          <td align="center" style="padding:14px 0;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;font-size:15px;color:${GRAY};border-bottom:1px solid ${LIGHT_GRAY};">1</td>
          <td align="right" style="padding:14px 0;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;font-size:15px;color:${BLACK};border-bottom:1px solid ${LIGHT_GRAY};">$24.00</td>
        </tr>
        <!-- Item 2 -->
        <tr>
          <td style="padding:14px 0;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;font-size:15px;color:${BLACK};border-bottom:1px solid ${LIGHT_GRAY};">Pork Ribs (Half Rack)</td>
          <td align="center" style="padding:14px 0;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;font-size:15px;color:${GRAY};border-bottom:1px solid ${LIGHT_GRAY};">2</td>
          <td align="right" style="padding:14px 0;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;font-size:15px;color:${BLACK};border-bottom:1px solid ${LIGHT_GRAY};">$38.00</td>
        </tr>
        <!-- Item 3 -->
        <tr>
          <td style="padding:14px 0;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;font-size:15px;color:${BLACK};border-bottom:1px solid ${LIGHT_GRAY};">Mac &amp; Cheese (Large)</td>
          <td align="center" style="padding:14px 0;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;font-size:15px;color:${GRAY};border-bottom:1px solid ${LIGHT_GRAY};">1</td>
          <td align="right" style="padding:14px 0;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;font-size:15px;color:${BLACK};border-bottom:1px solid ${LIGHT_GRAY};">$12.00</td>
        </tr>
        <!-- Total -->
        <tr>
          <td colspan="2" style="padding:16px 0 0;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;font-size:16px;font-weight:700;color:${BLACK};">Total</td>
          <td align="right" style="padding:16px 0 0;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;font-size:18px;font-weight:700;color:${RED};">$74.00</td>
        </tr>
      </table>
    </td>
  </tr>
</table>

<!-- Pickup Info -->
<table width="100%" cellpadding="0" cellspacing="0" border="0">
  <tr>
    <td style="padding:0 40px 28px;">
      <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:${SURFACE};border-radius:8px;">
        <tr>
          <td style="padding:20px 24px;">
            <h3 style="margin:0 0 8px;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;font-size:14px;font-weight:700;color:${BLACK};">Pickup Details</h3>
            <p style="margin:0;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;font-size:14px;color:${GRAY};line-height:1.6;">
              <strong>Location:</strong> Third Wave BBQ, 123 Smokehouse Lane<br>
              <strong>Date:</strong> {{pickup_date}}<br>
              <strong>Time:</strong> {{pickup_time}}
            </p>
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>

<!-- CTA -->
<table width="100%" cellpadding="0" cellspacing="0" border="0">
  <tr>
    <td align="center" style="padding:0 40px 36px;">
      ${ctaButton('View Order Status', '#', BLUE)}
    </td>
  </tr>
</table>

${footerBlock()}
`,
  'Your Third Wave BBQ order is confirmed!',
);

// ---------------------------------------------------------------------------
// Template 7: Announcement
// ---------------------------------------------------------------------------
const announcement = wrapDocument(
  `
${headerBlock()}

<!-- Hero -->
<table width="100%" cellpadding="0" cellspacing="0" border="0">
  <tr>
    <td style="background-color:${SURFACE};height:300px;" align="center">
      <span style="font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;font-size:14px;color:#999999;">[Hero Image - 600 x 300]</span>
    </td>
  </tr>
</table>

<!-- Announcement Content -->
<table width="100%" cellpadding="0" cellspacing="0" border="0">
  <tr>
    <td style="padding:36px 40px 0;">
      <p style="margin:0 0 10px;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;font-size:13px;font-weight:600;color:${RED};text-transform:uppercase;letter-spacing:2px;">
        New on the Menu
      </p>
      <h1 style="margin:0 0 16px;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;font-size:30px;font-weight:800;color:${BLACK};line-height:1.2;">
        Introducing Our Smoked Short Rib Sandwich
      </h1>
      <p style="margin:0 0 20px;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;font-size:16px;color:${GRAY};line-height:1.6;">
        {{first_name}}, we've been working on this one for months, and we're finally ready to share it. Our new smoked short rib sandwich features 12-hour oak-smoked beef short ribs, house-pickled red onions, horseradish cream, and crispy tobacco onions - all stacked on a toasted brioche bun.
      </p>
      <p style="margin:0 0 20px;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;font-size:16px;color:${GRAY};line-height:1.6;">
        It's the kind of sandwich that stops conversations. Rich, smoky, and utterly indulgent. Available starting this Friday at all locations.
      </p>
    </td>
  </tr>
</table>

<!-- Highlight Box -->
<table width="100%" cellpadding="0" cellspacing="0" border="0">
  <tr>
    <td style="padding:0 40px 28px;">
      <table width="100%" cellpadding="0" cellspacing="0" border="0" style="border-left:4px solid ${RED};background-color:${SURFACE};border-radius:0 8px 8px 0;">
        <tr>
          <td style="padding:20px 24px;">
            <p style="margin:0 0 4px;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;font-size:13px;font-weight:600;color:${RED};text-transform:uppercase;letter-spacing:1px;">Launch Special</p>
            <p style="margin:0;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;font-size:16px;color:${BLACK};line-height:1.5;">
              Order any two sandwiches this opening weekend and get a free side. Just mention "Third Wave Insider" at the counter.
            </p>
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>

<!-- CTA -->
<table width="100%" cellpadding="0" cellspacing="0" border="0">
  <tr>
    <td align="center" style="padding:0 40px 40px;">
      ${ctaButton('See the Full Menu')}
    </td>
  </tr>
</table>

${footerBlock()}
`,
  'Something new is coming off the smoker...',
);

// ---------------------------------------------------------------------------
// Template 8: Re-engagement
// ---------------------------------------------------------------------------
const reengagement = wrapDocument(
  `
${headerBlock()}

<!-- Hero -->
<table width="100%" cellpadding="0" cellspacing="0" border="0">
  <tr>
    <td align="center" style="padding:48px 40px 16px;">
      <div style="font-size:64px;line-height:1;">&#x1F44B;</div>
    </td>
  </tr>
  <tr>
    <td align="center" style="padding:0 40px;">
      <h1 style="margin:0 0 12px;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;font-size:30px;font-weight:800;color:${BLACK};line-height:1.2;">
        We Miss You, {{first_name}}!
      </h1>
      <p style="margin:0 0 24px;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;font-size:16px;color:${GRAY};line-height:1.6;max-width:460px;">
        It's been a while since we've seen you, and the pit just isn't the same without you. A lot has changed since your last visit - new menu items, new sides, and our sauce game has levelled up.
      </p>
    </td>
  </tr>
</table>

<!-- What's new -->
<table width="100%" cellpadding="0" cellspacing="0" border="0">
  <tr>
    <td style="padding:0 40px 28px;">
      <h2 style="margin:0 0 16px;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;font-size:18px;font-weight:700;color:${BLACK};text-align:center;">
        Here's What You've Been Missing
      </h2>
      <table width="100%" cellpadding="0" cellspacing="0" border="0">
        <tr>
          <td class="stack-column" width="33%" align="center" style="padding:8px;" valign="top">
            <table cellpadding="0" cellspacing="0" border="0" style="background-color:${SURFACE};border-radius:8px;width:100%;">
              <tr>
                <td align="center" style="padding:24px 16px;">
                  <div style="width:48px;height:48px;background-color:${LIGHT_GRAY};border-radius:50%;text-align:center;line-height:48px;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;font-size:22px;color:${RED};font-weight:700;">1</div>
                  <h3 style="margin:12px 0 6px;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;font-size:14px;font-weight:700;color:${BLACK};">New Smoker</h3>
                  <p style="margin:0;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;font-size:13px;color:${GRAY};line-height:1.4;">Custom-built offset smoker for even better bark.</p>
                </td>
              </tr>
            </table>
          </td>
          <td class="stack-column" width="33%" align="center" style="padding:8px;" valign="top">
            <table cellpadding="0" cellspacing="0" border="0" style="background-color:${SURFACE};border-radius:8px;width:100%;">
              <tr>
                <td align="center" style="padding:24px 16px;">
                  <div style="width:48px;height:48px;background-color:${LIGHT_GRAY};border-radius:50%;text-align:center;line-height:48px;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;font-size:22px;color:${RED};font-weight:700;">2</div>
                  <h3 style="margin:12px 0 6px;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;font-size:14px;font-weight:700;color:${BLACK};">5 New Items</h3>
                  <p style="margin:0;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;font-size:13px;color:${GRAY};line-height:1.4;">Including wagyu brisket and smoked lamb ribs.</p>
                </td>
              </tr>
            </table>
          </td>
          <td class="stack-column" width="33%" align="center" style="padding:8px;" valign="top">
            <table cellpadding="0" cellspacing="0" border="0" style="background-color:${SURFACE};border-radius:8px;width:100%;">
              <tr>
                <td align="center" style="padding:24px 16px;">
                  <div style="width:48px;height:48px;background-color:${LIGHT_GRAY};border-radius:50%;text-align:center;line-height:48px;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;font-size:22px;color:${RED};font-weight:700;">3</div>
                  <h3 style="margin:12px 0 6px;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;font-size:14px;font-weight:700;color:${BLACK};">Craft Taps</h3>
                  <p style="margin:0;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;font-size:13px;color:${GRAY};line-height:1.4;">12 rotating taps of local craft beer.</p>
                </td>
              </tr>
            </table>
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>

<!-- Offer -->
<table width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:${RED};">
  <tr>
    <td align="center" style="padding:28px 40px;">
      <h2 style="margin:0 0 8px;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;font-size:22px;font-weight:700;color:${WHITE};">
        Come Back &amp; Get 15% Off
      </h2>
      <p style="margin:0 0 20px;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;font-size:15px;color:rgba(255,255,255,0.85);">
        Use code <strong>COMEBACK15</strong> on your next order. Valid for 14 days.
      </p>
      ${ctaButton('Order Now', '#', WHITE).replace(`color:${WHITE}`, `color:${RED}`)}
    </td>
  </tr>
</table>

<!-- Opt out -->
<table width="100%" cellpadding="0" cellspacing="0" border="0">
  <tr>
    <td align="center" style="padding:24px 40px;">
      <p style="margin:0;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;font-size:13px;color:#999999;">
        Not interested anymore? No hard feelings.<br>
        <a href="{{unsubscribe_url}}" style="color:${BLUE};text-decoration:underline;">Unsubscribe from all emails</a>
      </p>
    </td>
  </tr>
</table>

${footerBlock()}
`,
  'We miss you! Come back for 15% off',
);

// ---------------------------------------------------------------------------
// Template 9: Feedback Request
// ---------------------------------------------------------------------------
const feedbackRequest = wrapDocument(
  `
${headerBlock()}

<!-- Body -->
<table width="100%" cellpadding="0" cellspacing="0" border="0">
  <tr>
    <td style="padding:40px 40px 0;">
      <h1 style="margin:0 0 12px;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;font-size:26px;font-weight:700;color:${BLACK};line-height:1.3;">
        How Was Your Visit, {{first_name}}?
      </h1>
      <p style="margin:0 0 24px;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;font-size:16px;color:${GRAY};line-height:1.6;">
        We hope you enjoyed your recent meal at Third Wave BBQ. Your feedback means the world to us - it helps our team keep improving and making sure every plate that comes off the pit is worthy of your time.
      </p>
      <p style="margin:0 0 8px;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;font-size:15px;font-weight:600;color:${BLACK};">
        How would you rate your experience?
      </p>
    </td>
  </tr>
</table>

<!-- Star Rating -->
<table width="100%" cellpadding="0" cellspacing="0" border="0">
  <tr>
    <td align="center" style="padding:16px 40px 28px;">
      <table cellpadding="0" cellspacing="0" border="0">
        <tr>
          <td align="center" style="padding:0 6px;">
            <a href="#" style="text-decoration:none;">
              <table cellpadding="0" cellspacing="0" border="0" style="background-color:${SURFACE};border-radius:8px;">
                <tr>
                  <td align="center" style="padding:16px 20px;">
                    <div style="font-size:28px;line-height:1;">&#x2605;</div>
                    <p style="margin:6px 0 0;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;font-size:12px;font-weight:600;color:${GRAY};">1</p>
                  </td>
                </tr>
              </table>
            </a>
          </td>
          <td align="center" style="padding:0 6px;">
            <a href="#" style="text-decoration:none;">
              <table cellpadding="0" cellspacing="0" border="0" style="background-color:${SURFACE};border-radius:8px;">
                <tr>
                  <td align="center" style="padding:16px 20px;">
                    <div style="font-size:28px;line-height:1;">&#x2605;</div>
                    <p style="margin:6px 0 0;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;font-size:12px;font-weight:600;color:${GRAY};">2</p>
                  </td>
                </tr>
              </table>
            </a>
          </td>
          <td align="center" style="padding:0 6px;">
            <a href="#" style="text-decoration:none;">
              <table cellpadding="0" cellspacing="0" border="0" style="background-color:${SURFACE};border-radius:8px;">
                <tr>
                  <td align="center" style="padding:16px 20px;">
                    <div style="font-size:28px;line-height:1;">&#x2605;</div>
                    <p style="margin:6px 0 0;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;font-size:12px;font-weight:600;color:${GRAY};">3</p>
                  </td>
                </tr>
              </table>
            </a>
          </td>
          <td align="center" style="padding:0 6px;">
            <a href="#" style="text-decoration:none;">
              <table cellpadding="0" cellspacing="0" border="0" style="background-color:${SURFACE};border-radius:8px;">
                <tr>
                  <td align="center" style="padding:16px 20px;">
                    <div style="font-size:28px;line-height:1;">&#x2605;</div>
                    <p style="margin:6px 0 0;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;font-size:12px;font-weight:600;color:${GRAY};">4</p>
                  </td>
                </tr>
              </table>
            </a>
          </td>
          <td align="center" style="padding:0 6px;">
            <a href="#" style="text-decoration:none;">
              <table cellpadding="0" cellspacing="0" border="0" style="background-color:${SURFACE};border-radius:8px;">
                <tr>
                  <td align="center" style="padding:16px 20px;">
                    <div style="font-size:28px;line-height:1;">&#x2605;</div>
                    <p style="margin:6px 0 0;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;font-size:12px;font-weight:600;color:${GRAY};">5</p>
                  </td>
                </tr>
              </table>
            </a>
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>

<!-- Divider -->
<table width="100%" cellpadding="0" cellspacing="0" border="0">
  <tr><td style="padding:0 40px;"><hr style="border:none;border-top:1px solid ${LIGHT_GRAY};margin:0;"></td></tr>
</table>

<!-- Detailed survey CTA -->
<table width="100%" cellpadding="0" cellspacing="0" border="0">
  <tr>
    <td style="padding:24px 40px;">
      <p style="margin:0 0 20px;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;font-size:15px;color:${GRAY};line-height:1.6;">
        Want to tell us more? Our quick 2-minute survey covers food quality, service, and atmosphere. As a thank you, you'll be entered to win a $50 Third Wave BBQ gift card.
      </p>
    </td>
  </tr>
  <tr>
    <td align="center" style="padding:0 40px 36px;">
      ${ctaButton('Take the Survey', '#', BLUE)}
    </td>
  </tr>
</table>

${footerBlock()}
`,
  'How was your Third Wave BBQ experience?',
);

// ---------------------------------------------------------------------------
// Template 10: Plain Text Style
// ---------------------------------------------------------------------------
const plainTextStyle = wrapDocument(
  `
<!-- Simple plain-text style email -->
<table width="100%" cellpadding="0" cellspacing="0" border="0">
  <tr>
    <td style="padding:40px 40px 0;">
      <p style="margin:0 0 24px;font-family:Georgia,'Times New Roman',serif;font-size:16px;color:${BLACK};line-height:1.7;">
        Hey {{first_name}},
      </p>
      <p style="margin:0 0 20px;font-family:Georgia,'Times New Roman',serif;font-size:16px;color:#333333;line-height:1.7;">
        Just a quick note from me (Greg, the guy usually covered in smoke behind the pit at Third Wave BBQ).
      </p>
      <p style="margin:0 0 20px;font-family:Georgia,'Times New Roman',serif;font-size:16px;color:#333333;line-height:1.7;">
        I wanted to personally thank you for being part of our community. Running a BBQ restaurant is a labour of love, and it's people like you who make it all worthwhile. Every time someone walks through our doors, or orders online, or tells a friend about us - that means the world.
      </p>
      <p style="margin:0 0 20px;font-family:Georgia,'Times New Roman',serif;font-size:16px;color:#333333;line-height:1.7;">
        I'm writing because we've got some exciting things in the works that I wanted to share before we announce publicly. We're expanding our weekend hours, adding a dedicated kids' menu, and - this is the big one - we're opening a second location in Fitzroy later this year.
      </p>
      <p style="margin:0 0 20px;font-family:Georgia,'Times New Roman',serif;font-size:16px;color:#333333;line-height:1.7;">
        If you have any thoughts, ideas, or just want to say g'day, hit reply. I read every email.
      </p>
      <p style="margin:0 0 6px;font-family:Georgia,'Times New Roman',serif;font-size:16px;color:#333333;line-height:1.7;">
        Talk soon,
      </p>
      <p style="margin:0 0 4px;font-family:Georgia,'Times New Roman',serif;font-size:16px;font-weight:700;color:${BLACK};line-height:1.7;">
        Greg
      </p>
      <p style="margin:0 0 0;font-family:Georgia,'Times New Roman',serif;font-size:14px;color:${GRAY};line-height:1.7;">
        Founder &amp; Head Pitmaster, Third Wave BBQ
      </p>
    </td>
  </tr>
</table>

<!-- Minimal divider -->
<table width="100%" cellpadding="0" cellspacing="0" border="0">
  <tr>
    <td style="padding:28px 40px 0;">
      <hr style="border:none;border-top:1px solid ${LIGHT_GRAY};margin:0;">
    </td>
  </tr>
</table>

<!-- Simple footer -->
<table width="100%" cellpadding="0" cellspacing="0" border="0">
  <tr>
    <td style="padding:20px 40px 32px;">
      <p style="margin:0 0 6px;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;font-size:13px;color:#999999;line-height:1.6;">
        Third Wave BBQ &middot; 123 Smokehouse Lane, Melbourne VIC 3000
      </p>
      <p style="margin:0;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;font-size:12px;color:#AAAAAA;line-height:1.6;">
        <a href="{{unsubscribe_url}}" style="color:#999999;text-decoration:underline;">Unsubscribe</a> &nbsp;|&nbsp;
        <a href="{{preferences_url}}" style="color:#999999;text-decoration:underline;">Email Preferences</a>
      </p>
    </td>
  </tr>
</table>
`,
  'A personal note from Greg at Third Wave BBQ',
);

// ---------------------------------------------------------------------------
// Template definitions
// ---------------------------------------------------------------------------
interface TemplateDef {
  name: string;
  category: string;
  content_html: string;
}

const templates: TemplateDef[] = [
  { name: 'Newsletter - Classic', category: 'Newsletter', content_html: newsletterClassic },
  { name: 'Newsletter - Two Column', category: 'Newsletter', content_html: newsletterTwoColumn },
  { name: 'Promotional - Sale', category: 'Promotional', content_html: promotionalSale },
  { name: 'Promotional - Event', category: 'Promotional', content_html: promotionalEvent },
  { name: 'Welcome Email', category: 'Transactional', content_html: welcomeEmail },
  { name: 'Order Confirmation', category: 'Transactional', content_html: orderConfirmation },
  { name: 'Announcement', category: 'Announcement', content_html: announcement },
  { name: 'Re-engagement', category: 'Re-engagement', content_html: reengagement },
  { name: 'Feedback Request', category: 'Feedback', content_html: feedbackRequest },
  { name: 'Plain Text Style', category: 'Minimal', content_html: plainTextStyle },
];

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main() {
  const db = getDb();

  // Check if default templates already exist
  const existing = await db.selectFrom('templates').select('id').where('is_default', '=', true).executeTakeFirst();

  if (existing) {
    console.log('Default templates already exist. Skipping seed.');
    await destroyDb();
    process.exit(0);
  }

  // Build insert values
  const rows: NewTemplate[] = templates.map((t) => ({
    name: t.name,
    category: t.category,
    content_html: t.content_html,
    content_json: {},
    thumbnail_url: null,
    is_default: true,
  }));

  const inserted = await db.insertInto('templates').values(rows).returning(['id', 'name', 'category']).execute();

  console.log(`Inserted ${inserted.length} default templates:`);
  for (const t of inserted) {
    console.log(`  [${t.id}] ${t.name} (${t.category})`);
  }

  await destroyDb();
  process.exit(0);
}

main().catch((err) => {
  console.error('Seed failed:', err.message);
  process.exit(1);
});
