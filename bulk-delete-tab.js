#!/usr/bin/env node
/**
 * bulk-delete-tab.js
 * Open Offers or Newsletters → Select all → deselect KEEP rows → Delete.
 * DEFAULT DRY-RUN. Pass --live to delete.
 *
 * Usage:
 *   node bulk-delete-tab.js --tab offers
 *   node bulk-delete-tab.js --tab newsletters --live
 *
 * Pattern from transcripts: select all in Offers, then uncheck insurer /
 * bank / policy notices before deleting the rest.
 */

const path = require('path');
const fs = require('fs');
const { launchYahooBrowser, parseCliFlags, log } = require('./lib/browser');
const { URLS } = require('./lib/yahoo-urls');
const { selectors } = require('./lib/yahoo-selectors');
const { listVisibleMessages, selectedCount } = require('./lib/list-messages');
const { loadRules, classifyForDelete } = require('./lib/keep-rules');

async function main() {
  const flags = parseCliFlags();
  const tab = flags.tab || 'offers';
  if (flags.help || !['offers', 'newsletters', 'social'].includes(tab)) {
    console.log(`Usage: node bulk-delete-tab.js --tab offers|newsletters|social [--live]
Default dry-run.`);
    process.exit(0);
  }

  const rules = loadRules(require('./lib/rules-path').keepRulesPath());
  const { page, close, dryRun, userDataDir } = await launchYahooBrowser({
    dryRun: flags.dryRun,
    headless: flags.headless,
    userDataDir: flags.profile,
  });
  const sel = selectors(page);

  try {
    const url = URLS[tab]();
    log('goto', url, 'dryRun', dryRun, 'profile', userDataDir);
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForTimeout(2500);

    const rows = await listVisibleMessages(page);
    const plan = rows.map((r) => ({
      ...r,
      class: classifyForDelete(r, rules),
    }));
    const toDelete = plan.filter((r) => r.class === 'marketing');
    const toKeep = plan.filter((r) => r.class === 'keep');
    const borderline = plan.filter((r) => r.class === 'borderline');

    log('visible', rows.length, 'marketing', toDelete.length, 'keep', toKeep.length, 'borderline', borderline.length);
    borderline.forEach((b) => log('BORDERLINE (skipped)', b.name.slice(0, 120)));

    const report = { tab, dryRun, plan };
    const outPath = path.join(__dirname, 'dry-run-logs', `tab-${tab}-${Date.now()}.json`);
    fs.writeFileSync(outPath, JSON.stringify(report, null, 2));
    log('wrote', outPath);

    if (dryRun) {
      log('DRY-RUN complete — no deletions. Pass --live after reviewing the plan.');
      return;
    }

    // LIVE: select all, then uncheck KEEP (+ borderline) rows by checkbox name
    if (!(await sel.selectAll().count())) {
      throw new Error('Select all messages checkbox not found — TODO capture selector');
    }
    await sel.selectAll().click();
    await page.waitForTimeout(500);

    for (const k of [...toKeep, ...borderline]) {
      // Uncheck by matching checkbox accessible name substring (sender)
      const cb = sel.messageCheckbox(k.sender.split(/\s+/)[0] || k.sender);
      // After select-all, checked boxes may be named with full sender+subject
      const hit = page.getByRole('checkbox', { name: new RegExp(k.sender.slice(0, 24).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i') });
      const count = await hit.count();
      if (count) {
        // If checked, click to unselect
        for (let i = 0; i < count; i++) {
          const box = hit.nth(i);
          if (await box.isChecked().catch(() => true)) {
            await box.click();
            log('deselected keep/borderline', k.sender);
          }
        }
      } else {
        log('TODO: could not find checkbox to deselect', k.sender);
      }
    }

    const n = await selectedCount(page);
    if (n <= 0) {
      log('nothing left selected — abort delete');
      return;
    }
    log('deleting selected', n);
    await sel.deleteSelected().first().click();
    await page.waitForTimeout(1500);
    log('done');
  } finally {
    await close();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
