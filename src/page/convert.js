// Converts the HTML version of an Odoo report (/report/html/...) into workbook data
// for xlsx.js. Odoo renders every PDF from this HTML, so tables, amounts and
// structure are exact rather than guessed from a PDF.
(() => {
    const ns = (window.__odooReportExcel = window.__odooReportExcel || {});

    const BLOCK = new Set(["DIV", "P", "SECTION", "ARTICLE", "UL", "OL", "LI", "H1", "H2", "H3", "H4", "H5", "H6",
        "ADDRESS", "BLOCKQUOTE", "HEADER", "FOOTER", "MAIN", "TABLE", "TR", "DL", "DT", "DD", "FORM"]);
    // Columns whose values are identifiers, never amounts (keep "101000" or "00123" as typed).
    const TEXT_COLUMN = /\b(code|ref|reference|number|no\.?|#|account|phone|mobile|vat|tax id|zip|iban|barcode|lot|serial|sku)\b/i;
    // A "%" in the column header ("Disc.%") means its plain numbers are percentages: 10.00 is 10 %.
    const PERCENT_COLUMN = /%/;
    // Smallest to widest, then print: the last one present wins.
    const BREAKPOINTS = ["", "sm-", "md-", "lg-", "xl-", "xxl-", "print-"];

    /**
     * Hidden on a wide page, as the PDF is laid out. The HTML report marks cells for phones too:
     * "d-none d-md-table-cell" shows on wide pages, "d-md-none d-table-cell" only on phones.
     */
    function hiddenWhenWide(el) {
        let display = null;
        for (const bp of BREAKPOINTS) {
            for (const name of el.classList) {
                if (name.startsWith(`d-${bp}`) && !BREAKPOINTS.some((other) => other && other !== bp && name.startsWith(`d-${other}`))) {
                    display = name.slice(2 + bp.length);
                }
            }
        }
        return display === "none";
    }

    function isHidden(el) {
        const style = (el.getAttribute("style") || "").toLowerCase();
        return hiddenWhenWide(el) || el.classList.contains("o_hidden")
            || /display\s*:\s*none/.test(style) || /visibility\s*:\s*hidden/.test(style)
            || el.tagName === "SCRIPT" || el.tagName === "STYLE" || el.tagName === "IMG" || el.tagName === "svg";
    }

    function isIndentFiller(el) {
        // Odoo accounting templates indent with dots painted white: <span style="color: white;">....</span>
        const style = (el.getAttribute("style") || "").toLowerCase().replace(/\s+/g, "");
        return /(^|;)color:(white|#fff|#ffffff|rgb\(255,255,255\))(;|$)/.test(style) && /^[.\s ]*$/.test(el.textContent);
    }

    /** Visible text with line breaks for <br> and block elements. */
    function textOf(node) {
        let out = "";
        const walk = (n) => {
            if (n.nodeType === Node.TEXT_NODE) {
                // Odoo puts a zero-width no-break space after minus signs ("-\uFEFF1,690.93").
                out += n.textContent.replace(/[\uFEFF\u200B]/g, "").replace(/[\s ]+/g, (m) => (m.includes(" ") && m.length === 1 ? " " : " "));
                return;
            }
            if (n.nodeType !== Node.ELEMENT_NODE || isHidden(n) || isIndentFiller(n)) {
                return;
            }
            if (n.tagName === "BR") {
                out += "\n";
                return;
            }
            const block = BLOCK.has(n.tagName);
            if (block) {
                out += "\n";
            }
            for (const child of n.childNodes) {
                walk(child);
            }
            if (block) {
                out += "\n";
            }
        };
        walk(node);
        return out.split("\n").map((line) => line.replace(/ {2,}/g, " ").trim()).filter(Boolean).join("\n");
    }

    function isBold(el) {
        if (["TH", "STRONG", "B", "H1", "H2", "H3", "H4", "H5", "H6"].includes(el.tagName)) {
            return true;
        }
        if (el.classList && (el.classList.contains("fw-bold") || el.classList.contains("o_bold") || el.classList.contains("font-weight-bold"))) {
            return true;
        }
        const style = (el.getAttribute && el.getAttribute("style")) || "";
        return /font-weight\s*:\s*(bold|[6-9]00)/i.test(style);
    }

    /** Bold when everything visible in the element sits inside bold markup. */
    function allBold(el) {
        if (isBold(el)) {
            return true;
        }
        const texts = [];
        const walker = el.ownerDocument.createTreeWalker(el, NodeFilter.SHOW_TEXT);
        while (walker.nextNode()) {
            if (walker.currentNode.textContent.trim()) {
                texts.push(walker.currentNode);
            }
        }
        if (!texts.length) {
            return false;
        }
        return texts.every((t) => {
            for (let p = t.parentElement; p && p !== el.parentElement; p = p.parentElement) {
                if (isIndentFiller(p)) {
                    return true;
                }
                if (isBold(p)) {
                    return true;
                }
            }
            return false;
        });
    }

    function indentOf(el) {
        let level = 0;
        for (const filler of el.querySelectorAll("[style]")) {
            if (isIndentFiller(filler)) {
                level += Math.round(filler.textContent.replace(/[^.]/g, "").length / 2);
            }
        }
        for (const node of [el, el.firstElementChild].filter(Boolean)) {
            const style = node.getAttribute("style") || "";
            const match = style.match(/(?:padding|margin)-left\s*:\s*(\d+(?:\.\d+)?)(px|em|rem)/i);
            if (match) {
                const px = parseFloat(match[1]) * (match[2] === "px" ? 1 : 16);
                level += Math.round(px / 20);
            }
        }
        return level;
    }

    // ------------------------------------------------------------------
    // Values
    // ------------------------------------------------------------------

    function parseNumber(raw, loc) {
        let s = String(raw).replace(/[\s  ]/g, "");
        if (!s) {
            return null;
        }
        let negative = false;
        if (/^\(.*\)$/.test(s)) {
            negative = true;
            s = s.slice(1, -1);
        }
        if (/^[-−]/.test(s)) {
            negative = !negative;
            s = s.slice(1);
        } else if (/[-−]$/.test(s)) {
            negative = !negative;
            s = s.slice(0, -1);
        } else if (/^\+/.test(s)) {
            s = s.slice(1);
        }
        const dp = loc.decimalPoint || ".";
        const ts = loc.thousandsSep === undefined ? "," : loc.thousandsSep;
        if (!new RegExp(`^[\\d${escapeRe(dp)}${escapeRe(ts.replace(/\s/g, ""))}'’]+$`).test(s)) {
            return null;
        }
        if (ts && ts.trim() && ts !== dp) {
            s = s.split(ts.trim()).join("");
        }
        s = s.replace(/['’]/g, "");
        let decimals = 0;
        if (dp !== "." && s.includes(dp)) {
            decimals = s.length - s.lastIndexOf(dp) - 1;
            s = s.replace(dp, ".");
        } else if (s.includes(".")) {
            decimals = s.length - s.lastIndexOf(".") - 1;
        }
        if (!/^\d+(\.\d+)?$/.test(s)) {
            return null;
        }
        const value = parseFloat(s);
        return { value: negative ? -value : value, decimals, integer: !s.includes(".") , text: s };
    }

    function escapeRe(text) {
        return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    }

    function numberFormat(decimals, thousands = true) {
        const base = thousands ? "#,##0" : "0";
        return decimals > 0 ? `${base}.${"0".repeat(decimals)}` : base;
    }

    function currencyFormat(decimals, symbol, before) {
        const number = numberFormat(decimals);
        const quoted = `"${symbol.replace(/"/g, "")}"`;
        const positive = before ? `${quoted} ${number}` : `${number} ${quoted}`;
        return `${positive};-${positive}`;
    }

    /** Luxon-style date format ("MM/dd/yyyy") → regex and part order. */
    function dateMatcher(format) {
        if (!format) {
            return null;
        }
        const order = [];
        const pattern = format.replace(/yyyy|yy|MM|M|dd|d|[^yMd]/g, (token) => {
            if (/^y+$/.test(token)) {
                order.push("y");
                return token.length === 4 ? "(\\d{4})" : "(\\d{2})";
            }
            if (/^M+$/.test(token)) {
                order.push("m");
                return "(\\d{1,2})";
            }
            if (/^d+$/.test(token)) {
                order.push("d");
                return "(\\d{1,2})";
            }
            return escapeRe(token);
        });
        return { regex: new RegExp(`^${pattern}$`), order };
    }

    const TIME = /^(\d{1,2}):(\d{2})(?::(\d{2}))?\s*([AaPp][Mm])?$/;

    /** "09/20/2026 08:47:36 AM" or "2026-09-20 08:47:36" → Excel date-time serial. */
    function parseDateTime(text, loc) {
        const match = text.match(/^(.+?)\s+(\d{1,2}:\d{2}(?::\d{2})?\s*(?:[AaPp][Mm])?)$/);
        if (!match) {
            return null;
        }
        const day = parseDate(match[1], loc);
        const time = match[2].match(TIME);
        if (day === null || !time) {
            return null;
        }
        let hours = +time[1] % (time[4] ? 12 : 24);
        if (time[4] && /p/i.test(time[4])) {
            hours += 12;
        }
        return day + (hours * 3600 + +time[2] * 60 + (+time[3] || 0)) / 86400;
    }

    function parseDate(text, loc) {
        const iso = text.match(/^(\d{4})-(\d{2})-(\d{2})$/);
        if (iso) {
            return ns.excelDate(+iso[1], +iso[2], +iso[3]);
        }
        const matcher = loc.dateMatcher;
        const match = matcher && text.match(matcher.regex);
        if (!match) {
            return null;
        }
        const parts = {};
        matcher.order.forEach((key, i) => (parts[key] = +match[i + 1]));
        if (parts.y < 100) {
            parts.y += 2000;
        }
        if (!(parts.m >= 1 && parts.m <= 12 && parts.d >= 1 && parts.d <= 31)) {
            return null;
        }
        return ns.excelDate(parts.y, parts.m, parts.d);
    }

    /** A sheet cell for one table cell (or text block). */
    function cellValue(el, loc, columnHeader) {
        const bold = allBold(el);
        const indent = indentOf(el);
        // Odoo's monetary widget wraps the number in .oe_currency_value (split in two
        // spans for "label_price"); the currency symbol sits around it.
        const monetary = [...el.querySelectorAll(".oe_currency_value")];
        if (monetary.length) {
            const amountText = monetary.map((m) => textOf(m)).join("");
            const parsed = parseNumber(amountText, loc);
            if (parsed) {
                const full = textOf(el);
                const at = full.indexOf(amountText);
                const before = at > 0 ? full.slice(0, at).replace(/[-−\s ]/g, "") : "";
                const after = at >= 0 ? full.slice(at + amountText.length).replace(/[\s ]/g, "") : "";
                const symbol = before || after;
                // A currency symbol is short ("$", "€", "KD", "USD"); longer text around the
                // amount ("Tax 15% on $ 7,500.00") means the cell is a sentence, not an amount.
                if ((before && after) || symbol.length > 5 || /[\d%]/.test(symbol)) {
                    return { v: full, type: "s", bold, indent, wrap: full.includes("\n") };
                }
                const negative = /[-−]/.test(full.slice(0, Math.max(at, 0))) && parsed.value > 0 ? -1 : 1;
                return {
                    v: parsed.value * negative,
                    type: "n",
                    numFmt: symbol ? currencyFormat(parsed.decimals, symbol, Boolean(before)) : numberFormat(parsed.decimals),
                    bold,
                    indent,
                };
            }
        }
        const text = textOf(el);
        if (!text) {
            return bold || indent ? { v: "", bold, indent } : null;
        }
        const header = (columnHeader || "").trim();
        const percent = text.match(/^(.*?)\s*%$/);
        const textColumn = header && TEXT_COLUMN.test(header);
        if (!textColumn && !text.includes("\n")) {
            const parsed = parseNumber(percent ? percent[1] : text, loc);
            if (parsed && !(parsed.integer && /^0\d/.test(parsed.text))) {
                if (percent || PERCENT_COLUMN.test(header)) {
                    return { v: parsed.value / 100, type: "n", numFmt: `${numberFormat(parsed.decimals, false)}%`, bold, indent, percentText: text };
                }
                return { v: parsed.value, type: "n", numFmt: parsed.decimals || parsed.value >= 1000 ? numberFormat(parsed.decimals) : "", bold, indent, plainText: text };
            }
            const date = parseDate(text, loc);
            if (date !== null) {
                return { v: date, type: "d", numFmt: "yyyy-mm-dd", bold, indent };
            }
            const dateTime = parseDateTime(text, loc);
            if (dateTime !== null) {
                return { v: dateTime, type: "d", numFmt: "yyyy-mm-dd hh:mm", bold, indent };
            }
            // A quantity with its unit ("10.00 Units", "2.50 kg"): a number shown with the unit.
            const withUnit = text.match(/^([-−+]?[\d.,'’\s\u00a0]*\d)\s+([^\d\s][^\d]{0,24})$/);
            // Only real quantities: decimals ("10.00 Units") or a quantity column — never
            // "400000 Product Sales", an account code followed by its name.
            const quantityColumn = /qty|quant|ordered|delivered|demand|done|reserved|uom/i.test(columnHeader || "");
            if (withUnit && withUnit[2].trim().length <= 15) {
                const quantity = parseNumber(withUnit[1], loc);
                if (quantity && (quantity.decimals > 0 || quantityColumn)) {
                    const unit = withUnit[2].trim().replace(/"/g, "");
                    return { v: quantity.value, type: "n", numFmt: `${numberFormat(quantity.decimals)} "${unit}"`, bold, indent };
                }
            }
        }
        return { v: text, type: "s", bold, indent, wrap: text.includes("\n") };
    }

    // ------------------------------------------------------------------
    // Layout
    // ------------------------------------------------------------------

    class SheetBuilder {
        constructor(name, loc) {
            this.name = name;
            this.loc = loc;
            this.rows = [];
            this.merges = [];
            this.tables = []; // {r1, r2, c1, c2, headerRow}
        }

        blank() {
            if (this.rows.length && this.rows[this.rows.length - 1].length) {
                this.rows.push([]);
            }
        }

        addText(el) {
            const cell = cellValue(el, this.loc, null);
            if (!cell || cell.v === "") {
                return;
            }
            if (/^H[1-2]$/.test(el.tagName)) {
                cell.title = true;
            } else if (/^H[3-6]$/.test(el.tagName)) {
                cell.bold = true;
            }
            this.rows.push([cell]);
            if (/^H[1-6]$/.test(el.tagName)) {
                this.blank();
            }
        }

        /** Bootstrap .row with .col-* children: put each column side by side. */
        addColumns(row) {
            const cols = [...row.children].filter((c) => !isHidden(c) && textOf(c));
            if (!cols.length) {
                return;
            }
            // "Label: value" pairs become two cells each; a column may hold several pairs.
            const cells = [];
            for (const col of cols) {
                const text = textOf(col);
                const labels = [...col.querySelectorAll("strong, b")].map((l) => textOf(l)).filter(Boolean);
                let cursor = 0;
                const pairs = [];
                for (const label of labels) {
                    const at = text.indexOf(label, cursor);
                    if (at < 0) {
                        continue;
                    }
                    if (pairs.length) {
                        pairs[pairs.length - 1].value = text.slice(pairs[pairs.length - 1].end, at);
                    } else if (text.slice(0, at).trim()) {
                        pairs.push({ label: null, value: text.slice(0, at), end: at });
                    }
                    pairs.push({ label, end: at + label.length, value: "" });
                    cursor = at + label.length;
                }
                if (pairs.length) {
                    pairs[pairs.length - 1].value = text.slice(pairs[pairs.length - 1].end);
                } else {
                    pairs.push({ label: null, value: text });
                }
                for (const pair of pairs) {
                    const value = pair.value.trim().replace(/\n+/g, ", ");
                    if (pair.label) {
                        cells.push({ v: pair.label, type: "s", bold: true });
                    }
                    const span = Object.assign(col.ownerDocument.createElement("span"), { textContent: value });
                    cells.push(value ? cellValue(span, this.loc, pair.label) : { v: "" });
                }
            }
            this.rows.push(cells);
        }

        addTable(table) {
            this.blank();
            const top = this.rows.length;
            const occupied = new Set();
            const headers = [];
            let headerRow = null;
            let width = 0;
            const rows = [...table.rows].filter((tr) => !isHidden(tr));
            // Section and note lines span colspan="99"; keep them within the table's own columns.
            const spanOf = (td) => Math.max(1, parseInt(td.getAttribute("colspan") || "1", 10) || 1);
            const columns = Math.max(1, ...rows.map((tr) => [...tr.cells].filter((td) => !isHidden(td))
                .reduce((sum, td) => sum + (spanOf(td) > 20 ? 1 : spanOf(td)), 0)));
            // The totals under an order or invoice ("Untaxed Amount", "Tax 15%", "Total") go under its
            // Amount column, so they line up with the amounts they add up.
            const lines = this.lastLines;
            const totals = columns === 2 && lines && lines.amountLast && lines.width > 2
                && !table.querySelector("thead, th")
                && rows.every((tr) => !textOf(tr) || (tr.cells.length && tr.cells[tr.cells.length - 1].querySelector(".oe_currency_value")));
            const offset = totals ? lines.width - 2 : 0;
            rows.forEach((tr, i) => {
                const r = top + i;
                const sheetRow = [];
                const section = tr.parentElement && tr.parentElement.tagName;
                const isHead = section === "THEAD" || (i === 0 && [...tr.cells].every((c) => c.tagName === "TH"));
                const isFoot = section === "TFOOT";
                const rowBold = isBold(tr) || isFoot;
                let c = offset;
                for (const td of tr.cells) {
                    if (isHidden(td)) {
                        continue;
                    }
                    while (occupied.has(`${r}:${c}`)) {
                        c += 1;
                    }
                    const colspan = Math.max(1, Math.min(spanOf(td), offset + columns - c));
                    const rowspan = Math.max(1, parseInt(td.getAttribute("rowspan") || "1", 10) || 1);
                    const cell = isHead ? { v: textOf(td), type: "s", header: true, wrap: textOf(td).includes("\n") } : cellValue(td, this.loc, headers[c]);
                    if (cell) {
                        if (rowBold) {
                            cell.bold = true;
                        }
                        if (td.classList.contains("text-end") || td.classList.contains("text-right")) {
                            cell.align = cell.type === "s" ? "right" : undefined;
                        }
                        sheetRow[c] = cell;
                    }
                    if (isHead) {
                        for (let k = 0; k < colspan; k++) {
                            headers[c + k] = textOf(td);
                        }
                    }
                    if (colspan > 1 || rowspan > 1) {
                        this.merges.push({ r1: r, c1: c, r2: r + rowspan - 1, c2: c + colspan - 1 });
                        for (let dr = 0; dr < rowspan; dr++) {
                            for (let dc = 0; dc < colspan; dc++) {
                                occupied.add(`${r + dr}:${c + dc}`);
                            }
                        }
                    }
                    c += colspan;
                }
                width = Math.max(width, c);
                if (isHead) {
                    headerRow = r;
                }
                this.rows.push(sheetRow);
            });
            if (headerRow !== null) {
                const last = this.rows.slice(headerRow + 1).map((row) => row[width - 1]);
                this.lastLines = { width, amountLast: last.some((cell) => cell && cell.type === "n" && /;-/.test(cell.numFmt || "")) };
            }
            if (rows.length) {
                this.tables.push({ r1: headerRow !== null ? headerRow : top, r2: top + rows.length - 1, c1: 0, c2: Math.max(width - 1, 0), headerRow, size: rows.length, headers: headers.slice(0, width) });
            }
            const firstData = headerRow !== null ? headerRow + 1 : top;
            const grouped = Boolean((this.loc.thousandsSep || "").trim());
            for (let c = 0; c < width; c++) {
                const cells = this.rows.slice(firstData).map((row) => row[c]).filter((cell) => cell && cell.v !== "" && !cell.header);
                const asText = (cell, text) => Object.assign(cell, { v: text, type: "s", numFmt: undefined });
                // A column mixing percentages with text holds names, not rates ("15%" next to "15%, 0% Exports"
                // or "VAT 5% Exempt"): keep the percentages as written.
                if (cells.some((cell) => cell.type === "s" && !cell.bold)) {
                    cells.filter((cell) => cell.percentText !== undefined).forEach((cell) => asText(cell, cell.percentText));
                }
                // Odoo writes amounts and quantities from 1,000 up with a thousands separator; a column with
                // "101000" or "40100" holds codes, so its whole numbers stay as written.
                const plain = cells.filter((cell) => cell.plainText !== undefined && /^\d+$/.test(cell.plainText));
                if (grouped && plain.some((cell) => cell.v >= 1000)) {
                    plain.forEach((cell) => asText(cell, cell.plainText));
                }
                cells.forEach((cell) => {
                    delete cell.percentText;
                    delete cell.plainText;
                });
            }
            // Start each column's indentation at 0 (templates often indent every line one level).
            for (let c = 0; c < width; c++) {
                const cells = this.rows.slice(firstData).map((row) => row[c]).filter((cell) => cell && cell.v !== "" && !cell.header);
                const base = cells.length ? Math.min(...cells.map((cell) => cell.indent || 0)) : 0;
                if (base) {
                    cells.forEach((cell) => (cell.indent -= base));
                }
            }
            this.blank();
        }

        walk(node) {
            for (const child of node.children) {
                if (isHidden(child)) {
                    continue;
                }
                if (child.tagName === "TABLE") {
                    this.addTable(child);
                } else if (child.querySelector("table")) {
                    this.walk(child);
                } else if (child.classList.contains("row") && [...child.children].some((c) => /(^|\s)col(-|\s|$)/.test(c.className))) {
                    this.addColumns(child);
                } else if ([...child.children].some((c) => BLOCK.has(c.tagName) && textOf(c))) {
                    this.walk(child);
                } else if (textOf(child)) {
                    this.addText(child);
                }
            }
        }

        result() {
            const widths = [];
            const merged = new Set();
            for (const m of this.merges) {
                for (let r = m.r1; r <= m.r2; r++) {
                    for (let c = m.c1; c <= m.c2; c++) {
                        if (r !== m.r1 || c !== m.c1 || m.c2 > m.c1) {
                            merged.add(`${r}:${c}`);
                        }
                    }
                }
            }
            this.rows.forEach((row, r) => row.forEach((cell, c) => {
                if (!cell || merged.has(`${r}:${c}`) || cell.title) {
                    return;
                }
                const length = cell.type === "n" ? String(Math.round(Math.abs(cell.v))).length + 6
                    : cell.type === "d" ? 11
                        : Math.max(...String(cell.v).split("\n").map((l) => l.length)) + (cell.indent || 0) * 2;
                widths[c] = Math.max(widths[c] || 8, Math.min(length + 2, 60));
            }));
            // Filter and frozen header on the biggest table that has a header row.
            const main = this.tables.filter((t) => t.headerRow !== null).sort((a, b) => b.size - a.size)[0];
            return {
                main: main ? { headers: main.headers, rows: this.rows.slice(main.headerRow + 1, main.r2 + 1).filter((row) => row.some((cell) => cell && cell.v !== "")) } : null,
                name: this.name,
                rows: this.rows,
                merges: this.merges,
                widths: Array.from(widths, (w) => w || 8),
                freezeRow: main && main.headerRow < 25 ? main.headerRow + 1 : undefined,
                filter: main ? { r1: main.headerRow, c1: main.c1, r2: main.r2, c2: main.c2 } : undefined,
            };
        }
    }

    /**
     * Several documents printed together (e.g. 20 invoices): one sheet with every line
     * and a Document column. Columns are matched by name, since a document only shows
     * some columns when it needs them (Taxes, Disc.%).
     */
    function allLinesSheet(sheets) {
        const mains = sheets.map((sheet) => sheet.main);
        if (sheets.length < 2 || mains.some((m) => !m || !m.rows.length)) {
            return null;
        }
        // Column keys: the header name, numbered when a name repeats ("Tax" for the base, "Tax" for the amount).
        const keysOf = (headers) => {
            const seen = {};
            return headers.map((h) => {
                const name = (h || "").trim().toLowerCase();
                seen[name] = (seen[name] || 0) + 1;
                return `${name}#${seen[name]}`;
            });
        };
        const keys = mains.map((m) => keysOf(m.headers));
        // The same kind of document: the same first column ("Description", "Product").
        if (keys.some((k) => k[0] !== keys[0][0])) {
            return null;
        }
        const columns = []; // {key, name}
        mains.forEach((m, i) => {
            keys[i].forEach((k, c) => {
                if (!columns.some((col) => col.key === k)) {
                    // A column only some documents have goes after the one it follows, so Unit Price stays before Amount.
                    const previous = c ? columns.findIndex((col) => col.key === keys[i][c - 1]) : -1;
                    columns.splice(previous + 1, 0, { key: k, name: m.headers[c] || "" });
                }
            });
        });
        const header = [{ v: "Document", type: "s", header: true }, ...columns.map((col) => ({ v: col.name, type: "s", header: true }))];
        const rows = [header];
        sheets.forEach((sheet, i) => {
            const where = keys[i].map((k) => columns.findIndex((col) => col.key === k));
            for (const row of sheet.main.rows) {
                // Section headings with their subtotals are bold: summing them with the lines would count twice.
                if (row.filter((cell) => cell && cell.v !== "").every((cell) => cell.bold)) {
                    continue;
                }
                const out = [{ v: sheet.name, type: "s" }, ...columns.map(() => null)];
                row.forEach((cell, c) => {
                    if (cell && where[c] >= 0) {
                        out[where[c] + 1] = { ...cell, indent: 0 };
                    }
                });
                rows.push(out);
            }
        });
        const widths = header.map((_, c) => Math.min(60, Math.max(10, ...rows.map((row) => {
            const cell = row[c];
            return cell ? (cell.type === "n" ? 14 : cell.type === "d" ? 12 : String(cell.v).split("\n")[0].length + 2) : 0;
        }))));
        return { name: "All lines", rows, merges: [], widths, freezeRow: 1, filter: { r1: 0, c1: 0, r2: rows.length - 1, c2: header.length - 1 } };
    }

    /**
     * @param {string} html report HTML from /report/html/...
     * @param {{decimalPoint: string, thousandsSep: string, dateFormat: string, title: string}} options
     */
    ns.convertReport = function convertReport(html, options) {
        const doc = new DOMParser().parseFromString(html, "text/html");
        const loc = { ...options, dateMatcher: dateMatcher(options.dateFormat) };
        // Each printed record is an .article; page headers and footers repeat company details.
        let articles = [...doc.querySelectorAll(".article")];
        if (!articles.length) {
            articles = [doc.querySelector("main") || doc.body];
        }
        const sheets = articles.map((article, index) => {
            for (const repeated of article.querySelectorAll(".header, .footer, .o_report_layout_header, .o_footer")) {
                repeated.remove();
            }
            // The report's own heading ("YourCompany: Trial Balance" → "Trial Balance") names the sheet.
            const heading = article.querySelector("h1, h2, h3");
            const name = (heading && textOf(heading).replace(/^.*?:\s*/, "")) || options.title || `Report ${index + 1}`;
            const builder = new SheetBuilder(name, loc);
            // The whole document: addresses and the title often sit outside .page.
            builder.walk(article);
            return builder.result();
        }).filter((sheet) => sheet.rows.length);
        if (!sheets.length) {
            throw new Error("This report has no content that can be put in a spreadsheet.");
        }
        const combined = allLinesSheet(sheets);
        for (const sheet of sheets) {
            delete sheet.main;
        }
        if (combined) {
            sheets.unshift(combined);
        }
        return { sheets, title: sheets.length === 1 ? sheets[0].name : options.title };
    };
})();
