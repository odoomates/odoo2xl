// Small .xlsx (Office Open XML) writer with the formatting accounting reports need:
// bold/header rows, indentation, number and date formats, merged cells, column widths,
// a frozen header row and a filter on the main table.
(() => {
    const ns = (window.__odooReportExcel = window.__odooReportExcel || {});

    const XML_HEAD = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n';
    const MAIN_NS = "http://schemas.openxmlformats.org/spreadsheetml/2006/main";
    const REL_NS = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";

    function esc(value) {
        return String(value)
            .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "")
            .replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
    }

    function columnName(index) {
        let name = "";
        let n = index + 1;
        while (n > 0) {
            const m = (n - 1) % 26;
            name = String.fromCharCode(65 + m) + name;
            n = Math.floor((n - 1) / 26);
        }
        return name;
    }

    const ref = (row, col) => `${columnName(col)}${row + 1}`;

    // Fonts: 0 normal, 1 bold, 2 title, 3 italic. Fills: 0/1 required, 2 header. Borders: 0 none, 1 header.
    const FONTS = [
        '<font><sz val="11"/><name val="Calibri"/></font>',
        '<font><b/><sz val="11"/><name val="Calibri"/></font>',
        '<font><b/><sz val="14"/><name val="Calibri"/></font>',
        '<font><i/><sz val="11"/><name val="Calibri"/></font>',
    ];

    class Styles {
        constructor() {
            this.numFmts = new Map(); // format code -> id
            this.xfs = ['<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>'];
            this.keys = new Map([["default", 0]]);
        }

        numFmtId(code) {
            if (!code) {
                return 0;
            }
            if (!this.numFmts.has(code)) {
                this.numFmts.set(code, 164 + this.numFmts.size);
            }
            return this.numFmts.get(code);
        }

        index(cell) {
            const font = cell.title ? 2 : cell.bold || cell.header ? 1 : cell.italic ? 3 : 0;
            const numFmt = cell.type === "d" && !cell.numFmt ? 14 : this.numFmtId(cell.numFmt);
            const fill = cell.header ? 2 : 0;
            const border = cell.header ? 1 : 0;
            const indent = Math.min(cell.indent || 0, 15);
            const wrap = cell.wrap ? 1 : 0;
            const halign = cell.align || "";
            const key = [font, numFmt, fill, border, indent, wrap, halign].join("|");
            if (key === "0|0|0|0|0|0|") {
                return 0;
            }
            if (!this.keys.has(key)) {
                const alignment = indent || wrap || halign
                    ? `<alignment${halign ? ` horizontal="${halign}"` : indent ? ' horizontal="left"' : ""}${indent ? ` indent="${indent}"` : ""}${wrap ? ' wrapText="1" vertical="top"' : ""}/>`
                    : "";
                this.xfs.push(`<xf numFmtId="${numFmt}" fontId="${font}" fillId="${fill}" borderId="${border}" xfId="0"`
                    + `${numFmt ? ' applyNumberFormat="1"' : ""}${font ? ' applyFont="1"' : ""}${fill ? ' applyFill="1"' : ""}`
                    + `${border ? ' applyBorder="1"' : ""}${alignment ? ` applyAlignment="1">${alignment}</xf>` : "/>"}`);
                this.keys.set(key, this.xfs.length - 1);
            }
            return this.keys.get(key);
        }

        xml() {
            const numFmts = [...this.numFmts].map(([code, id]) => `<numFmt numFmtId="${id}" formatCode="${esc(code)}"/>`);
            return `${XML_HEAD}<styleSheet xmlns="${MAIN_NS}">`
                + (numFmts.length ? `<numFmts count="${numFmts.length}">${numFmts.join("")}</numFmts>` : "")
                + `<fonts count="${FONTS.length}">${FONTS.join("")}</fonts>`
                + '<fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill>'
                + '<fill><patternFill patternType="solid"><fgColor rgb="FFF2F2F2"/><bgColor indexed="64"/></patternFill></fill></fills>'
                + '<borders count="2"><border><left/><right/><top/><bottom/><diagonal/></border>'
                + '<border><left/><right/><top/><bottom style="thin"><color rgb="FF999999"/></bottom><diagonal/></border></borders>'
                + '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>'
                + `<cellXfs count="${this.xfs.length}">${this.xfs.join("")}</cellXfs>`
                + '<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>'
                + "</styleSheet>";
        }
    }

    function cellXml(cell, r, c, styles) {
        const s = styles.index(cell);
        const style = s ? ` s="${s}"` : "";
        const at = ref(r, c);
        if (cell.v === null || cell.v === undefined || cell.v === "") {
            return s ? `<c r="${at}"${style}/>` : "";
        }
        if ((cell.type === "n" || cell.type === "d") && Number.isFinite(cell.v)) {
            return `<c r="${at}"${style}><v>${cell.v}</v></c>`;
        }
        return `<c r="${at}"${style} t="inlineStr"><is><t xml:space="preserve">${esc(cell.v)}</t></is></c>`;
    }

    function sheetXml(sheet, styles) {
        const rows = sheet.rows.map((row, r) => {
            const cells = (row || []).map((cell, c) => (cell ? cellXml(cell, r, c, styles) : "")).join("");
            return cells ? `<row r="${r + 1}">${cells}</row>` : "";
        }).join("");
        const cols = (sheet.widths || []).map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`).join("");
        const freeze = sheet.freezeRow
            ? `<sheetViews><sheetView workbookViewId="0"><pane ySplit="${sheet.freezeRow}" topLeftCell="A${sheet.freezeRow + 1}" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>`
            : '<sheetViews><sheetView workbookViewId="0"/></sheetViews>';
        const filter = sheet.filter ? `<autoFilter ref="${ref(sheet.filter.r1, sheet.filter.c1)}:${ref(sheet.filter.r2, sheet.filter.c2)}"/>` : "";
        const merges = (sheet.merges || []).length
            ? `<mergeCells count="${sheet.merges.length}">${sheet.merges.map((m) => `<mergeCell ref="${ref(m.r1, m.c1)}:${ref(m.r2, m.c2)}"/>`).join("")}</mergeCells>`
            : "";
        // Printing: all columns on one page width, landscape when the report is wide.
        const columnCount = (sheet.widths || []).length;
        const landscape = columnCount > 5 || (sheet.widths || []).reduce((a, b) => a + b, 0) > 90;
        const page = '<pageMargins left="0.4" right="0.4" top="0.5" bottom="0.5" header="0.3" footer="0.3"/>'
            + `<pageSetup orientation="${landscape ? "landscape" : "portrait"}" fitToWidth="1" fitToHeight="0"/>`;
        return `${XML_HEAD}<worksheet xmlns="${MAIN_NS}" xmlns:r="${REL_NS}"><sheetPr><pageSetUpPr fitToPage="1"/></sheetPr>${freeze}`
            + (cols ? `<cols>${cols}</cols>` : "")
            + `<sheetData>${rows}</sheetData>${filter}${merges}${page}</worksheet>`;
    }

    function sheetName(name, used) {
        let base = String(name || "Sheet").replace(/[\[\]:*?/\\]/g, " ").replace(/\s+/g, " ").trim().slice(0, 31) || "Sheet";
        let candidate = base;
        let n = 2;
        while (used.has(candidate.toLowerCase())) {
            const suffix = ` (${n++})`;
            candidate = base.slice(0, 31 - suffix.length) + suffix;
        }
        used.add(candidate.toLowerCase());
        return candidate;
    }

    /**
     * @param {{sheets: {name: string, rows: object[][], merges?: object[], widths?: number[],
     *          freezeRow?: number, filter?: object}[]}} workbook
     * @returns {Blob}
     */
    ns.buildXlsx = function buildXlsx(workbook) {
        const styles = new Styles();
        const used = new Set();
        const sheets = workbook.sheets.map((sheet, i) => ({ ...sheet, name: sheetName(sheet.name, used), file: `sheet${i + 1}.xml` }));
        const sheetFiles = sheets.map((sheet) => ({ name: `xl/worksheets/${sheet.file}`, data: sheetXml(sheet, styles) }));
        const files = [
            {
                name: "[Content_Types].xml",
                data: `${XML_HEAD}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">`
                    + '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'
                    + '<Default Extension="xml" ContentType="application/xml"/>'
                    + '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>'
                    + '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>'
                    + sheets.map((s) => `<Override PartName="/xl/worksheets/${s.file}" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join("")
                    + "</Types>",
            },
            {
                name: "_rels/.rels",
                data: `${XML_HEAD}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">`
                    + '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>'
                    + "</Relationships>",
            },
            {
                name: "xl/workbook.xml",
                data: `${XML_HEAD}<workbook xmlns="${MAIN_NS}" xmlns:r="${REL_NS}"><sheets>`
                    + sheets.map((s, i) => `<sheet name="${esc(s.name)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join("")
                    + "</sheets>"
                    + (sheets.some((s) => s.filter)
                        ? `<definedNames>${sheets.map((s, i) => (s.filter
                            ? `<definedName name="_xlnm._FilterDatabase" localSheetId="${i}" hidden="1">'${esc(s.name.replace(/'/g, "''"))}'!$${columnName(s.filter.c1)}$${s.filter.r1 + 1}:$${columnName(s.filter.c2)}$${s.filter.r2 + 1}</definedName>`
                            : "")).join("")}</definedNames>`
                        : "")
                    + "</workbook>",
            },
            {
                name: "xl/_rels/workbook.xml.rels",
                data: `${XML_HEAD}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">`
                    + sheets.map((s, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/${s.file}"/>`).join("")
                    + `<Relationship Id="rId${sheets.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>`
                    + "</Relationships>",
            },
            ...sheetFiles,
            { name: "xl/styles.xml", data: styles.xml() },
        ];
        const zip = ns.createZip(files);
        return new Blob([zip], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
    };

    ns.excelDate = function excelDate(year, month, day) {
        return (Date.UTC(year, month - 1, day) - Date.UTC(1899, 11, 30)) / 86400000;
    };
})();
