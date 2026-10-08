#!/usr/bin/env python3
"""Build the store packages from one codebase.

    python3 build.py            # both
    python3 build.py chrome     # dist/odoo2xl-<version>-chrome.zip
    python3 build.py firefox    # dist/odoo2xl-<version>-firefox.zip

manifest.json is written for Chrome. The Firefox package gets the same files
with the few manifest keys Firefox needs instead.
"""
import json
import os
import sys
import zipfile

ROOT = os.path.dirname(os.path.abspath(__file__))
FOLDERS = ("src", "icons")
SKIP = (".svg",)  # source artwork, not used by the browser

FIREFOX_ID = "odoo2xl@odoomates"
# 128: first release with scripting world "MAIN" for registered content scripts.
FIREFOX_MIN_VERSION = "128.0"


def chrome_manifest(manifest):
    return manifest


def firefox_manifest(manifest):
    manifest = json.loads(json.dumps(manifest))
    # Firefox runs MV3 background code as an event page, not a service worker.
    background = manifest.pop("background")
    manifest["background"] = {"scripts": [background["service_worker"]], "type": background.get("type", "classic")}
    manifest.pop("minimum_chrome_version", None)
    manifest["browser_specific_settings"] = {
        "gecko": {
            "id": FIREFOX_ID,
            "strict_min_version": FIREFOX_MIN_VERSION,
            # Firefox's built-in data consent: this add-on collects nothing.
            "data_collection_permissions": {"required": ["none"]},
        },
    }
    return manifest


def build(target):
    with open(os.path.join(ROOT, "manifest.json")) as f:
        manifest = json.load(f)
    manifest = {"chrome": chrome_manifest, "firefox": firefox_manifest}[target](manifest)
    os.makedirs(os.path.join(ROOT, "dist"), exist_ok=True)
    out = os.path.join(ROOT, "dist", f"odoo2xl-{manifest['version']}-{target}.zip")
    with zipfile.ZipFile(out, "w", zipfile.ZIP_DEFLATED) as z:
        z.writestr("manifest.json", json.dumps(manifest, indent=2, ensure_ascii=False) + "\n")
        for folder in FOLDERS:
            for dirpath, _, files in os.walk(os.path.join(ROOT, folder)):
                for name in sorted(files):
                    if name.endswith(SKIP) or name.startswith("."):
                        continue
                    path = os.path.join(dirpath, name)
                    z.write(path, os.path.relpath(path, ROOT))
    print(f"{out} ({os.path.getsize(out)} bytes)")
    return out


if __name__ == "__main__":
    for target in sys.argv[1:] or ("chrome", "firefox"):
        build(target)
