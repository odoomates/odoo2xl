// Hooks into Odoo's report printing (15+): every web client checks the
// "ir.actions.report handlers" registry before printing, so a handler added
// here can offer Excel, then let Odoo continue with the PDF when wanted.
(() => {
    if (window.__odooReportExcelHandler) {
        return;
    }
    window.__odooReportExcelHandler = true;
    const ns = window.__odooReportExcel;

    const TO_PAGE = "ore:to-page";
    const TO_EXTENSION = "ore:to-extension";
    let remembered = {}; // report_name -> "pdf" | "excel" | "both"
    // Set by the "… (Excel)" entries of Odoo's Print menu, read by the next report.
    let forced = null;

    // ------------------------------------------------------------------
    // Settings live in the extension; bridge.js passes them over as JSON.
    // ------------------------------------------------------------------

    document.addEventListener(TO_PAGE, (event) => {
        try {
            const message = JSON.parse(event.detail);
            if (message.type === "settings") {
                remembered = message.remembered || {};
            }
        } catch {
            // ignore malformed messages
        }
    });

    function toExtension(message) {
        document.dispatchEvent(new CustomEvent(TO_EXTENSION, { detail: JSON.stringify(message) }));
    }

    // ------------------------------------------------------------------
    // Odoo internals, reached the same way in 15/16 (odoo.__DEBUG__) and 17+ (odoo.loader)
    // ------------------------------------------------------------------

    function odooModule(name) {
        try {
            if (window.odoo && odoo.loader && odoo.loader.modules) {
                return odoo.loader.modules.get(name);
            }
            if (window.odoo && odoo.__DEBUG__ && odoo.__DEBUG__.services) {
                return odoo.__DEBUG__.services[name];
            }
        } catch {
            // not loaded yet
        }
        return undefined;
    }

    function userContext(env) {
        const fromService = env && env.services && env.services.user && env.services.user.context;
        if (fromService) {
            return fromService;
        }
        const userModule = odooModule("@web/core/user");
        return (userModule && userModule.user && userModule.user.context) || {};
    }

    function localization() {
        const module = odooModule("@web/core/l10n/localization");
        const loc = module && module.localization;
        const read = (key, fallback) => {
            try {
                const value = loc[key];
                return value === undefined || value === null ? fallback : value;
            } catch {
                return fallback; // throws before the web client is ready
            }
        };
        return {
            decimalPoint: read("decimalPoint", "."),
            thousandsSep: read("thousandsSep", ","),
            dateFormat: read("dateFormat", "MM/dd/yyyy"),
        };
    }

    // Same URL Odoo builds for its own HTML preview (web/.../reports/utils.js getReportUrl).
    function reportUrl(action, env) {
        let url = `/report/html/${action.report_name}`;
        const actionContext = action.context || {};
        if (action.data && JSON.stringify(action.data) !== "{}") {
            url += `?options=${encodeURIComponent(JSON.stringify(action.data))}&context=${encodeURIComponent(JSON.stringify(actionContext))}`;
        } else {
            if (actionContext.active_ids) {
                url += `/${actionContext.active_ids.join(",")}`;
            }
            url += `?context=${encodeURIComponent(JSON.stringify(userContext(env)))}`;
        }
        return url;
    }

    function cleanName(text) {
        return String(text || "").replace(/[\\/]+/g, "-").replace(/[:*?"<>|\n\r]+/g, " ").replace(/\s+/g, " ").trim();
    }

    async function recordNames(model, ids) {
        const response = await fetch(`/web/dataset/call_kw/${model}/read`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            credentials: "same-origin",
            body: JSON.stringify({ jsonrpc: "2.0", method: "call", id: 1, params: { model, method: "read", args: [ids.slice(0, 50), ["display_name"]], kwargs: {} } }),
        });
        const data = await response.json();
        return (data.result || []).map((r) => r.display_name).filter(Boolean);
    }

    /**
     * Named after the printed record like Odoo's PDFs ("INV-2026-00012.xlsx"),
     * "Invoices - INV-2026-00010 to INV-2026-00012 (3).xlsx" for several,
     * or after the report for wizard reports ("Trial Balance 2026-10-08.xlsx").
     */
    async function fileName(action, title) {
        const report = cleanName(title || action.display_name || action.name || action.report_name || "Report");
        const context = action.context || {};
        const wizard = action.data && JSON.stringify(action.data) !== "{}"; // active_ids is the wizard itself
        const ids = (!wizard && context.active_ids) || [];
        const model = context.active_model || action.model;
        if (ids.length && model) {
            try {
                const names = (await recordNames(model, ids)).map(cleanName);
                if (names.length === 1) {
                    return `${names[0]}.xlsx`;
                }
                if (names.length > 1) {
                    return `${report} - ${names[0]} to ${names[names.length - 1]} (${ids.length}).xlsx`;
                }
            } catch {
                // fall back to the report name
            }
        }
        return `${report} ${new Date().toISOString().slice(0, 10)}.xlsx`;
    }

    function download(blob, name) {
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = name;
        document.body.appendChild(link);
        link.click();
        link.remove();
        setTimeout(() => URL.revokeObjectURL(url), 30000);
    }

    async function exportExcel(action, env) {
        const ui = env && env.services && env.services.ui;
        if (ui && ui.block) {
            ui.block();
        }
        try {
            const response = await fetch(reportUrl(action, env), { credentials: "same-origin" });
            if (!response.ok) {
                throw new Error(`Odoo answered ${response.status} for the report.`);
            }
            const html = await response.text();
            const workbook = ns.convertReport(html, { ...localization(), title: action.display_name || action.name });
            download(ns.buildXlsx(workbook), await fileName(action, workbook.title));
        } finally {
            if (ui && ui.unblock) {
                ui.unblock();
            }
        }
    }

    function notify(env, message, type = "danger") {
        const service = env && env.services && env.services.notification;
        if (service) {
            service.add(message, { type, title: "Excel export" });
        } else {
            window.alert(message);
        }
    }

    // ------------------------------------------------------------------
    // The "PDF or Excel?" choice
    // ------------------------------------------------------------------

    function ask(action) {
        return new Promise((resolve) => {
            const host = document.createElement("ore-choice");
            const root = host.attachShadow({ mode: "open" });
            root.innerHTML = `
                <style>
                    :host { all: initial; }
                    .backdrop { position: fixed; inset: 0; z-index: 2147483646; background: rgba(0,0,0,.35);
                                display: grid; place-items: center; font: 14px/1.45 system-ui, -apple-system, "Segoe UI", sans-serif; }
                    .dialog { width: min(420px, calc(100vw - 32px)); background: #fff; color: #1f2328; border-radius: 12px;
                              box-shadow: 0 12px 40px rgba(0,0,0,.3); padding: 20px; }
                    h2 { margin: 0 0 4px; font-size: 16px; }
                    p { margin: 0 0 16px; color: #5d6670; font-size: 13px; }
                    .options { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; }
                    button { all: unset; box-sizing: border-box; cursor: pointer; text-align: center; padding: 12px 8px;
                             border-radius: 10px; border: 1px solid #d9dde3; font-weight: 600; }
                    button:hover, button:focus-visible { border-color: #714b67; background: #f7f2f6; outline: none; }
                    button .sub { display: block; font-weight: 400; font-size: 11px; color: #5d6670; margin-top: 2px; }
                    button.excel { border-color: #1d6f42; color: #1d6f42; }
                    button.excel:hover, button.excel:focus-visible { background: #eef7f1; }
                    label { display: flex; gap: 8px; align-items: center; margin-top: 14px; font-size: 13px; color: #5d6670; }
                    @media (prefers-color-scheme: dark) {
                        .dialog { background: #1f2226; color: #e8eaed; }
                        p, label, button .sub { color: #9aa3ad; }
                        button { border-color: #363b42; }
                        button:hover, button:focus-visible { background: #292d32; }
                        button.excel { color: #4ac26b; border-color: #2f6b45; }
                        button.excel:hover, button.excel:focus-visible { background: #1d2b22; }
                    }
                </style>
                <div class="backdrop" role="dialog" aria-modal="true" aria-labelledby="t">
                    <div class="dialog">
                        <h2 id="t"></h2>
                        <p>Choose the format. Esc cancels.</p>
                        <div class="options">
                            <button data-choice="pdf">PDF<span class="sub">as usual</span></button>
                            <button data-choice="excel" class="excel">Excel<span class="sub">.xlsx</span></button>
                            <button data-choice="both">Both<span class="sub">PDF + Excel</span></button>
                        </div>
                        <label><input type="checkbox" class="remember"> Remember for this report</label>
                    </div>
                </div>`;
            root.getElementById("t").textContent = `Print “${action.display_name || action.name || action.report_name}”`;
            const finish = (choice) => {
                document.removeEventListener("keydown", onKey, true);
                if (choice && root.querySelector(".remember").checked) {
                    remembered[action.report_name] = choice;
                    toExtension({ type: "remember", report: action.report_name, label: action.display_name || action.name, choice });
                }
                host.remove();
                resolve(choice);
            };
            const onKey = (event) => {
                if (event.key === "Escape") {
                    event.stopPropagation();
                    finish(null);
                }
            };
            document.addEventListener("keydown", onKey, true);
            root.querySelectorAll("button[data-choice]").forEach((b) => b.addEventListener("click", () => finish(b.dataset.choice)));
            root.querySelector(".backdrop").addEventListener("click", (event) => {
                if (event.target.classList.contains("backdrop")) {
                    finish(null);
                }
            });
            document.documentElement.appendChild(host);
            root.querySelector("button.excel").focus();
        });
    }

    async function handler(action, options, env) {
        if (action.report_type !== "qweb-pdf") {
            return false;
        }
        const menuChoice = forced && Date.now() - forced.at < 15000 ? forced.choice : null;
        forced = null;
        const choice = menuChoice || remembered[action.report_name] || (await ask(action));
        if (!choice) {
            return true; // cancelled: print nothing
        }
        if (choice === "pdf") {
            return false; // Odoo's own handlers print the PDF
        }
        try {
            await exportExcel(action, env);
        } catch (error) {
            notify(env, `Couldn't create the Excel file: ${error.message || error}`);
        }
        return choice === "excel"; // "both": let Odoo continue with the PDF
    }

    // ------------------------------------------------------------------
    // "… (Excel)" entries in Odoo's own Print menu
    // ------------------------------------------------------------------

    function isPdfItem(item) {
        return item && item.action && !item.oreExcel && (!item.action.report_type || item.action.report_type === "qweb-pdf");
    }

    function withExcelItems(items) {
        if (!Array.isArray(items) || items.some((i) => i.oreExcel)) {
            return items;
        }
        return items.flatMap((item) => (isPdfItem(item)
            ? [item, { ...item, key: `${item.key}__excel`, description: `${item.description} (Excel)`, oreExcel: true }]
            : [item]));
    }

    // Odoo 15/16: patch(obj, name, value) with this._super; 17+: patch(obj, value) with super
    const legacyPatch = () => Boolean(window.odoo && odoo.__DEBUG__ && !odoo.loader);

    function patchPrintMenu() {
        const menus = odooModule("@web/search/action_menus/action_menus");
        const patchModule = odooModule("@web/core/utils/patch");
        const ActionMenus = menus && menus.ActionMenus;
        if (!ActionMenus || !patchModule || ActionMenus.prototype.__oreExcelPatched) {
            return Boolean(ActionMenus && ActionMenus.prototype.__oreExcelPatched);
        }
        const proto = ActionMenus.prototype;
        const loadsItems = typeof proto.loadPrintItems === "function"; // 18+: items in state; 16/17: getter
        const runExcel = (component, item) => {
            forced = { choice: "excel", at: Date.now() };
            return component.executeAction(item.action);
        };
        if (legacyPatch()) {
            patchModule.patch(proto, "odoo_report_excel", {
                get printItems() {
                    return withExcelItems(this._super());
                },
                onItemSelected(item) {
                    return item && item.oreExcel ? runExcel(this, item) : this._super(...arguments);
                },
            });
        } else if (loadsItems) {
            patchModule.patch(proto, {
                async loadPrintItems() {
                    await super.loadPrintItems(...arguments);
                    this.state.printItems = withExcelItems(this.state.printItems);
                },
                async onItemSelected(item) {
                    return item && item.oreExcel ? runExcel(this, item) : super.onItemSelected(...arguments);
                },
            });
        } else {
            patchModule.patch(proto, {
                get printItems() {
                    return withExcelItems(super.printItems);
                },
                async onItemSelected(item) {
                    return item && item.oreExcel ? runExcel(this, item) : super.onItemSelected(...arguments);
                },
            });
        }
        proto.__oreExcelPatched = true;
        return true;
    }

    /**
     * The older Print menu (web.ActionMenus): every view in Odoo 15, and the views
     * Odoo 16 hasn't moved to the new one yet.
     */
    function patchLegacyPrintMenu() {
        const ActionMenus = odooModule("web.ActionMenus");
        const patchModule = odooModule("@web/core/utils/patch");
        const proto = ActionMenus && ActionMenus.prototype;
        if (!proto || !patchModule || !legacyPatch() || typeof proto._setPrintItems !== "function" || proto.__oreExcelPatched) {
            return Boolean(proto && proto.__oreExcelPatched);
        }
        patchModule.patch(proto, "odoo_report_excel", {
            async _setPrintItems() {
                return withExcelItems(await this._super(...arguments));
            },
            _onItemSelected(ev) {
                const item = ev && ev.detail && ev.detail.item;
                if (item && item.oreExcel) {
                    ev.stopPropagation();
                    forced = { choice: "excel", at: Date.now() };
                    return this._executeAction(item.action);
                }
                return this._super(...arguments);
            },
        });
        proto.__oreExcelPatched = true;
        return true;
    }

    // ------------------------------------------------------------------
    // Registration, once the web client has loaded its registry
    // ------------------------------------------------------------------

    let attempts = 0;
    const timer = setInterval(() => {
        attempts += 1;
        const module = odooModule("@web/core/registry");
        const registry = module && module.registry;
        if (registry) {
            clearInterval(timer);
            const handlers = registry.category("ir.actions.report handlers");
            if (!handlers.contains("odoo_report_excel")) {
                handlers.add("odoo_report_excel", handler, { sequence: 1 });
            }
            for (const patchMenu of [patchPrintMenu, patchLegacyPrintMenu]) {
                try {
                    patchMenu();
                } catch (error) {
                    console.warn("Odoo2XL: couldn't add Excel entries to the Print menu", error);
                }
            }
            toExtension({ type: "ready" });
        } else if (attempts > 300) {
            clearInterval(timer); // not an Odoo web client page
        }
    }, 200);
})();
