// Content script (isolated world): passes the extension's saved choices to the
// page script and stores the ones the user asks to remember.
(() => {
    if (window.__odooReportExcelBridge) {
        return;
    }
    window.__odooReportExcelBridge = true;

    const TO_PAGE = "ore:to-page";
    const TO_EXTENSION = "ore:to-extension";

    async function sendSettings() {
        const { remembered } = await chrome.storage.local.get("remembered");
        const choices = {};
        for (const [report, entry] of Object.entries(remembered || {})) {
            choices[report] = entry.choice;
        }
        document.dispatchEvent(new CustomEvent(TO_PAGE, { detail: JSON.stringify({ type: "settings", remembered: choices }) }));
    }

    document.addEventListener(TO_EXTENSION, async (event) => {
        let message;
        try {
            message = JSON.parse(event.detail);
        } catch {
            return;
        }
        if (message.type === "ready") {
            sendSettings();
        } else if (message.type === "remember" && /^[\w.]+$/.test(message.report) && ["pdf", "excel", "both"].includes(message.choice)) {
            const { remembered } = await chrome.storage.local.get("remembered");
            await chrome.storage.local.set({
                remembered: { ...(remembered || {}), [message.report]: { choice: message.choice, label: String(message.label || message.report).slice(0, 120) } },
            });
        }
    });

    chrome.storage.onChanged.addListener((changes, area) => {
        if (area === "local" && changes.remembered) {
            sendSettings();
        }
    });

    sendSettings();
})();
