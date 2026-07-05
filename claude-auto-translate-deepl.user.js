// ==UserScript==
// @name         Claude.ai Auto-Translate to English (DeepL)
// @namespace    https://claude.ai/
// @version      1.2.0
// @description  Translates whatever you type into Claude.ai's chat box into English (via DeepL) before sending, with a preview/confirm step.
// @author       drafter0364
// @match        https://claude.ai/*
// @grant        GM_xmlhttpRequest
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_registerMenuCommand
// @connect      api-free.deepl.com
// @connect      api.deepl.com
// @run-at       document-idle
// ==/UserScript==

/*
 * CHANGELOG (v1.1.0)
 * - Fixed: resend detection now normalizes whitespace before comparing,
 *   so it no longer gets stuck re-translating text it already translated
 *   (innerText can insert/drop blank lines vs. the raw string you inserted).
 * - Fixed: findSendButton() had only one exact selector guess; added a
 *   fallback chain so it keeps working if Claude.ai's markup changes.
 * - Fixed: guard against DeepL returning empty/whitespace text, which
 *   would previously wipe out the user's message.
 * - Fixed: DeepL error responses (bad key, quota, etc.) are now surfaced
 *   with the actual error message instead of a generic parse failure.
 * - Added: retry cap so a persistent mismatch can't loop forever.
 *
 * CHANGELOG (v1.2.0)
 * - Fixed: DeepL deprecated the legacy 'auth_key' form-body parameter
 *   (Nov 2025). The key is now sent via an Authorization header instead,
 *   which fixes the "Legacy authentication method 'form body' is no
 *   longer supported" error.
 */

