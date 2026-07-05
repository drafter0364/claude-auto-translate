# Changelog

## 2.0.0
- Refactored: abstracted the translation engine into a pluggable provider
  interface. Now supports **DeepL**, **Google Translate**, and **Microsoft
  Translator** — switch between them via a visual settings panel.
- Added: a floating settings panel (open via Tampermonkey menu or right-click
  the toggle button) for choosing a provider and configuring API keys.
- Updated: the toggle button now displays the active provider name
  (e.g. `🌐 Google Translate: ON`).
- Removed: the old `Set DeepL API Key` prompt — replaced by the settings panel.

## 1.2.0
- Fixed: DeepL deprecated the legacy `auth_key` form-body parameter
  (November 2025). The API key is now sent via an `Authorization` header
  instead, fixing the "Legacy authentication method 'form body' is no
  longer supported" error.

## 1.1.0
- Fixed: resend detection now normalizes whitespace before comparing, so it
  no longer gets stuck re-translating text it already translated.
- Fixed: `findSendButton()` now has a fallback chain instead of a single
  exact selector guess, making it more resilient to Claude.ai UI changes.
- Fixed: guard against DeepL returning an empty/whitespace translation,
  which previously could wipe out the user's message.
- Fixed: DeepL error responses are now surfaced with their actual error
  message instead of a generic parse failure.
- Added: a retry cap so a persistent text mismatch can't loop forever.

## 1.0.0
- Initial release.
