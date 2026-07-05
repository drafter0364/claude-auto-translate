// ==UserScript==
// @name         Claude.ai Auto-Translate to English (Multi-Provider)
// @namespace    https://claude.ai/
// @version      2.0.0
// @description  Translates whatever you type into Claude.ai's chat box into English before sending, with a preview/confirm step. Supports DeepL, Google Translate, and Microsoft Translator.
// @author       drafter0364
// @match        https://claude.ai/*
// @grant        GM_xmlhttpRequest
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_registerMenuCommand
// @connect      api-free.deepl.com
// @connect      api.deepl.com
// @connect      translation.googleapis.com
// @connect      api.cognitive.microsofttranslator.com
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
 *
 * CHANGELOG (v2.0.0)
 * - Refactored: abstracted translation engine into a pluggable provider
 *   interface. Now supports DeepL, Google Translate, and Microsoft
 *   Translator — switchable via a visual settings panel.
 * - Replaced: the old GM_registerMenuCommand prompt with a floating
 *   settings panel for configuring provider and API keys.
 * - Updated: toggle button now shows the active provider name.
 */

(function () {
  'use strict';

  // ---------- Translation Providers ----------

  const PROVIDERS = [
    {
      id: 'deepl',
      name: 'DeepL',
      keyHint: 'Free keys end with :fx, Pro keys do not',
      keyLink: 'https://www.deepl.com/pro-api',
      keyLinkText: 'Get a DeepL API key',
      extraFields: [],
      translate(text, apiKey) {
        const key = apiKey.trim();
        const isFree = key.endsWith(':fx');
        const host = isFree ? 'https://api-free.deepl.com' : 'https://api.deepl.com';
        const params = new URLSearchParams();
        params.set('text', text);
        params.set('target_lang', 'EN');

        return new Promise((resolve, reject) => {
          GM_xmlhttpRequest({
            method: 'POST',
            url: `${host}/v2/translate`,
            headers: {
              'Content-Type': 'application/x-www-form-urlencoded',
              'Authorization': `DeepL-Auth-Key ${key}`,
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
                reject(new Error(`DeepL error: ${json.message || JSON.stringify(json.error)}`));
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
      },
    },

    {
      id: 'google',
      name: 'Google Translate',
      keyHint: 'Google Cloud Translation API key',
      keyLink: 'https://cloud.google.com/translate/docs/setup',
      keyLinkText: 'Get a Google API key',
      extraFields: [],
      translate(text, apiKey) {
        return new Promise((resolve, reject) => {
          const params = new URLSearchParams();
          params.set('q', text);
          params.set('target', 'en');
          params.set('format', 'text');

          GM_xmlhttpRequest({
            method: 'POST',
            url: 'https://translation.googleapis.com/language/translate/v2',
            headers: {
              'Content-Type': 'application/x-www-form-urlencoded',
              'X-goog-api-key': apiKey.trim(),
            },
            data: params.toString(),
            onload: (res) => {
              let json;
              try {
                json = JSON.parse(res.responseText);
              } catch (e) {
                reject(new Error(`Failed to parse Google response (status ${res.status}): ${res.responseText}`));
                return;
              }
              if (json.error) {
                reject(new Error(`Google Translate error: ${json.error.message || JSON.stringify(json.error)}`));
                return;
              }
              const translated = json.data
                && json.data.translations
                && json.data.translations[0]
                && json.data.translations[0].translatedText;
              if (!translated || !translated.trim()) {
                reject(new Error('Google Translate returned an empty translation.'));
                return;
              }
              resolve(translated);
            },
            onerror: (err) => reject(new Error('Google Translate request failed: ' + JSON.stringify(err))),
          });
        });
      },
    },

    {
      id: 'microsoft',
      name: 'Microsoft Translator',
      keyHint: 'Azure Translator resource key',
      keyLink: 'https://portal.azure.com/#create/Microsoft.CognitiveServicesTextTranslation',
      keyLinkText: 'Get an Azure key',
      extraFields: [
        {
          key: 'microsoft_region',
          label: 'Region',
          hint: 'e.g. eastus, westeurope, global',
          defaultVal: 'global',
        },
      ],
      translate(text, apiKey, extra) {
        const region = (extra && extra.microsoft_region) || 'global';
        return new Promise((resolve, reject) => {
          GM_xmlhttpRequest({
            method: 'POST',
            url: 'https://api.cognitive.microsofttranslator.com/translate?api-version=3.0&to=en',
            headers: {
              'Content-Type': 'application/json',
              'Ocp-Apim-Subscription-Key': apiKey.trim(),
              'Ocp-Apim-Subscription-Region': region.trim(),
            },
            data: JSON.stringify([{ Text: text }]),
            onload: (res) => {
              let json;
              try {
                json = JSON.parse(res.responseText);
              } catch (e) {
                reject(new Error(`Failed to parse Microsoft response (status ${res.status}): ${res.responseText}`));
                return;
              }
              if (json.error) {
                reject(new Error(`Microsoft Translator error: ${json.error.message || JSON.stringify(json.error)}`));
                return;
              }
              const translated = Array.isArray(json) && json[0] && json[0].translations && json[0].translations[0] && json[0].translations[0].text;
              if (!translated || !translated.trim()) {
                reject(new Error('Microsoft Translator returned an empty translation.'));
                return;
              }
              resolve(translated);
            },
            onerror: (err) => reject(new Error('Microsoft Translator request failed: ' + JSON.stringify(err))),
          });
        });
      },
    },
  ];

  // ---------- Storage helpers ----------

  const STORAGE_KEY_PROVIDER = 'auto_translate_provider';
  const STORAGE_KEY_ENABLED = 'auto_translate_enabled';
  const MAX_AUTO_RETRANSLATE = 3;

  function getProviderId() {
    return GM_getValue(STORAGE_KEY_PROVIDER, 'deepl');
  }

  function setProviderId(id) {
    GM_setValue(STORAGE_KEY_PROVIDER, id);
  }

  function getProvider() {
    const id = getProviderId();
    return PROVIDERS.find(p => p.id === id) || PROVIDERS[0];
  }

  function getProviderKey(providerId) {
    return GM_getValue(`${providerId}_api_key`, '');
  }

  function setProviderKey(providerId, key) {
    GM_setValue(`${providerId}_api_key`, key);
  }

  function getProviderExtra(providerId) {
    const provider = PROVIDERS.find(p => p.id === providerId);
    if (!provider) return {};
    const extra = {};
    for (const field of provider.extraFields) {
      extra[field.key] = GM_getValue(field.key, field.defaultVal || '');
    }
    return extra;
  }

  function setProviderExtra(key, value) {
    GM_setValue(key, value);
  }

  function isEnabled() {
    return GM_getValue(STORAGE_KEY_ENABLED, true);
  }

  function setEnabled(val) {
    GM_setValue(STORAGE_KEY_ENABLED, val);
    updateToggleButton();
  }

  // ---------- Settings panel ----------

  let settingsPanel = null;

  function openSettings() {
    if (settingsPanel) {
      settingsPanel.remove();
      settingsPanel = null;
    }

    const currentProviderId = getProviderId();

    // Overlay
    const overlay = document.createElement('div');
    overlay.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.5);z-index:9999998;display:flex;align-items:center;justify-content:center;';

    // Card
    const card = document.createElement('div');
    card.style.cssText = 'background:#1e1e2e;color:#e0e0e0;border-radius:12px;padding:24px;width:400px;max-width:90vw;font-family:sans-serif;font-size:14px;box-shadow:0 8px 32px rgba(0,0,0,0.5);';

    // Title
    const title = document.createElement('h3');
    title.textContent = 'Auto-Translate Settings';
    title.style.cssText = 'margin:0 0 16px 0;font-size:18px;font-weight:600;color:#fff;';
    card.appendChild(title);

    // Provider select
    const providerLabel = createLabel('Translation Provider');
    card.appendChild(providerLabel);

    const select = document.createElement('select');
    select.style.cssText = 'width:100%;padding:8px 10px;border-radius:6px;border:1px solid #444;background:#2a2a3a;color:#e0e0e0;font-size:14px;margin-bottom:12px;outline:none;';
    for (const p of PROVIDERS) {
      const opt = document.createElement('option');
      opt.value = p.id;
      opt.textContent = p.name;
      if (p.id === currentProviderId) opt.selected = true;
      select.appendChild(opt);
    }
    card.appendChild(select);

    // API key input
    const keyLabel = createLabel('API Key');
    card.appendChild(keyLabel);

    const keyRow = document.createElement('div');
    keyRow.style.cssText = 'display:flex;gap:8px;align-items:center;margin-bottom:4px;';

    const keyInput = document.createElement('input');
    keyInput.type = 'password';
    keyInput.style.cssText = 'flex:1;padding:8px 10px;border-radius:6px;border:1px solid #444;background:#2a2a3a;color:#e0e0e0;font-size:13px;font-family:monospace;outline:none;';
    keyRow.appendChild(keyInput);

    const showBtn = document.createElement('button');
    showBtn.textContent = 'Show';
    showBtn.style.cssText = 'padding:6px 10px;border-radius:6px;border:1px solid #444;background:#2a2a3a;color:#aaa;cursor:pointer;font-size:12px;white-space:nowrap;';
    showBtn.addEventListener('click', () => {
      if (keyInput.type === 'password') {
        keyInput.type = 'text';
        showBtn.textContent = 'Hide';
      } else {
        keyInput.type = 'password';
        showBtn.textContent = 'Show';
      }
    });
    keyRow.appendChild(showBtn);
    card.appendChild(keyRow);

    // Key link
    const keyLink = document.createElement('a');
    keyLink.target = '_blank';
    keyLink.style.cssText = 'color:#7c8aff;font-size:12px;text-decoration:none;display:inline-block;margin-bottom:12px;';
    card.appendChild(keyLink);

    // Extra fields container
    const extraContainer = document.createElement('div');
    extraContainer.style.cssText = 'margin-bottom:12px;';
    card.appendChild(extraContainer);

    // Hint text
    const hintText = document.createElement('div');
    hintText.style.cssText = 'color:#888;font-size:12px;margin-bottom:16px;';
    card.appendChild(hintText);

    // Update dynamic fields when provider changes
    function refreshFields() {
      const pid = select.value;
      const provider = PROVIDERS.find(p => p.id === pid);

      keyInput.value = getProviderKey(pid);
      keyInput.placeholder = provider.keyHint;
      keyLink.href = provider.keyLink;
      keyLink.textContent = provider.keyLinkText;
      hintText.textContent = keyInput.placeholder;

      // Extra fields
      extraContainer.innerHTML = '';
      const extra = getProviderExtra(pid);
      for (const field of provider.extraFields) {
        const lbl = createLabel(field.label);
        extraContainer.appendChild(lbl);

        const inp = document.createElement('input');
        inp.type = 'text';
        inp.dataset.extraKey = field.key;
        inp.value = extra[field.key] || field.defaultVal || '';
        inp.placeholder = field.hint || '';
        inp.style.cssText = 'width:100%;padding:8px 10px;border-radius:6px;border:1px solid #444;background:#2a2a3a;color:#e0e0e0;font-size:13px;margin-bottom:4px;outline:none;box-sizing:border-box;';
        extraContainer.appendChild(inp);
      }
    }

    select.addEventListener('change', refreshFields);
    refreshFields();

    // Button row
    const btnRow = document.createElement('div');
    btnRow.style.cssText = 'display:flex;gap:10px;justify-content:flex-end;margin-top:20px;';

    const cancelBtn = createButton('Cancel', '#444', '#ccc');
    cancelBtn.addEventListener('click', closeSettings);
    btnRow.appendChild(cancelBtn);

    const saveBtn = createButton('Save', '#2e7d32', '#fff');
    saveBtn.addEventListener('click', () => {
      const pid = select.value;
      setProviderId(pid);
      setProviderKey(pid, keyInput.value.trim());

      // Save extra fields
      const inputs = extraContainer.querySelectorAll('input[data-extra-key]');
      inputs.forEach(inp => {
        setProviderExtra(inp.dataset.extraKey, inp.value.trim());
      });

      updateToggleButton();
      closeSettings();
    });
    btnRow.appendChild(saveBtn);

    card.appendChild(btnRow);
    overlay.appendChild(card);
    document.body.appendChild(overlay);
    settingsPanel = overlay;

    // Close on overlay click (outside card)
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) closeSettings();
    });
  }

  function closeSettings() {
    if (settingsPanel) {
      settingsPanel.remove();
      settingsPanel = null;
    }
  }

  function createLabel(text) {
    const lbl = document.createElement('div');
    lbl.textContent = text;
    lbl.style.cssText = 'font-size:12px;color:#aaa;margin-bottom:6px;font-weight:500;';
    return lbl;
  }

  function createButton(text, bg, color) {
    const btn = document.createElement('button');
    btn.textContent = text;
    btn.style.cssText = `padding:8px 20px;border-radius:6px;border:none;background:${bg};color:${color};cursor:pointer;font-size:14px;font-weight:500;`;
    btn.addEventListener('mouseenter', () => { btn.style.opacity = '0.85'; });
    btn.addEventListener('mouseleave', () => { btn.style.opacity = '1'; });
    return btn;
  }

  // Register menu command to open settings
  GM_registerMenuCommand('Settings', openSettings);

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
    toggleBtn.title = 'Toggle auto-translate / Open settings (right-click)';
    toggleBtn.addEventListener('click', () => setEnabled(!isEnabled()));
    toggleBtn.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      openSettings();
    });
    document.body.appendChild(toggleBtn);
    updateToggleButton();
  }

  function updateToggleButton() {
    if (!toggleBtn) return;
    const on = isEnabled();
    const provider = getProvider();
    toggleBtn.textContent = on
      ? `🌐 ${provider.name}: ON`
      : `🌐 Translate: OFF`;
    toggleBtn.style.background = on ? '#2e7d32' : '#616161';
    toggleBtn.style.color = '#fff';
  }

  // ---------- Finding Claude's composer ----------

  function findEditor() {
    return document.querySelector('div[contenteditable="true"].ProseMirror')
      || document.querySelector('div[contenteditable="true"][data-testid="chat-input"]')
      || document.querySelector('div[contenteditable="true"]');
  }

  function findSendButton() {
    const candidates = [
      'button[aria-label="Send Message"]',
      'button[aria-label="Send message"]',
      'button[data-testid="send-button"]',
    ];
    for (const sel of candidates) {
      const el = document.querySelector(sel);
      if (el) return el;
    }

    const byLabel = Array.from(document.querySelectorAll('button')).find(b =>
      (b.getAttribute('aria-label') || '').toLowerCase().includes('send')
    );
    if (byLabel) return byLabel;

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

  function normalizeForCompare(text) {
    return text.replace(/\s+/g, ' ').trim();
  }

  function replaceEditorText(editor, text) {
    editor.focus();
    document.execCommand('selectAll', false, null);
    document.execCommand('insertText', false, text);
  }

  // ---------- Translation dispatch ----------

  function translateText(text) {
    const provider = getProvider();
    const key = getProviderKey(provider.id);
    if (!key) {
      return Promise.reject(
        new Error(`No ${provider.name} API key set. Right-click the toggle button or use the Tampermonkey menu to open Settings.`)
      );
    }
    const extra = getProviderExtra(provider.id);
    return provider.translate(text, key, extra);
  }

  // Simple heuristic: skip translation if text is already plain ASCII/English-looking.
  function looksAlreadyEnglish(text) {
    const nonAscii = text.replace(/[\x00-\x7F]/g, '');
    return nonAscii.length === 0;
  }

  // ---------- Core interception logic ----------
  const state = {
    pendingText: null,
    isTranslating: false,
    retranslateCount: 0,
  };

  function handleEnterOrSendIntercept(e, editor) {
    const currentText = getEditorText(editor);
    if (!currentText) return;

    const normalizedCurrent = normalizeForCompare(currentText);

    if (state.pendingText !== null && normalizedCurrent === state.pendingText) {
      state.pendingText = null;
      state.retranslateCount = 0;
      return;
    }

    if (looksAlreadyEnglish(currentText)) {
      state.pendingText = null;
      state.retranslateCount = 0;
      return;
    }

    if (state.retranslateCount >= MAX_AUTO_RETRANSLATE) {
      console.warn('[Auto-Translate] Giving up after repeated mismatches; sending as-is.');
      state.pendingText = null;
      state.retranslateCount = 0;
      return;
    }

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
      const translated = await translateText(originalText);
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
