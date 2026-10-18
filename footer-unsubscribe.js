#!/usr/bin/env node
/**
 * footer-unsubscribe.js
 * Open one message for a sender → scroll to footer → click real Unsubscribe <a>
 * (brand page). NEVER click Yahoo's one-click Unsubscribe button.
 *
 * DEFAULT DRY-RUN: opens message and reports candidate footer links only.
 *
 * Usage:
 *   node footer-unsubscribe.js --sender "Example Newsletter"
 *   node footer-unsubscribe.js --sender "Example Newsletter" --live
 *
 * Completes simple confirm forms when obvious; skips CAPTCHA/login walls.
 * Does NOT send email. Does NOT enter passwords.
 *
 * Prefer: require('./footer-unsubscribe').run(opts)
 */

// HARD GUARD: refuse every run (live or dry-run) before any browser/Yahoo access.
require('./lib/guard').refuse('footer-unsub');

const path = require('path');
const fs = require('fs');
const { launchYahooBrowser, parseCliFlags, log, assertNotLoginWall } = require('./lib/browser');
const { URLS } = require('./lib/yahoo-urls');
const { selectors } = require('./lib/yahoo-selectors');

function score(c) {
  const h = (c.href || '').toLowerCase();
  const t = (c.text || '').toLowerCase();
  let s = 0;
  if (/unsub|optout|opt-out|preference/.test(h)) s += 5;
  if (/unsubscribe/.test(t)) s += 3;
  if (/yahoo\.com|mail\.yahoo/.test(h)) s -= 10; // avoid Yahoo client links
  if (/^mailto:/.test(h)) s -= 5; // policy: no send without ask — skip mailto unsub
  return s;
}

function cssEscape(s) {
  return s.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

/**
 * @param {object} opts
 * @param {string} opts.sender
 * @param {boolean} [opts.dryRun=true]
 * @param {boolean} [opts.headless]
 * @param {string} [opts.profile]
 * @param {boolean} [opts.writeLog=true]
 */
async function run(opts = {}) {
  if (!opts.sender) {
    throw new Error('sender is required');
  }
  const dryRun = opts.dryRun !== false;

  const { page, context, close, userDataDir } = await launchYahooBrowser({
    dryRun,
    headless: opts.headless === true,
    userDataDir: opts.profile,
  });
  const sel = selectors(page);

  try {
    const url = URLS.search(opts.sender);
    log('goto', url, 'dryRun', dryRun, 'profile', userDataDir);
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForTimeout(2500);
    await assertNotLoginWall(page);

    const msg = page
      .getByRole('link', {
        name: new RegExp(opts.sender.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'),
      })
      .first();
    if (!(await msg.count())) {
      throw new Error(`No message link matching sender "${opts.sender}"`);
    }
    await msg.click();
    await page.waitForTimeout(2000);

    // Collect candidate unsubscribe anchors (footer preference: href contains unsub)
    // TODO: Yahoo may render body in iframe — probe frames on next live pass.
    const frames = [page, ...page.frames().filter((f) => f !== page.mainFrame())];
    const candidates = [];
    for (const frame of frames) {
      const anchors = frame.locator('a').filter({
        hasText: /unsubscribe|opt[-\s]?out|manage (email|preferences)/i,
      });
      const n = await anchors.count().catch(() => 0);
      for (let i = 0; i < n; i++) {
        const a = anchors.nth(i);
        const href = await a.getAttribute('href').catch(() => null);
        const text = (await a.innerText().catch(() => '')).trim();
        candidates.push({ href, text, frameUrl: frame.url() });
      }
    }

    const ranked = candidates.filter((c) => c.href).sort((a, b) => score(b) - score(a));

    log('candidates', ranked.length);
    ranked.slice(0, 10).forEach((c, i) => log(`  [${i}]`, c.text.slice(0, 40), c.href.slice(0, 120)));

    const report = {
      sender: opts.sender,
      dryRun,
      candidates: ranked,
      unsubscribed: false,
      errors: [],
    };

    if (opts.writeLog !== false) {
      const outPath = path.join(__dirname, 'dry-run-logs', `unsub-${Date.now()}.json`);
      fs.writeFileSync(outPath, JSON.stringify(report, null, 2));
      log('wrote', outPath);
    }

    if (dryRun) {
      log('DRY-RUN: not clicking. Pass --live to open best footer link.');
      return {
        ...report,
        summary: `footer-unsub: dry-run — ${ranked.length} candidate link(s) for "${opts.sender}"`,
      };
    }

    const best = ranked.find((c) => score(c) > 0);
    if (!best) {
      log('No suitable footer unsubscribe link — abort (do NOT use Yahoo one-click).');
      report.errors.push('no suitable footer unsubscribe link');
      return {
        ...report,
        summary: `footer-unsub: no suitable footer link for "${opts.sender}" (Yahoo one-click not used)`,
      };
    }

    const [popup] = await Promise.all([
      context.waitForEvent('page', { timeout: 5000 }).catch(() => null),
      page
        .locator(`a[href="${cssEscape(best.href)}"]`)
        .first()
        .click({ timeout: 5000 })
        .catch(async () => {
          await page.goto(best.href, { waitUntil: 'domcontentloaded' });
        }),
    ]);
    const target = popup || page;
    await target.waitForTimeout(2000);
    log('unsub page', target.url());

    // Simple confirm: email field + submit if present — NEVER fill passwords
    const email = process.env.YAHOO_EMAIL || '';
    if (!email) {
      log('skip fill: set YAHOO_EMAIL to prefill unsubscribe forms (optional)');
    } else {
      const emailInput = target.getByLabel(/email/i).or(target.locator('input[type="email"]'));
      if (await emailInput.count()) {
        await emailInput.first().fill(email);
        log('filled email confirm');
      }
    }
    const submit = target.getByRole('button', { name: /unsubscribe|confirm|submit|save/i });
    if (await submit.count()) {
      if (await target.locator('iframe[src*="captcha"], .g-recaptcha').count()) {
        log('CAPTCHA detected — skip and report');
        report.errors.push('captcha');
        return {
          ...report,
          summary: `footer-unsub: CAPTCHA on brand page for "${opts.sender}" — skipped`,
        };
      }
      await submit.first().click();
      await target.waitForTimeout(2000);
      log('clicked confirm', target.url());
    }

    report.unsubscribed = true;
    report.href = best.href;
    return {
      ...report,
      summary: `footer-unsub: clicked footer unsub for "${opts.sender}"`,
    };
  } finally {
    await close();
  }
}

async function main() {
  const flags = parseCliFlags();
  if (flags.help || !flags.sender) {
    console.log(`Usage: node footer-unsubscribe.js --sender "Brand" [--live]
Dry-run lists footer unsubscribe hrefs; --live clicks the best candidate.`);
    process.exit(flags.sender ? 0 : 1);
  }

  const result = await run({
    sender: flags.sender,
    dryRun: flags.dryRun,
    headless: flags.headless,
    profile: flags.profile,
  });
  console.log(JSON.stringify(result, null, 2));
  console.error(result.summary);
}

if (require.main === module) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}

module.exports = { run, score };
