// Keeps the page scripts registered on the Odoo sites the user enabled.

const SCRIPT_IDS = ["ore-page", "ore-bridge"];
const PAGE_FILES = ["src/page/zip.js", "src/page/xlsx.js", "src/page/convert.js", "src/page/handler.js"];

/**
 * Access pattern for an Odoo site. Without the port: Firefox doesn't accept ports in
 * match patterns, and in Chrome a port-less pattern covers every port of that host.
 */
export function sitePattern(origin) {
    const url = new URL(origin);
    return `${url.protocol}//${url.hostname}/*`;
}

async function getOrigins() {
    const { origins } = await chrome.storage.local.get("origins");
    return origins || [];
}

async function registerScripts() {
    const existing = await chrome.scripting.getRegisteredContentScripts({ ids: SCRIPT_IDS });
    if (existing.length) {
        await chrome.scripting.unregisterContentScripts({ ids: existing.map((s) => s.id) });
    }
    const origins = [];
    for (const origin of await getOrigins()) {
        if (await chrome.permissions.contains({ origins: [sitePattern(origin)] })) {
            origins.push(origin);
        }
    }
    if (!origins.length) {
        return;
    }
    const matches = [...new Set(origins.map(sitePattern))];
    await chrome.scripting.registerContentScripts([
        { id: "ore-page", js: PAGE_FILES, matches, runAt: "document_idle", world: "MAIN", persistAcrossSessions: true },
        { id: "ore-bridge", js: ["src/bridge.js"], matches, runAt: "document_idle", persistAcrossSessions: true },
    ]);
}

async function setEnabled({ origin, enabled, tabId }) {
    const origins = new Set(await getOrigins());
    if (enabled) {
        origins.add(origin);
    } else {
        origins.delete(origin);
    }
    await chrome.storage.local.set({ origins: [...origins] });
    await registerScripts();
    if (enabled && tabId) {
        // Start working in the open tab right away, without a reload.
        await chrome.scripting.executeScript({ target: { tabId }, files: ["src/bridge.js"] });
        await chrome.scripting.executeScript({ target: { tabId }, files: PAGE_FILES, world: "MAIN" });
    }
    return { ok: true, reloadNeeded: !enabled };
}

// The popup can close while the browser shows the "allow access to this site" prompt
// (Firefox closes it; Chrome may). It says first which site it is enabling, and the
// background finishes the job when the permission arrives.
chrome.permissions.onAdded.addListener(async ({ origins }) => {
    const { pendingEnable } = await chrome.storage.session.get("pendingEnable");
    if (!pendingEnable || Date.now() - pendingEnable.at > 120000) {
        return;
    }
    if ((origins || []).includes(sitePattern(pendingEnable.origin))) {
        await chrome.storage.session.remove("pendingEnable");
        await setEnabled({ origin: pendingEnable.origin, enabled: true, tabId: pendingEnable.tabId }).catch(() => null);
    }
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === "pendingEnable") {
        chrome.storage.session.set({ pendingEnable: { origin: message.origin, tabId: message.tabId, at: Date.now() } })
            .then(() => sendResponse({ ok: true }));
        return true;
    }
    if (message.type === "setEnabled") {
        setEnabled(message).then(sendResponse, (error) => sendResponse({ error: String(error.message || error) }));
        return true;
    }
    return false;
});

chrome.runtime.onInstalled.addListener(() => registerScripts().catch(() => null));
chrome.runtime.onStartup.addListener(() => registerScripts().catch(() => null));
