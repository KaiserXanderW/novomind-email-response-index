# novomind-email-response-index

Browser userscript for the Novomind CRM interface at AOHostels. Provides a searchable index of email response templates that can be inserted into text fields via F4 hotkey — now with multi-template combining.

## Features

- **F4 hotkey** opens a floating search box near the focused text field
- **Type to filter** templates by title or tags
- **Build-as-you-click**: select multiple templates to combine into one email
  - First template: greeting + body
  - Subsequent templates: body only (greeting/closing stripped)
- **Closing picker**: choose which closing line to use (e.g., "Bei weiteren Fragen..." vs "Wir freuen uns auf Ihre Rückmeldung.")
- **Language lock**: first selection locks DE/EN; opposite-language buttons disabled
- **Discard on blur**: click X or outside the box to roll back all inserted text
- Supports `textarea`, `input[type=text]`, `contenteditable`, and TinyMCE editors (via iframes)

## Installation

1. Install a userscript manager:
   - [Tampermonkey](https://www.tampermonkey.net/) (recommended)
   - [Greasemonkey](https://www.greasescript.net/)
   - [Violentmonkey](https://violentmonkey.github.io/)
2. Click the install link: [novomind-email-response-index.user.js](https://raw.githubusercontent.com/KaiserXanderW/novomind-email-response-index/main/novomind-email-response-index.user.js)
3. Confirm installation in your userscript manager

## Usage

### Quick insert (single template)

1. Focus any editable field (textarea, contenteditable, etc.)
2. Press **F4** — search box opens
3. Type to filter templates by name or tags
4. Press **Enter** to insert the highlighted template
5. Choose a closing from the dropdown, press **Enter** to confirm

### Build-as-you-click (multiple templates)

1. Press **F4** in an editable field
2. Click the **DE** or **EN** button on a template — its greeting + body is inserted
3. Click another template — only its body is appended (greeting and closing stripped)
4. Continue clicking more templates as needed
5. Press **Enter** to open the closing picker
6. Choose a closing or press **Escape** to skip (signature only)
7. Signature is appended and the box closes

### Keyboard shortcuts

| Key | Action |
|-----|--------|
| **F4** | Open/close search box |
| **Arrow Up/Down** | Navigate template list |
| **Arrow Left/Right** | Switch language (DE/EN) — blocked after first selection |
| **Enter** | Finalize: show closing picker, then insert with closing + signature |
| **Escape** | 1st press: clear selection. 2nd press: discard all + close |
| **Click DE/EN** | Select/append template (build-as-you-click) |
| **Click X** | Discard all inserted text, restore field to pre-F4 state |

## Template Data

Templates are loaded at runtime from a [GitHub Gist](https://gist.github.com/KaiserXanderW/51087d041078b96b8b702e91395331e5). Each template has:

```json
{
  "title": "Template Name",
  "tags": ["tag1", "tag2"],
  "text": {
    "de": "Sehr geehrte Damen und Herren, ...",
    "en": "Dear Sir or Madam, ..."
  },
  "bodyOnly": {
    "de": "Body text without greeting or closing ...",
    "en": "Body text without greeting or closing ..."
  }
}
```

An optional `closings` array provides the closing picker options:

```json
{
  "closings": [
    { "de": "Bei weiteren Fragen stehen wir Ihnen zur Verfügung.", "en": "If you have further questions you can always contact us." },
    { "de": "Wir freuen uns auf Ihre Rückmeldung.", "en": "We are looking forward to hearing from you." }
  ]
}
```

If `bodyOnly` or `closings` are missing, the script falls back to rule-based stripping and hardcoded defaults.

## Updating Templates

1. Edit the [GitHub Gist](https://gist.github.com/KaiserXanderW/51087d041078b96b8b702e91395331e5)
2. The userscript's version auto-update checks `@updateURL` in the header
3. Existing users will be prompted by their userscript manager to update

## Development

The repo contains:
- `novomind-email-response-index.user.js` — the userscript
- `test-page.html` — Playwright test environment
- `test-combining.spec.js` — 15 automated QA scenarios (Playwright)
- `gist-updated.json` — processed template data with bodyOnly/closings (reference)

### Running tests

```bash
npm install @playwright/test
npx playwright install chromium
npx playwright test test-combining.spec.js
```

## Version

Current: 7.14

## License

MIT
