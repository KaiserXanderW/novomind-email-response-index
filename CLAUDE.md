# novomind-email-response-index

Browser userscript for the Novomind CRM interface at AOHostels. Provides a searchable index of email response templates that can be inserted into text fields via F4 hotkey.

## Structure

- `novomind-email-response-index.user.js` — the Tampermonkey/Greasemonkey userscript

## How it works

- **F4** opens a floating search box anchored near the last focused editable field
- Templates are loaded at runtime from a GitHub Gist (JSON)
- Supports plain `input[type=text]`, `textarea`, `contenteditable`, and TinyMCE editors (via iframes)
- Each template has DE and EN variants; arrow keys switch language, Enter inserts
- Insertion uses TinyMCE API if available, falls back to `execCommand('insertHTML')`, then direct `.innerHTML`

## Template data

Templates are fetched from a GitHub Gist. The Gist URL is hardcoded in `loadTemplates()`. Template shape:

```json
[
  {
    "title": "Template name",
    "tags": ["tag1", "tag2"],
    "text": {
      "de": "German text",
      "en": "English text"
    }
  }
]
```

## Repo

https://github.com/KaiserXanderW/novomind-email-response-index
