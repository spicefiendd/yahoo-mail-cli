/**
 * Yahoo Mail URL patterns reverse-engineered from browserUse transcripts
 * (Yahoo "n" / new-new UI: https://mail.yahoo.com/n/...).
 *
 * accountIds=00_1 is the primary mailbox slot observed; other accounts
 * may differ — treat as TODO to verify on next live run.
 */

const ACCOUNT_IDS = process.env.YAHOO_ACCOUNT_IDS || '00_1';

const BASE = 'https://mail.yahoo.com';

/** Tab / folder deep links (prefer these over clicking tabs). */
function inboxTab(tab, { accountIds = ACCOUNT_IDS, listFilter } = {}) {
  const qs = new URLSearchParams();
  if (accountIds) qs.set('accountIds', accountIds);
  if (listFilter) qs.set('listFilter', listFilter);
  const q = qs.toString();
  return `${BASE}/n/inbox/${tab}${q ? `?${q}` : ''}`;
}

const URLS = {
  home: `${BASE}/`,
  /** Primary / Priority tab */
  primary: () => inboxTab('priority'),
  offers: () => inboxTab('offers'),
  newsletters: () => inboxTab('newsletters'),
  social: () => inboxTab('social'),
  all: () => inboxTab('all'),
  /**
   * Keyword search. Transcripts used:
   *   /n/search/keyword=<urlencoded>+optional ?listFilter=OFFERS
   * Double-encoding was observed (%2520 for space) when navigating via UI;
   * single encodeURIComponent is usually enough for direct navigation — TODO verify.
   */
  search(keyword, { listFilter } = {}) {
    const enc = encodeURIComponent(keyword);
    const qs = listFilter ? `?listFilter=${encodeURIComponent(listFilter)}` : '';
    return `${BASE}/n/search/keyword=${enc}${qs}`;
  },
  /** Numeric folder ids are account-specific. Trash was 00_4 in one session — TODO verify. */
  folder(folderId) {
    return `${BASE}/n/folders/${folderId}`;
  },
};

const TABS = ['priority', 'offers', 'newsletters', 'social', 'all'];

module.exports = { BASE, ACCOUNT_IDS, URLS, TABS, inboxTab };
