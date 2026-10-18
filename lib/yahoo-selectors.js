/**
 * Accessibility-name based selectors mined from browserUse page snapshots.
 * Prefer role+name over CSS — Yahoo class names are hashed (e.g. A_6EGz).
 *
 * TODOs marked where live verification is still needed on next browserUse pass.
 */

/** Playwright locator helpers — pass a Page. */
function selectors(page) {
  return {
    // Navigation / tabs
    tab: (name) => page.getByRole('tab', { name, exact: true }),
    navInbox: () => page.getByRole('button', { name: /Selected, Inbox|Inbox/ }),
    navUnread: () => page.getByRole('button', { name: 'Unread', exact: true }),
    navTrash: () => page.getByRole('button', { name: 'Trash', exact: true }),
    newMessage: () => page.getByRole('button', { name: 'New message', exact: true }),

    // Search — aria from CDP: "Search box. Find messages, documents, photos or people"
    searchBox: () =>
      page.getByRole('combobox', {
        name: /Search box\. Find messages/,
      }).or(page.getByLabel(/Search box\. Find messages/)),

    // Bulk selection
    selectAll: () => page.getByRole('checkbox', { name: 'Select all messages', exact: true }),
    unselectAll: () => page.getByRole('checkbox', { name: 'Unselect all messages', exact: true }),
    /** Per-row checkbox; name is "Sender Subject…" from a11y tree */
    messageCheckbox: (senderOrSubjectSubstring) =>
      page.getByRole('checkbox', { name: new RegExp(escapeRegExp(senderOrSubjectSubstring), 'i') }),

    // Selection toolbar (names include count: "Delete 97 selected messages")
    deleteSelected: () => page.getByRole('button', { name: /^Delete( \d+ selected messages?)?$/ }),
    markReadSelected: () =>
      page.getByRole('button', { name: /^Mark( \d+ selected messages?)? as read$/ }),
    markUnreadSelected: () =>
      page.getByRole('button', { name: /^Mark( \d+ selected messages?)? as unread$/ }),
    archiveSelected: () => page.getByRole('button', { name: /^Archive( \d+ selected messages?)?$/ }),
    markSpamSelected: () =>
      page.getByRole('button', { name: /^Mark( \d+ selected messages?)? as spam$/ }),

    // Message list links
    messageLink: (textSubstring) =>
      page.getByRole('link', { name: new RegExp(escapeRegExp(textSubstring), 'i') }),
    unreadMessageLinks: () => page.getByRole('link', { name: /^Unread message / }),

    /**
     * Unsubscribe:
     * - Prefer footer <a> "Unsubscribe" inside the open message body (brand page).
     * - AVOID Yahoo toolbar/one-click button named exactly "Unsubscribe" when it is
     *   a client feature (user rule: footer unsubscribe only).
     * TODO: confirm message-pane iframe vs main frame on next live run.
     */
    footerUnsubscribeLink: () =>
      page.locator('a').filter({ hasText: /^Unsubscribe$/i }),
    // Yahoo one-click — do NOT use unless explicitly requested
    yahooOneClickUnsubscribe: () => page.getByRole('button', { name: 'Unsubscribe', exact: true }),
  };
}

function escapeRegExp(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Keyboard shortcuts (public Yahoo Mail docs / community):
 * - `/` focuses search (also observed as common webmail pattern)
 * - Ctrl/Cmd+A selects all visible messages after focus on list
 * TODO: verify shortcuts on Yahoo /n UI — transcripts mostly used clicks.
 */
const KEYS = {
  focusSearch: '/',
  selectAllVisible: 'Control+a',
  delete: 'Delete',
  // TODO: confirm mark-read shortcut if any
};

module.exports = { selectors, KEYS, escapeRegExp };
