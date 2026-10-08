const $ = (id) => document.getElementById(id);
const CHOICES = { ask: "Ask each time", pdf: "PDF", excel: "Excel", both: "Both" };

// Runs in the page to recognise the Odoo web client.
function probeOdoo() {
    const odoo = window.odoo;
    const info = (odoo && odoo.info) || {};
    return {
        isOdoo: Boolean(odoo && (odoo.info || odoo.__WOWL_DEBUG__ || odoo.loader || odoo.define)),
        db: info.db,
        version: info.server_version,
    };
}

async function renderRemembered() {
    const { remembered } = await chrome.storage.local.get("remembered");
    const entries = Object.entries(remembered || {});
    $("remembered-empty").hidden = entries.length > 0;
    $("remembered-list").replaceChildren(...entries.map(([report, entry]) => {
        const li = document.createElement("li");
        const name = document.createElement("span");
        name.textContent = entry.label || report;
        name.title = report;
        const select = document.createElement("select");
        select.setAttribute("aria-label", `Format for ${entry.label || report}`);
        for (const [value, label] of Object.entries(CHOICES)) {
            select.append(new Option(label, value, false, value === entry.choice));
        }
        select.addEventListener("change", async () => {
            const { remembered: current } = await chrome.storage.local.get("remembered");
            const next = { ...(current || {}) };
            if (select.value === "ask") {
                delete next[report];
            } else {
                next[report] = { ...entry, choice: select.value };
            }
            await chrome.storage.local.set({ remembered: next });
            renderRemembered();
        });
        li.append(name, select);
        return li;
    }));
}

async function init() {
    renderRemembered();
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    let info = null;
    if (tab && /^https?:/.test(tab.url || "")) {
        try {
            [{ result: info }] = await chrome.scripting.executeScript({ target: { tabId: tab.id }, world: "MAIN", func: probeOdoo });
        } catch {
            info = null;
        }
    }
    if (!info || !info.isOdoo) {
        $("not-odoo").hidden = false;
        return;
    }
    $("odoo").hidden = false;
    $("odoo-version").textContent = info.version ? `Odoo ${info.version}` : "Odoo";
    $("odoo-db").textContent = info.db || "";
    const origin = new URL(tab.url).origin;
    const { origins } = await chrome.storage.local.get("origins");
    $("enabled").checked = (origins || []).includes(origin);
    $("enabled").addEventListener("change", async (event) => {
        const enabled = event.target.checked;
        $("error").hidden = true;
        try {
            // Host without port: Firefox rejects ports in match patterns (see background.js).
            const url = new URL(origin);
            const pattern = { origins: [`${url.protocol}//${url.hostname}/*`] };
            if (enabled && !(await chrome.permissions.contains(pattern))) {
                // If this popup closes during the prompt, the background finishes enabling.
                await chrome.runtime.sendMessage({ type: "pendingEnable", origin, tabId: tab.id });
                if (!(await chrome.permissions.request(pattern))) {
                    throw new Error("The extension needs access to this Odoo site to add the Excel option.");
                }
            }
            const result = await chrome.runtime.sendMessage({ type: "setEnabled", origin, enabled, tabId: tab.id });
            if (result && result.error) {
                throw new Error(result.error);
            }
            $("hint").textContent = enabled
                ? "Ready: print any PDF report and choose Excel."
                : "Turned off. Reload the Odoo tab to remove the choice from this page.";
        } catch (error) {
            event.target.checked = !enabled;
            $("error").textContent = error.message || String(error);
            $("error").hidden = false;
        }
    });
}

init();
