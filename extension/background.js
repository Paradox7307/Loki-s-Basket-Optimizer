// Chrome runs this as a service worker, Firefox as an event page (see manifest).
if (typeof importScripts === 'function' && typeof globalThis.BasketStore === 'undefined') {
  importScripts('lib/store.js');
}
const Store = globalThis.BasketStore;

function updateBadge(state) {
  const n = Store.badgeCount(state);
  chrome.action.setBadgeText({ text: n ? String(n) : '' });
  chrome.action.setBadgeBackgroundColor({ color: '#0A7456' });
}

// On install/update, load() migrates data from older versions (single basket -> baskets).
function migrateAndBadge() { Store.load().then(updateBadge); }
// On every change only read: the popup and content script are the writers.
function badgeOnly() { Store.peek().then(updateBadge); }

chrome.runtime.onInstalled.addListener(migrateAndBadge);
chrome.runtime.onStartup.addListener(badgeOnly);
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && (changes.baskets || changes.activeBasketId || changes.items)) badgeOnly();
});

// Popup asks us to open shop pages; done here so it keeps working after the popup closes.
chrome.runtime.onMessage.addListener((msg) => {
  if (!msg || msg.type !== 'openTabs' || !Array.isArray(msg.urls)) return;
  msg.urls
    .filter((u) => /^https:\/\/([a-z0-9-]+\.)*(heureka\.(cz|sk)|zbozi\.cz)\//i.test(u))
    .slice(0, 20)
    .forEach((url, i) => chrome.tabs.create({ url, active: i === 0 }));
});
