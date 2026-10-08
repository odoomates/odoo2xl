# Odoo2XL

[Privacy policy](PRIVACY.md) · [MIT License](LICENSE)

A Chrome extension that adds an **Excel** option when printing Odoo reports. There are two ways to use it:

- **Odoo's Print menu** gets an "… (Excel)" entry after every PDF report (e.g. "Invoice PDF (Excel)", "Delivery Slip (Excel)"). It prints straight to Excel.
- **Any other Print button** (e.g. an accounting report wizard) asks:
- **PDF** (as usual)
- **Excel** (.xlsx)
- **Both**

It works with the Odoo web client from version 16 onwards, and starts with accounting reports.

## How it works

Odoo builds every PDF report from an HTML page. The extension asks Odoo for that HTML version of the same report: same records, same wizard options, same language and access rights. It then turns the HTML into a spreadsheet in the browser:

- **Tables** become rows and columns. Header rows are bold and shaded, merged cells stay merged, and totals stay bold.
- **Amounts** become real numbers with the currency's format (e.g. `"$" #,##0.00`, 3 decimals for KWD). They're read using the user's decimal and thousands separators. Negatives keep their sign and symbol.
- **Dates** become real dates. Codes and references ("101000", "INV/2026/0001") stay text.
- **Account levels** become Excel indentation. Odoo's templates indent with hidden white dots; the extension drops those.
- **Filters** like "Date from", "Target Moves" and "Journals" go above the table as label/value cells.
- **Quantities with a unit** ("10.00 Units") become numbers shown with the unit. **Dates and date-times** become real Excel dates.
- **Addresses, the document title and info blocks** ("Invoice Date", "Salesperson") go above the lines table.
- **Easy to work with:** the main table gets a frozen header row and a filter. Each printed record or journal gets its own sheet. Printing fits all columns to the page width.
- **Several documents at once** (e.g. 20 invoices selected in a list) also get an **All lines** sheet: every line of every document, with a Document column, ready for filtering and pivot tables.
- **File names** follow the record: `S00033.xlsx`, `WH-OUT-00006.xlsx`, or `Invoice PDF - INV-2026-00008 to INV-2026-00012 (5).xlsx` for several. Wizard reports use the report title and date: `Trial Balance 2026-10-08.xlsx`.

Nothing is sent anywhere except your own Odoo. Nothing is installed on the server.

## Install (development)

**Chrome / Edge**

1. Open `chrome://extensions` and turn on **Developer mode**.
2. Click **Load unpacked** and choose this folder.

**Firefox (128 or newer)**

1. Run `python3 build.py firefox`.
2. Open `about:debugging#/runtime/this-firefox` → **Load Temporary Add-on…** and pick `dist/odoo2xl-<version>-firefox.zip`.

Then open your Odoo database, click the extension icon, and tick **Offer Excel when printing reports on this site**. Allow access to the site when the browser asks.

## Build the store packages

`python3 build.py` writes, from the same code:
- `dist/odoo2xl-<version>-chrome.zip` for the Chrome Web Store;
- `dist/odoo2xl-<version>-firefox.zip` for Firefox Add-ons.

The Firefox package swaps the Chrome-only parts of `manifest.json`: background script instead of service worker, add-on ID `odoo2xl@odoomates`, minimum Firefox 128, and the declaration that no data is collected.

Tick **Remember for this report** in the print dialog to skip the question next time. Change or clear remembered choices in the popup.

## Tested

Firefox 155 (on Odoo 19): install, enabling a site through the permission flow, a Trial Balance from the PDF / Excel / Both dialog and a sales order from the Print menu "(Excel)" entry.

Site access is requested for the host without its port (e.g. `http://erp.example.com/*`), because Firefox doesn't accept ports in site patterns.

Chrome:

Odoo 16, 17, 18, 19 and 20 (master), all 12 checks passing on each (2026-10-08):

- **Print menu "(Excel)" entries:**
  - two invoices from the list (with the All lines sheet)
  - a sales order
  - a delivery slip
- **Accounting wizards** from `accounting_pdf_reports` (PDF / Excel / Both dialog):
  - Trial Balance, General Ledger, Partner Ledger, Aged Partner Balance
  - Balance Sheet, Profit and Loss, Tax Report, Journals Audit

Every file was opened with openpyxl to check numbers, dates and text. Some files were also rendered with LibreOffice.

## Limits

- **Free-form layouts:** reports laid out with blocks instead of tables come out as text rows.
- **Images, logos and barcodes** are skipped.
- **Page headers and footers** (company address, page numbers) are left out.

## Layout

| File | Role |
|---|---|
| `src/page/handler.js` | Runs in the page: registers in Odoo's report handlers, asks PDF / Excel / Both, fetches the HTML report |
| `src/page/convert.js` | Report HTML → sheets (tables, amounts, dates, indentation, filters) |
| `src/page/xlsx.js` | Minimal .xlsx writer with styles, number formats, merges, frozen header, filter, page setup |
| `src/page/zip.js` | ZIP writer used by the .xlsx writer |
| `src/bridge.js` | Passes remembered choices between the page and the extension |
| `src/background.js` | Registers the scripts on the Odoo sites you enable |
| `src/popup.*` | Enable per site, manage remembered choices |

## Privacy

Odoo2XL collects no data and sends nothing anywhere except your own Odoo. See the [privacy policy](PRIVACY.md).

## Disclaimer

This extension is not affiliated with or endorsed by Odoo S.A. Odoo is a trademark of Odoo S.A.
