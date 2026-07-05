**English** | [中文](#中文说明)

# Claude.ai Auto-Translate to English (DeepL)

A Tampermonkey/Violentmonkey userscript that automatically translates whatever
you type into [Claude.ai](https://claude.ai)'s chat box into English via the
[DeepL API](https://www.deepl.com/pro-api) — with a preview/confirm step so
you always see the translation before it's sent.

## Why

If you think and type more naturally in your native language but want to
chat with Claude in English (or just want a quick sanity check on your
phrasing), this script intercepts your message before it sends, translates
it, and drops the English version back into the box for you to review. Press
Enter again to actually send it.

## Features

- 🌐 Automatic translation of non-English input via DeepL
- 👀 Preview-before-send — nothing is sent until you confirm the translation
- 🔀 Toggle on/off via a floating button in the corner of the page
- 🈳 Skips translation automatically if your text is already in English
- 🔑 Works with both DeepL Free and DeepL Pro API keys

## Requirements

- [Tampermonkey](https://www.tampermonkey.net/) or
  [Violentmonkey](https://violentmonkey.github.io/) browser extension
- A [DeepL API key](https://www.deepl.com/pro-api) (the free tier includes
  500,000 characters/month)

## Installation

1. Install Tampermonkey or Violentmonkey for your browser.
2. Create a new userscript and paste in the contents of
   [`claude-auto-translate-deepl.user.js`](./claude-auto-translate-deepl.user.js)
   (or, if this repo is set up with raw-file hosting, click the raw link and
   your userscript manager should offer to install it directly).
3. Save the script and make sure it's enabled for `https://claude.ai/*`.
4. Click the Tampermonkey/Violentmonkey icon in your browser toolbar, open
   this script's menu, and select **"Set DeepL API Key"**. Paste in your key
   and save.

## Usage

1. Go to [claude.ai](https://claude.ai) and open a chat.
2. Type your message in any language.
3. Press **Enter** (or click Send).
   - If your text isn't already in English, the script intercepts the send,
     dims the input box briefly, and replaces your text with the English
     translation.
   - Review the translation.
   - Press **Enter** again (or click Send again) to actually send it.
4. Use the **🌐 Translate: ON/OFF** button in the bottom-right corner to
   toggle the feature on or off at any time.

## How it works

The script listens for the Enter key and Send button clicks in a capture
phase at the `document` level, which lets it intercept the action *before*
Claude.ai's own React event handlers process it. On interception, it grabs
your current input text, sends it to DeepL's `/v2/translate` endpoint, and
replaces the editor's contents with the translated text via
`document.execCommand('insertText', ...)`, which keeps Claude's own
ProseMirror-based editor state in sync. A second identical send action is
then allowed through normally.

## Known limitations

- Relies on matching Claude.ai's current DOM structure (e.g. the
  contenteditable composer and Send button). If Claude.ai changes its UI,
  the selectors in `findEditor()` / `findSendButton()` may need updating.
- The "already English" detection is a simple ASCII heuristic — mixed-language
  text or text with accented characters may not always classify as
  expected.
- Not affiliated with or endorsed by Anthropic or DeepL.

## Troubleshooting

| Symptom | Likely cause |
|---|---|
| Nothing happens, text sends untouched (even non-English text) | Script isn't finding the input box — Claude.ai's markup may have changed. Check the browser console for `[Auto-Translate]` errors. |
| "No DeepL API key set" alert | You haven't set your key yet — use the userscript manager's menu command. |
| "Legacy authentication method... no longer supported" | You're on an old version of this script — update to the latest, which uses header-based auth. |
| English text isn't translated | This is expected — the script skips text that already looks like English. |

## Contributing

Issues and pull requests are welcome. If Claude.ai's UI changes and breaks
the selectors, please include the relevant snippet of the page's HTML (from
DevTools) in your issue so the selectors can be updated.

## License

[MIT](./LICENSE)

## Disclaimer

This is an unofficial, community-made browser userscript. It is not created,
maintained, or endorsed by Anthropic or DeepL. Use at your own discretion —
your message text is sent to DeepL's servers for translation.

---

<a id="中文说明"></a>

[English](#claudeai-auto-translate-to-english-deepl) | **中文**

# Claude.ai 自动翻译为英语（DeepL）

一个 Tampermonkey / Violentmonkey 用户脚本，可以将你在 [Claude.ai](https://claude.ai) 聊天框中输入的任何内容通过 [DeepL API](https://www.deepl.com/pro-api) 自动翻译为英语——翻译后会先预览确认，确认无误后再发送。

## 为什么需要它

如果你更习惯用母语思考和输入，但又想以英语与 Claude 交流（或者只是想快速检查一下措辞），这个脚本会在你发送消息之前拦截它，将其翻译为英语，并把译文回填到输入框供你复核。再次按下回车即可真正发送。

## 功能特性

- 🌐 通过 DeepL 自动翻译非英语输入
- 👀 发送前预览——在你确认之前不会发送任何内容
- 🔀 通过页面角落的浮动按钮随时开关
- 🈳 如果输入已经是英语则自动跳过翻译
- 🔑 同时支持 DeepL 免费版和 DeepL Pro API 密钥

## 前置要求

- [Tampermonkey](https://www.tampermonkey.net/) 或 [Violentmonkey](https://violentmonkey.github.io/) 浏览器扩展
- 一个 [DeepL API 密钥](https://www.deepl.com/pro-api)（免费额度包含每月 500,000 字符）

## 安装步骤

1. 为你的浏览器安装 Tampermonkey 或 Violentmonkey。
2. 新建一个用户脚本，将 [`claude-auto-translate-deepl.user.js`](./claude-auto-translate-deepl.user.js) 的内容粘贴进去（或者，如果本仓库托管了 raw 文件，点击 raw 链接，你的脚本管理器应会提示直接安装）。
3. 保存脚本并确保它已在 `https://claude.ai/*` 上启用。
4. 点击浏览器工具栏中的 Tampermonkey / Violentmonkey 图标，打开此脚本的菜单，选择 **"Set DeepL API Key"**，粘贴你的密钥并保存。

## 使用方法

1. 打开 [claude.ai](https://claude.ai) 并进入一个对话。
2. 用任意语言输入你的消息。
3. 按下 **回车**（或点击发送按钮）。
   - 如果你的文本不是英语，脚本会拦截发送操作，输入框会短暂变暗，然后替换为英语翻译。
   - 检查翻译内容。
   - 再次按下 **回车**（或再次点击发送）即可真正发送。
4. 使用右下角的 **🌐 Translate: ON/OFF** 按钮随时开启或关闭此功能。

## 工作原理

脚本在 `document` 级别的捕获阶段监听回车键和发送按钮的点击事件，因此可以在 Claude.ai 自身的 React 事件处理程序处理之前拦截操作。拦截后，脚本获取当前输入框中的文本，将其发送到 DeepL 的 `/v2/translate` 接口，然后通过 `document.execCommand('insertText', ...)` 将译文替换回编辑器中——这种方式可以保持 Claude 基于 ProseMirror 的编辑器状态同步。第二次相同的发送操作则会被正常放行。

## 已知限制

- 依赖匹配 Claude.ai 当前的 DOM 结构（例如 contenteditable 编辑器和发送按钮）。如果 Claude.ai 更新了界面，`findEditor()` / `findSendButton()` 中的选择器可能需要更新。
- "已是英语" 的检测是一个简单的 ASCII 启发式判断——混合语言文本或包含带口音字符的文本可能不会被正确分类。
- 本项目与 Anthropic 或 DeepL 无关，也未获得其认可。

## 问题排查

| 现象 | 可能原因 |
|---|---|
| 没有任何反应，文本原样发送（即使是非英语文本） | 脚本未找到输入框——Claude.ai 的页面结构可能已变更。请打开浏览器控制台查看 `[Auto-Translate]` 相关错误。 |
| 弹出 "No DeepL API key set" 提示 | 你尚未设置密钥——请通过脚本管理器的菜单命令进行设置。 |
| 提示 "Legacy authentication method... no longer supported" | 你使用的是旧版脚本——请更新到最新版本，新版使用基于 Header 的认证方式。 |
| 英语文本没有被翻译 | 这是预期行为——脚本会跳过看起来已经是英语的文本。 |

## 贡献

欢迎提交 Issue 和 Pull Request。如果 Claude.ai 的界面变更导致选择器失效，请在 Issue 中附上相关页面的 HTML 片段（来自开发者工具），以便更新选择器。

## 许可证

[MIT](./LICENSE)

## 免责声明

这是一个非官方的社区浏览器用户脚本，并非由 Anthropic 或 DeepL 创建、维护或认可。请自行判断使用——你的消息文本会被发送到 DeepL 的服务器进行翻译。
