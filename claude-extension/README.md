# Hodoscope AI — Claude Code Extension

Query PR trace data from your terminal via Claude Code.

## Setup

1. Add the MCP server to your Claude Code settings:

```json
{
  "mcpServers": {
    "hodoscope": {
      "command": "node",
      "args": ["path/to/hodoscope-ai/claude-extension/server.js"]
    }
  }
}
```

2. Or use the slash command by copying `hodoscope.md` to `~/.claude/commands/`.

## MCP Tools

- `hodoscope_list_prs` — List PR traces with optional filters
- `hodoscope_pr_details` — Get detailed trace for a specific PR
- `hodoscope_stats` — Get repository PR statistics
- `hodoscope_timeline` — Get PR activity timeline for a date range
