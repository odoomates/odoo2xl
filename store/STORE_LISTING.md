# Store listings: Odoo2XL

## Name
Odoo2XL - Odoo Excel Reports

## Summary (manifest description, max 132 characters)
Print Odoo reports as Excel: real numbers, dates and currency formats. Adds Excel to the Print menu. Odoo 15–20.

## Category
Productivity (Workflow & Planning)

## Language
English

## Description
Get any Odoo report as a real Excel spreadsheet in one click. No more copying numbers out of PDFs, no Odoo module to install, no server changes.

Every PDF report in Odoo's Print menu gets an "(Excel)" twin: "Invoices (Excel)", "Quotation / Order (Excel)", "Delivery Slip (Excel)" and so on. Reports printed from a wizard ask: PDF, Excel or both.

GET STARTED IN 3 STEPS
1. Install the extension and pin it to your toolbar (puzzle-piece icon → pin).
2. Open your Odoo database, click the Odoo2XL icon and tick "Offer Excel when printing reports on this site".
3. Click Allow when the browser asks for access to your Odoo site. Print any report: the Excel option is there.

The extension stays off until you turn it on for a site, so nothing changes on other websites.

A REAL SPREADSHEET, NOT A PICTURE OF A PDF
• Amounts are numbers you can sum, filter and pivot, in the currency's format (2 or 3 decimals, e.g. USD or KWD).
• Dates are real Excel dates. Account codes and references stay as text, so leading zeros are kept.
• Quantities keep their unit ("10.00 Units") and still add up.
• Bold totals, indented account levels, a frozen header row and filters on the main table.
• Report filters (dates, journals, target moves) appear above the table.
• Printing several records at once gives one sheet per document, plus an "All lines" sheet with every line and a Document column, ready for pivot tables.
• Files are named after the record (S00033.xlsx, WH-OUT-00006.xlsx), or the report and date for wizard reports (Trial Balance 2026-10-08.xlsx).
• Printing the spreadsheet fits all columns on the page.

REPORTS IT WORKS WITH
It works with reports printed from a wizard, with records such as sales orders, invoices and delivery slips from the Print menu, and with most other reports laid out as tables.

WHO IT'S FOR
Accountants, bookkeepers, auditors and managers who need Odoo figures in Excel to check, reconcile, share or analyse them.

QUESTIONS
• Which Odoo versions? 15, 16, 17, 18, 19 and 20, Community and Enterprise, on Odoo Online, Odoo.sh or your own server.
• Do I need to be an admin or install a module? No. It uses the report you can already print, with your own login and access rights.
• Does it change my Odoo data? No. It only reads the report Odoo prepares for printing.
• Can I skip the PDF/Excel question? Yes, tick "Remember for this report". You can change or clear remembered choices from the toolbar popup.
• Older Odoo version? Email odoomates@gmail.com and we can make it work for you.

PRIVATE BY DESIGN
• Turned on per Odoo site, by you, from the toolbar button.
• The spreadsheet is built in your browser. Nothing is sent anywhere except your own Odoo. No account, no server, no tracking.

Limits: images, logos and barcodes are skipped. Reports laid out without tables come out as text rows.

Questions, a report that doesn't convert well, or a feature you'd like? Open an issue at github.com/odoomates/odoo2xl/issues or email odoomates@gmail.com.

This extension is not affiliated with or endorsed by Odoo S.A. Odoo is a trademark of Odoo S.A.

## Single purpose (privacy tab)
Lets users download Odoo's printable reports as Excel spreadsheets, from Odoo's Print menu and report dialogs.

## Permission justifications (privacy tab)
- **storage**: remembers which Odoo sites the user enabled, and the format chosen per report when "Remember for this report" is ticked.
- **scripting**: adds the Excel option to Odoo's Print menu and report dialogs on the Odoo sites the user enabled, and converts the report into a spreadsheet in that page.
- **activeTab**: when the user clicks the toolbar button, checks whether the current tab is an Odoo database so the popup can offer to enable it.
- **Host permissions (optional, http://*/* and https://*/*)**: Odoo runs on any domain (company servers, odoo.com, odoo.sh). Access is requested at runtime for the single Odoo site the user turns on, never for all sites at once.
- **Remote code**: none. All code is in the package.

## Data usage (privacy tab)
- Collects no user data: no personal information, authentication data, financial data, communications, location, web history or user activity is collected or transmitted.
- Report contents are read only inside the user's Odoo page to build the file and are never sent anywhere.
- Certify: not sold to third parties, not used for unrelated purposes, not used for creditworthiness or lending.

## Images
- Icon: icons/icon128.png
- Screenshots (1280x800):
  1. store/1-print-menu.png
  2. store/2-choose-format.png
  3. store/3-real-spreadsheet.png
  4. store/4-per-site.png
- Small promo tile (440x280): store/promo-tile-440x280.png
- Marquee promo tile (1400x560, optional; used if Google features the extension): store/marquee-1400x560.png

## Privacy policy URL
https://github.com/odoomates/odoo2xl/blob/main/PRIVACY.md

---

# Firefox Add-ons (addons.mozilla.org)

- Package: `dist/odoo2xl-<version>-firefox.zip` (`python3 build.py firefox`).
- Source code question: **No**. The code is plain JavaScript, not minified or bundled.
- Name, summary and description: the same as above.
- Categories: **Download Management** and **Other**.
- Support email: odoomates@gmail.com. Homepage: https://github.com/odoomates/odoo2xl
- License: **MIT License**.
- Privacy policy: paste the text of PRIVACY.md (AMO takes the text itself), or link https://github.com/odoomates/odoo2xl/blob/main/PRIVACY.md
- Screenshots: the same four images in `store/`.
- Data collection: declared in the manifest as none (`data_collection_permissions: none`).
