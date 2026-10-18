#!/usr/bin/env node
/**
 * scan-marketing.js
 * Open Offers / Newsletters / Primary and group visible messages by sender.
 * READ-ONLY — never deletes or unsubscribes.
 *
 * Usage:
 *   node scan-marketing.js [--tab offers|newsletters|priority|all|social] [--limit N]
 *
 * Prefer: require('./scan-marketing').run(opts)
 */

const { launchYahooBrowser, parseCliFlags, log, assertNotLoginWall } = require('./lib/browser');
const { URLS, TABS } = require('./lib/yahoo-urls');
const { listVisibleMessages } = require('./lib/list-messages');
const { loadRules, classifyForDelete } = require('./lib/keep-rules');
const path = require('path');
const fs = require('fs');

async function scanTab(page, tab) {
  const urlKey = tab === 'priority' ? 'primary' : tab;
  const url = URLS[urlKey] ? URLS[urlKey]() : URLS.offers();
  log('navigate', url);
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(2500); // TODO: replace with networkidle / list ready selector
  await assertNotLoginWall(page);
  const rows = await listVisibleMessages(page);
  return rows;
}

function groupBySender(rows) {
  const map = new Map();
  for (const r of rows) {
    const key = r.sender || '(unknown)';
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(r);
  }
  return [...map.entries()]
    .map(([sender, items]) => ({
      sender,
      count: items.length,
      unread: items.filter((i) => i.unread).length,
      examples: items.slice(0, 3).map((i) => i.subject || i.name),
    }))
    .sort((a, b) => b.count - a.count);
}

/**
 * @param {object} opts
 * @param {string} [opts.tab] offers|newsletters|priority|all|social — omit to scan offers+newsletters+priority
 * @param {number} [opts.limit]
 * @param {boolean} [opts.headless]
 * @param {string} [opts.profile]
 * @param {boolean} [opts.writeLog=true]
 */
async function run(opts = {}) {
  const rulesPath = require('./lib/rules-path').keepRulesPath();
  const rules = fs.existsSync(rulesPath) ? loadRules(rulesPath) : null;

  const tabs = opts.tab
    ? [opts.tab === 'priority' ? 'priority' : opts.tab]
    : ['offers', 'newsletters', 'priority'];

  const { page, close, dryRun, userDataDir } = await launchYahooBrowser({
    dryRun: true, // always dry for scan
    headless: opts.headless === true,
    userDataDir: opts.profile,
  });

  try {
    log('profile', userDataDir, 'dryRun', dryRun);
    const report = {};
    let totalVisible = 0;
    let totalSenders = 0;
    let clearMarketing = 0;

    for (const tab of tabs) {
      const normalized = tab === 'priority' ? 'priority' : tab;
      if (!TABS.includes(normalized) && normalized !== 'priority') {
        log('skip unknown tab', tab);
        continue;
      }
      const rows = await scanTab(page, normalized);
      const limited = opts.limit ? rows.slice(0, opts.limit) : rows;
      const grouped = groupBySender(limited);
      const classified = rules
        ? grouped.map((g) => ({
            ...g,
            class: classifyForDelete({ sender: g.sender, subject: g.examples[0] || '' }, rules),
          }))
        : grouped;
      report[tab] = { visible: limited.length, bySender: classified, senders: classified };
      totalVisible += limited.length;
      totalSenders += classified.length;
      clearMarketing += classified.filter((g) => g.class === 'marketing').length;
      log(tab, 'visible', limited.length, 'senders', classified.length);
    }

    if (opts.writeLog !== false) {
      const outPath = path.join(
        __dirname,
        'dry-run-logs',
        `scan-${new Date().toISOString().replace(/[:.]/g, '-')}.json`,
      );
      fs.writeFileSync(outPath, JSON.stringify(report, null, 2));
      log('wrote', outPath);
    }

    const tabLabel = opts.tab || 'offers+newsletters+priority';
    const summary = `scan: ${totalVisible} visible in ${tabLabel}, ${totalSenders} senders (${clearMarketing} clear marketing)`;

    return {
      tabs: report,
      senders: Object.values(report).flatMap((t) => t.bySender || []),
      counts: {
        visible: totalVisible,
        senders: totalSenders,
        clearMarketing,
      },
      summary,
    };
  } finally {
    await close();
  }
}

async function main() {
  const flags = parseCliFlags();
  if (flags.help) {
    console.log(`Usage: node scan-marketing.js [--tab offers|newsletters|priority|all|social] [--limit N]
READ-ONLY scan. Groups by sender. Does not delete.`);
    process.exit(0);
  }

  const result = await run({
    tab: flags.tab,
    limit: flags.limit,
    headless: flags.headless,
    profile: flags.profile,
  });
  console.log(JSON.stringify(result.tabs, null, 2));
  console.error(result.summary);
}

if (require.main === module) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}

module.exports = { run, scanTab, groupBySender };
