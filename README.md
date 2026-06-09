# LCSC → Homebox

[![Lint](https://github.com/NikoVonLas/chrome-lcsc-homebox/actions/workflows/lint.yml/badge.svg)](https://github.com/NikoVonLas/chrome-lcsc-homebox/actions/workflows/lint.yml)
[![GitHub Release](https://img.shields.io/github/v/release/NikoVonLas/chrome-lcsc-homebox)](https://github.com/NikoVonLas/chrome-lcsc-homebox/releases/latest)
[![Quality Gate Status](https://sonarcloud.io/api/project_badges/measure?project=NikoVonLas_chrome-lcsc-homebox&metric=alert_status)](https://sonarcloud.io/summary/new_code?id=NikoVonLas_chrome-lcsc-homebox)

A browser extension that saves LCSC components to [Homebox](https://github.com/sysadminsmedia/homebox) in one click — with images, datasheet, specs, and manufacturer info.

## Features

- Reads component data directly from the page — no extra network requests
- Saves name (MPN), manufacturer, model number, and full specs as notes
- Uploads all product images and the PDF datasheet as attachments
- Location picker at save time — choose where in Homebox to place the component
- Optionally stores the LCSC part number as the serial number (`LCSC:C2040`)
- English and Russian UI

## Installation

### Chrome
1. Download the latest `extension-chrome.zip` from [Releases](https://github.com/NikoVonLas/chrome-lcsc-homebox/releases/latest) and unpack it
2. Open `chrome://extensions` → enable **Developer mode** → **Load unpacked** → select the folder

### Firefox
1. Download the latest `extension-firefox.zip` from [Releases](https://github.com/NikoVonLas/chrome-lcsc-homebox/releases/latest)
2. Open `about:debugging` → **This Firefox** → **Load Temporary Add-on** → select the ZIP

## Configuration

Click the extension icon and fill in:

| Field | Description |
|---|---|
| **Homebox URL** | Your Homebox instance, e.g. `http://192.168.1.100:7745` |
| **API Token** | Generate in Homebox → Profile → **API Keys** |
| **Save LCSC Part # as Serial Number** | Stores `LCSC:C2040` in the serial number field (on by default) |

Use **Test Connection** to verify the settings before saving.

## Usage

1. Open any component page on [lcsc.com](https://www.lcsc.com), e.g. `lcsc.com/product-detail/C2040.html`
2. Click the Homebox icon next to the share button
3. Select a location from the dropdown (or leave blank)
4. Click **Save** — a toast notification will appear with a link to the created item

## Development

```bash
git clone https://github.com/NikoVonLas/chrome-lcsc-homebox.git
cd chrome-lcsc-homebox
```

Load unpacked in Chrome (`chrome://extensions` → Developer mode → Load unpacked) or temporarily in Firefox (`about:debugging`).

No build step required — the extension is plain JavaScript.

## CI

| Workflow | Trigger | What it does |
|---|---|---|
| **Lint** | Every push / PR | Runs `web-ext lint` against the Firefox-merged manifest |
| **Release** | Tag `v*` | Builds `extension-chrome.zip` and `extension-firefox.zip`, publishes a GitHub Release; submits to AMO if `AMO_JWT_ISSUER` / `AMO_JWT_SECRET` secrets are set |

## License

MIT
