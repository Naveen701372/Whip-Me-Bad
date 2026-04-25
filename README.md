<p align="center">
  <img src="logo.png" width="120" />
</p>

<h1 align="center">Whip Me Bad</h1>

<p align="center">
  <em>A satisfying whip crack every time your AI does something</em>
</p>

<p align="center">
  <a href="https://github.com/heynaavi/Whip-Me-Bad/releases/latest">
    <img src="https://img.shields.io/badge/download-macOS-orange?style=for-the-badge" alt="Download macOS" />
  </a>
  &nbsp;
  <img src="https://img.shields.io/badge/windows-coming%20soon-lightgrey?style=for-the-badge" alt="Windows coming soon" />
  &nbsp;
  <img src="https://img.shields.io/badge/license-MIT-green?style=for-the-badge" alt="License" />
</p>

<p align="center">
  <a href="#download">Download</a>
  <span>&nbsp;&nbsp;•&nbsp;&nbsp;</span>
  <a href="#how-it-works">How it works</a>
  <span>&nbsp;&nbsp;•&nbsp;&nbsp;</span>
  <a href="#kiro-integration">Kiro</a>
  <span>&nbsp;&nbsp;•&nbsp;&nbsp;</span>
  <a href="#contribute">Contribute</a>
</p>

---

A dreamy neon whip cracks across your screen with a satisfying slap every time you press Enter. If you use Kiro, it also fires when your AI writes a file, finishes a task, or completes a response — even when you're not looking. It's a nice little charm that lets you know your AI is working.

## Download

| Platform | Status |
|----------|--------|
| macOS (.dmg) | [Download latest](https://github.com/heynaavi/Whip-Me-Bad/releases/latest) |
| Windows (.exe) | Coming soon |

Or [build from source](#build-from-source).

## How it works

The app runs in your menu bar. It does two things:

1. **Global Enter key** — press Enter anywhere, get a whip animation with sound
2. **IDE hooks** — if your IDE supports it, the whip fires on AI events like file edits, task completions, and agent responses

Right now, [Kiro](https://kiro.dev) is the only IDE with deep hook integration. Other IDEs fall back to the Enter key trigger.

### Streak mode

Mash Enter and the phrases escalate:

| Hits | Vibe | Sample |
|------|------|--------|
| 1–2 | Casual | *spank that code* |
| 3–5 | Warming up | *HARDER, FASTER* |
| 6–9 | Getting hot | *right there, keep going* |
| 10–14 | Almost there | *so close, yes yes yes* |
| 15+ | 🚀 | *SHIPPED, i need a cigarette* |

### Insights & Personas

Track your whips from the menu bar. Your total count earns you a title:

| Whips | Title |
|-------|-------|
| 0 | 🥚 Fresh Egg |
| 50 | 🍑 Cheeky One |
| 100 | ⚡ Speed Demon |
| 250 | 🔥 Clanker |
| 500 | 💀 Unhinged |
| 1000 | 👑 Whip Royalty |

## Kiro Integration

If you use [Kiro](https://kiro.dev), the app auto-installs hooks in your projects. Zero config.

Hooks fire on:
- **Prompt submit** — you send a message
- **Tool use** — Kiro writes a file or runs a command
- **Task complete** — a spec task finishes
- **Agent stop** — the agent finishes its run

You don't need to be watching. The whip lets you know something happened.

## Contribute

We'd love help making Whip Me Bad work with more tools. The architecture is simple — the app listens for HTTP requests on `localhost:31338/whip`. Any IDE or tool that can run a command on an event can trigger it.

### Wanted: IDE integrations

| IDE / Tool | Status | How to help |
|------------|--------|-------------|
| [Kiro](https://kiro.dev) | ✅ Working | Auto-installed hooks |
| [Cursor](https://cursor.com) | 🔲 Not yet | Cursor doesn't have a hook system yet. If it adds one, we can integrate. PRs welcome if you find a way. |
| [Windsurf](https://windsurf.com) | 🔲 Not yet | Same situation — needs an event/hook system. Ideas welcome. |
| [VS Code](https://code.visualstudio.com) | 🔲 Not yet | Could work as an extension that sends HTTP triggers on terminal events. |
| [Zed](https://zed.dev) | 🔲 Not yet | Extension API could potentially support this. |
| Other | 🔲 Open | If your tool can run `curl http://127.0.0.1:31338/whip` on an event, it works. |

### How integrations work

The app exposes a local HTTP endpoint:

```
GET http://127.0.0.1:31338/whip              # basic trigger
GET http://127.0.0.1:31338/whip?type=enter   # with trigger type for analytics
```

To add support for a new IDE, you need to:

1. Find a way to run a command when the AI does something (hook, extension, plugin, etc.)
2. Have that command hit the endpoint above
3. Submit a PR with the hook/extension files and update this README

See the `hooks/` folder for how the Kiro integration works — it's just JSON config files.

### Other ways to contribute

- 🎨 Better animations or themes
- 🔊 New sound packs
- 🖥️ Windows global key monitoring (currently macOS only)
- 📱 Linux support
- 🐛 Bug fixes

## Build from Source

```bash
git clone https://github.com/heynaavi/Whip-Me-Bad.git
cd Whip-Me-Bad
npm install
npm start
```

### Package

```bash
npm run build        # macOS (.dmg)
npm run build:win    # Windows (.exe)
npm run build:all    # both
```

## Tech

Electron · Canvas 2D · Web Audio API · Supabase · macOS CGEventTap

## Privacy

Anonymous usage tracking only — device UUID, whip count, trigger type, platform. No personal data. No accounts. See [`analytics.js`](analytics.js).

## License

MIT

---

<p align="center">
  <sub>Built with love and questionable judgment 🍑</sub>
</p>
