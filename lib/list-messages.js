/**
 * Scrape visible message rows from the current Yahoo Mail list view via a11y.
 * TODO: Yahoo virtualizes long lists — scroll + paginate on next live pass.
 */

const { selectors } = require('./yahoo-selectors');

/**
 * @returns {Promise<Array<{sender:string, subject:string, unread:boolean, name:string}>>}
 */
async function listVisibleMessages(page) {
  const sel = selectors(page);
  // Message rows appear as links; unread ones prefix "Unread message ".
  const links = page.getByRole('link').filter({
    hasNot: page.getByRole('tab'),
  });

  // Prefer links under the messages heading area — heuristic from snapshots:
  // names look like "Unread message Sender Subject·preview … date"
  const all = await page.getByRole('link').all();
  const out = [];
  for (const link of all) {
    const name = ((await link.getAttribute('aria-label')) || (await link.innerText().catch(() => '')) || '')
      .replace(/\s+/g, ' ')
      .trim();
    if (!name) continue;
    // Skip chrome links
    if (/^(New message|Skip to|Yahoo)/i.test(name)) continue;
    if (name.length < 8) continue;
    // Heuristic: message links contain a middle dot preview or "Unread message"
    const unread = /^Unread message\s+/i.test(name);
    const cleaned = name.replace(/^Unread message\s+/i, '');
    // Sender is typically the first token(s) before subject — Yahoo a11y often
    // joins "Sender Subject·preview". Split on · first.
    const main = cleaned.split('·')[0].trim();
    // TODO: more robust sender/subject split once we capture data-test attributes
    const parts = main.split(/\s{2,}|\n/);
    let sender = parts[0] || main;
    let subject = main;
    // If pattern "Sender Subject words", take first 1-4 words as sender guess
    const m = main.match(/^(.+?)\s{2,}(.+)$/);
    if (m) {
      sender = m[1].trim();
      subject = m[2].trim();
    }
    out.push({ sender, subject, unread, name: cleaned });
  }
  return out;
}

/**
 * Read selection toolbar count if present, e.g. "97 selected" / button names.
 */
async function selectedCount(page) {
  const btn = page.getByRole('button', { name: /Delete \d+ selected/ });
  if (!(await btn.count())) return 0;
  const t = await btn.first().innerText();
  const m = t.match(/(\d+)/);
  return m ? Number(m[1]) : 0;
}

module.exports = { listVisibleMessages, selectedCount };
