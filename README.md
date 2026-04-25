<p align="center">
  <img src="https://em-content.zobj.net/source/apple/391/peach_1f351.png" width="80" />
</p>

<h1 align="center">Whip Me Bad</h1>

<p align="center">
  <em>Slap your AI into shipping faster</em>
</p>

<p align="center">
  A dreamy whip cracks across your screen — with satisfying audio — every time you talk to your AI coding assistant.
</p>

---

## What is this?

Every time you press **Enter** or your AI does something, a neon whip animation slashes across your screen with a satisfying slap sound. The more you mash, the spicier the phrases get.

It's dumb. It's beautiful. It works.

## How it works

🍑 **Global Enter key** — works in any app, any terminal, anywhere

🔗 **Kiro deep integration** — auto-installs hooks that trigger on:
- Prompt submissions
- File edits
- Tool executions (shell, MCP, writes)
- Task completions
- Agent stop

⌨️ **Streak mode** — mash Enter for escalating intensity:

| Hits | Vibe | Examples |
|------|------|----------|
| 1-2 | Casual | "spank that code", "bad code bad" |
| 3-5 | Warming up | "HARDER", "FASTER", "dont stop" |
| 6-9 | Getting hot | "oh behave", "right there", "keep going" |
| 10-14 | Almost there | "ALMOST THERE", "so close", "yes yes yes" |
| 15+ | Climax | "SHIPPED 🚀", "i need a cigarette", "was it good for you" |

## Features

- 🎨 **Dreamy neon whip** — color-shifting glow, rainbow trail, twinkling sparkles
- 🔊 **Satisfying audio** — whoosh on swing, slap on crack
- 🍑 **Streak system** — escalating phrases based on rapid hits
- 📊 **Insights** — track your whips, earn personas (Fresh Egg → Clanker → Whip Royalty)
- 🔗 **Kiro hooks** — auto-installed, zero config
- ⌨️ **Global Enter** — works everywhere
- 🖥️ **Menu bar app** — pause, volume, install hooks, quit
- 🎬 **Cinematic onboarding** — transparent overlay with ambient glow

## Download

| Platform | Download |
|----------|----------|
| macOS | [Whip Me Bad.dmg](https://github.com/user/whip-me-bad/releases/latest) |
| Windows | [Whip Me Bad Setup.exe](https://github.com/user/whip-me-bad/releases/latest) |

## Install from source

```bash
git clone https://github.com/user/whip-me-bad.git
cd whip-me-bad
npm install
npm start
```

## Build

```bash
# macOS
npm run build

# Windows (from Windows or cross-compile)
npm run build:win

# Both
npm run build:all
```

## Kiro Integration

If you use [Kiro](https://kiro.dev), Whip Me Bad automatically installs hooks in your projects. No setup needed — just run the app and open a Kiro project.

Hooks trigger on:
- `promptSubmit` — when you send a message
- `postToolUse` — when Kiro writes files or runs commands
- `postTaskExecution` — when a spec task completes
- `agentStop` — when the agent finishes

## Personas

Your whip count earns you a title:

| Whips | Persona | Emoji |
|-------|---------|-------|
| 0 | Fresh Egg | 🥚 |
| 10 | Casual Slapper | 👋 |
| 50 | Cheeky One | 🍑 |
| 100 | Speed Demon | ⚡ |
| 250 | Clanker | 🔥 |
| 500 | Unhinged | 💀 |
| 1000 | Whip Royalty | 👑 |

## Tech

- Electron (transparent overlay + menu bar)
- Canvas 2D (whip physics, particles, glow)
- Web Audio API (synthesized sounds)
- Supabase (anonymous analytics)
- macOS CGEventTap (global key monitoring)

## Privacy

- No personal data collected
- Anonymous device UUID only
- Tracks: whip count, trigger type, platform
- All data is anonymous and aggregated

## License

MIT — do whatever you want with it 🍑

---

<p align="center">
  <em>Built with love and questionable judgment</em>
</p>
