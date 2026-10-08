// Keeps the page scripts registered on the Odoo sites the user enabled.

const SCRIPT_IDS = ["ore-page", "ore-bridge"];
const PAGE_FILES = ["src/page/zip.js", "src/page/xlsx.js", "src/page/convert.js", "src/page/handler.js"];

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
        if (await chrome.permissions.contains({ origins: [`${origin}/*`] })) {
            origins.push(origin);
        }
    }
    if (!origins.length) {
        return;
    }
    const matches = origins.map((o) => `${o}/*`);
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

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === "setEnabled") {
        setEnabled(message).then(sendResponse, (error) => sendResponse({ error: String(error.message || error) }));
        return true;
    }
    return false;
});

chrome.runtime.onInstalled.addListener(() => registerScripts().catch(() => null));
chrome.runtime.onStartup.addListener(() => registerScripts().catch(() => null));
