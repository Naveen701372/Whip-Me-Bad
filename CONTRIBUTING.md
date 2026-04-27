# Contributing to Whip Me Bad

Thanks for wanting to make this weirder. The more IDEs we support, the more developers get whipped.

---

## How it works

Whip Me Bad runs a local HTTP server at `localhost:31338`. Any IDE that can fire a shell command on an event can trigger a whip crack. That's the entire contract.

No SDKs. No plugins. Just a GET request.

---

## The endpoint

```
GET http://127.0.0.1:31338/whip?type=<ide>_<event>&label=<display+text>
```

- `type` — identifies the source, used for analytics (e.g. `cursor_prompt`, `vscode_save`)
- `label` — short text shown in the overlay on screen (e.g. `sent+it`, `task+done`, `saved`)

Examples:

```
http://127.0.0.1:31338/whip?type=cursor_prompt&label=sent+it
http://127.0.0.1:31338/whip?type=vscode_save&label=saved
http://127.0.0.1:31338/whip?type=windsurf_edit&label=touched+code
```

---

## Test it right now

Make sure Whip Me Bad is running, then:

```bash
curl "http://127.0.0.1:31338/whip?type=test&label=it+works"
```

You'll hear it. That's your integration test passing.

---

## Adding a new IDE

1. Create a folder: `hooks/<ide-name>/`
2. Add your hook files in whatever format that IDE expects
3. Add a short `README.md` inside the folder explaining how to install the hooks
4. Update the IDE table in the main `README.md` — change the status from `PRs welcome` to a checkmark
5. Open a PR with the title: `feat: <IDE name> hooks`

That's it.

---

## Kiro hooks as reference

Kiro uses `.kiro.hook` JSON files. Here's what each one looks like:

**Prompt submit** (`hooks/whip-me-prompt.kiro.hook`)
```json
{
  "enabled": true,
  "name": "Whip Me Bad — Prompt Submit",
  "description": "Triggers a whip crack when you send a message in Kiro chat.",
  "version": "1",
  "when": {
    "type": "promptSubmit"
  },
  "then": {
    "type": "runCommand",
    "command": "node -e \"require('http').get('http://127.0.0.1:31338/whip?type=kiro_prompt&label=sent+it').on('error',()=>{})\"",
    "timeout": 3
  }
}
```

**Tool use** (`hooks/whip-me-tool-use.kiro.hook`)
```json
{
  "enabled": true,
  "name": "Whip Me Bad — Tool Use",
  "description": "Triggers a whip crack after write or shell tool execution.",
  "version": "1",
  "when": {
    "type": "postToolUse",
    "toolTypes": ["write", "shell"]
  },
  "then": {
    "type": "runCommand",
    "command": "node -e \"require('http').get('http://127.0.0.1:31338/whip?type=kiro_tool&label=touched+code').on('error',()=>{})\"",
    "timeout": 3
  }
}
```

**Task complete** (`hooks/whip-me-task.kiro.hook`)
```json
{
  "enabled": true,
  "name": "Whip Me Bad — Task Complete",
  "description": "Triggers a whip crack after each spec task completes.",
  "version": "1",
  "when": {
    "type": "postTaskExecution"
  },
  "then": {
    "type": "runCommand",
    "command": "node -e \"require('http').get('http://127.0.0.1:31338/whip?type=kiro_task&label=task+done').on('error',()=>{})\"",
    "timeout": 3
  }
}
```

The pattern is identical for any IDE that supports hook/event systems. Swap the `when` block for whatever trigger your IDE exposes, keep the `then` block the same.

---

## What we need most (priority order)

| IDE | What to hook into |
|---|---|
| Cursor | `.cursor/rules` or settings-based onPrompt / onSave events |
| VS Code | `tasks.json`, `keybindings.json`, or a lightweight extension |
| Windsurf | Similar to Cursor — event hooks in settings |
| Linux | Any shell-based trigger, systemd, or daemon |
| Sound packs | Drop new `.wav`/`.mp3` files into `assets/sounds/` + update the menu |

---

## Questions?

Open an issue or just drop a message. PRs are welcome at any stage — even a rough draft hook with a note saying "this works on my machine" is a great start.

MIT licensed. Built with love and questionable judgment 🍑