(function () {
  'use strict';

  // ---------- Settings ----------
  const STORAGE_KEY_API = 'deepl_api_key';
  const STORAGE_KEY_ENABLED = 'auto_translate_enabled';
  const MAX_AUTO_RETRANSLATE = 3; // safety cap

  function getApiKey() {
    return GM_getValue(STORAGE_KEY_API, '');
  }

  function isEnabled() {
    return GM_getValue(STORAGE_KEY_ENABLED, true);
  }

  function setEnabled(val) {
    GM_setValue(STORAGE_KEY_ENABLED, val);
    updateToggleButton();
  }

  GM_registerMenuCommand('Set DeepL API Key', () => {
    const current = getApiKey();
    const key = window.prompt(
      'Enter your DeepL API key (free keys end in ":fx", Pro keys do not):',
      current
    );
    if (key !== null) {
      GM_setValue(STORAGE_KEY_API, key.trim());
      alert('DeepL API key saved.');
    }
  });

  // ---------- Floating toggle button ----------
  let toggleBtn = null;

  function createToggleButton() {
    if (toggleBtn) return;
    toggleBtn = document.createElement('button');
    toggleBtn.style.position = 'fixed';
    toggleBtn.style.bottom = '20px';
    toggleBtn.style.right = '20px';
    toggleBtn.style.zIndex = '999999';
    toggleBtn.style.padding = '8px 12px';
    toggleBtn.style.borderRadius = '20px';
    toggleBtn.style.border = 'none';
    toggleBtn.style.cursor = 'pointer';
    toggleBtn.style.fontSize = '13px';
    toggleBtn.style.fontFamily = 'sans-serif';
    toggleBtn.style.boxShadow = '0 2px 6px rgba(0,0,0,0.3)';
    toggleBtn.title = 'Toggle auto-translate to English';
    toggleBtn.addEventListener('click', () => setEnabled(!isEnabled()));
    document.body.appendChild(toggleBtn);
    updateToggleButton();
  }

  function updateToggleButton() {
    if (!toggleBtn) return;
    const on = isEnabled();
    toggleBtn.textContent = on ? '🌐 Translate: ON' : '🌐 Translate: OFF';
    toggleBtn.style.background = on ? '#2e7d32' : '#616161';
    toggleBtn.style.color = '#fff';
  }

  // ---------- Finding Claude's composer ----------
  function findEditor() {
    // Claude.ai's composer is a contenteditable ProseMirror div.
    // Prefer the most specific selector first; fall back progressively.
    return document.querySelector('div[contenteditable="true"].ProseMirror')
      || document.querySelector('div[contenteditable="true"][data-testid="chat-input"]')
      || document.querySelector('div[contenteditable="true"]');
  }

  function findSendButton() {
    // Try known/likely selectors first.
    const candidates = [
      'button[aria-label="Send Message"]',
      'button[aria-label="Send message"]',
      'button[data-testid="send-button"]',
    ];
    for (const sel of candidates) {
      const el = document.querySelector(sel);
      if (el) return el;
    }

    // Fallback 1: any button whose aria-label mentions "send".
    const byLabel = Array.from(document.querySelectorAll('button')).find(b =>
      (b.getAttribute('aria-label') || '').toLowerCase().includes('send')
    );
    if (byLabel) return byLabel;

    // Fallback 2: look for a non-disabled button near the composer
    // (e.g. sharing a common form/toolbar ancestor with the editor).
    const editor = findEditor();
    if (editor) {
      let container = editor.closest('form') || editor.parentElement;
      let hops = 0;
      while (container && hops < 5) {
        const btn = Array.from(container.querySelectorAll('button')).find(
          b => !b.disabled && b.querySelector('svg')
        );
        if (btn) return btn;
        container = container.parentElement;
        hops++;
      }
    }
    return null;
  }

  function getEditorText(editor) {
    return editor.innerText.replace(/\u00a0/g, ' ').trim();
  }

  // Collapse all whitespace runs so trivial newline/space differences
  // between what we inserted and what innerText reports don't break
  // the "this was already translated, let it send" comparison.
  function normalizeForCompare(text) {
    return text.replace(/\s+/g, ' ').trim();
  }

  function replaceEditorText(editor, text) {
    editor.focus();
    document.execCommand('selectAll', false, null);
    document.execCommand('insertText', false, text);
  }

  // ---------- DeepL call ----------
  function translateToEnglish(text) {
    return new Promise((resolve, reject) => {
      const key = getApiKey();
      if (!key) {
        reject(new Error('No DeepL API key set. Use the Tampermonkey menu to set one.'));
        return;
      }
      const isFree = key.trim().endsWith(':fx');
      const host = isFree ? 'https://api-free.deepl.com' : 'https://api.deepl.com';
      // DeepL deprecated sending the key as a form parameter (auth_key) in
      // Nov 2025 -- it must now be sent as an Authorization header instead.
      const params = new URLSearchParams();
      params.set('text', text);
      params.set('target_lang', 'EN');

      GM_xmlhttpRequest({
        method: 'POST',
        url: `${host}/v2/translate`,
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Authorization': `DeepL-Auth-Key ${key.trim()}`,
        },
        data: params.toString(),
        onload: (res) => {
          let json;
          try {
            json = JSON.parse(res.responseText);
          } catch (e) {
            reject(new Error(`Failed to parse DeepL response (status ${res.status}): ${res.responseText}`));
            return;
          }

          if (json.message || json.error) {
            // DeepL error payloads look like { message: "..." } or { error: {...} }
            reject(new Error(`DeepL API error: ${json.message || JSON.stringify(json.error)}`));
            return;
          }

          const translated = json.translations && json.translations[0] && json.translations[0].text;
          if (!translated || !translated.trim()) {
            reject(new Error('DeepL returned an empty translation.'));
            return;
          }
          resolve(translated);
        },
        onerror: (err) => reject(new Error('DeepL request failed: ' + JSON.stringify(err))),
      });
    });
  }

  // Simple heuristic: skip translation if text is already plain ASCII/English-looking.
  function looksAlreadyEnglish(text) {
    // If more than ~95% of characters are basic ASCII letters/punctuation/space, assume English.
    const nonAscii = text.replace(/[\x00-\x7F]/g, '');
    return nonAscii.length === 0;
  }

  // ---------- Core interception logic ----------
  // pendingText: the (normalized) text that was last shown as a translation preview.
  // If the box still contains this text when Enter/Send is pressed again, we let it through.
  const state = {
    pendingText: null,
    isTranslating: false,
    retranslateCount: 0,
  };

  // NOTE: these listeners are attached to `document` (not the editor/button themselves),
  // with capture: true. That's what makes them fire BEFORE Claude's own React-managed
  // handlers, since document sits above Claude's app root in the DOM tree. Attaching
  // directly to the editor/button does NOT reliably preempt Claude's own listener on
  // that same element -- at the target itself, listeners run in registration order,
  // regardless of the capture flag, so if Claude's handler was registered first (which
  // it was, since it mounted before our script ran), it would win.
  function handleEnterOrSendIntercept(e, editor) {
    const currentText = getEditorText(editor);
    if (!currentText) return;

    const normalizedCurrent = normalizeForCompare(currentText);

    // If this text (ignoring whitespace differences) was already shown as a
    // translated preview, let it send normally.
    if (state.pendingText !== null && normalizedCurrent === state.pendingText) {
      state.pendingText = null;
      state.retranslateCount = 0;
      return; // do not preventDefault; allow normal send
    }

    if (looksAlreadyEnglish(currentText)) {
      state.pendingText = null;
      state.retranslateCount = 0;
      return; // nothing to translate, let it send
    }

    if (state.retranslateCount >= MAX_AUTO_RETRANSLATE) {
      // Something's mismatching repeatedly (e.g. DeepL keeps tweaking
      // punctuation). Stop fighting the user and just let it send as-is.
      console.warn('[Auto-Translate] Giving up after repeated mismatches; sending as-is.');
      state.pendingText = null;
      state.retranslateCount = 0;
      return;
    }

    // Otherwise: intercept, translate, show preview, do not send yet.
    e.preventDefault();
    e.stopPropagation();
    if (e.stopImmediatePropagation) e.stopImmediatePropagation();
    state.retranslateCount++;
    runTranslatePreview(editor, currentText);
  }

  function attachIfNeeded() {
    if (document.body.dataset.autoTranslateDocListeners === 'true') return;
    document.body.dataset.autoTranslateDocListeners = 'true';

    document.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter' || e.shiftKey || e.isComposing) return;
      if (!isEnabled() || state.isTranslating) return;

      const editor = findEditor();
      if (!editor) return;
      if (e.target !== editor && !editor.contains(e.target)) return;

      handleEnterOrSendIntercept(e, editor);
    }, true);

    document.addEventListener('click', (e) => {
      if (!isEnabled() || state.isTranslating) return;

      const sendBtn = findSendButton();
      if (!sendBtn) return;
      if (e.target !== sendBtn && !sendBtn.contains(e.target)) return;

      const editor = findEditor();
      if (!editor) return;

      handleEnterOrSendIntercept(e, editor);
    }, true);

    // Reset pending state whenever the editor content changes (user edited the preview).
    document.addEventListener('input', (e) => {
      const editor = findEditor();
      if (!editor) return;
      if (e.target !== editor && !editor.contains(e.target)) return;
      const normalizedCurrent = normalizeForCompare(getEditorText(editor));
      if (state.pendingText !== null && normalizedCurrent !== state.pendingText) {
        state.pendingText = null;
        state.retranslateCount = 0;
      }
    }, true);
  }

  async function runTranslatePreview(editor, originalText) {
    state.isTranslating = true;
    const originalOpacity = editor.style.opacity;
    editor.style.opacity = '0.6';
    try {
      const translated = await translateToEnglish(originalText);
      replaceEditorText(editor, translated);
      state.pendingText = normalizeForCompare(translated);
    } catch (err) {
      console.error('[Auto-Translate]', err);
      alert('Translation failed: ' + err.message + '\n\nOriginal text was left in the box.');
      state.pendingText = null;
      state.retranslateCount = 0;
    } finally {
      editor.style.opacity = originalOpacity || '';
      state.isTranslating = false;
    }
  }

  // ---------- Init ----------
  createToggleButton();
  setInterval(attachIfNeeded, 1000);
  attachIfNeeded();
})();
