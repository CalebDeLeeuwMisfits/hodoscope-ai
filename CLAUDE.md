# Hodoscope AI — PR Trace Visualizer

# NOTE: Deep-dive detail panel added to scatter view — see scatter-visualization.ts for the rich PR insight panel

## Overview
VS Code / Cursor extension that visualizes PR history from GitHub and Azure DevOps as interactive particle traces (inspired by the [Hodoscope](https://github.com/AR-FORUM/hodoscope) trajectory analysis tool).

## Architecture
- `src/models/` — Data types and trace builder (PRTrace → TracePath)
- `src/fetchers/` — GitHub (Octokit) and Azure DevOps API clients
- `src/webview/` — Self-contained HTML visualization (Canvas 2D, particle effects)
- `src/extension.ts` — VS Code extension entry point
- `claude-extension/` — MCP server + slash command for Claude Code

## Testing
```bash
npm test          # Run all tests (vitest)
npm run test:watch  # Watch mode
```

TDD approach: tests live alongside source files as `*.test.ts`.

## Building
```bash
npm run build:all  # Build extension + webview
npm run package    # Create .vsix
```

## Claude Code MCP Server
The repo includes an MCP server at `claude-extension/server.ts` that exposes PR trace data as tools. It's auto-configured via `.mcp.json` — anyone opening this repo in Claude Code gets the tools immediately.

**Tools available:**
- `hodoscope_list_prs` — List PR traces from GitHub or Azure DevOps
- `hodoscope_pr_details` — Full event timeline for a specific PR
- `hodoscope_stats` — Aggregate PR statistics for a repo
- `hodoscope_timeline` — PR activity in a date range (great for standups)

Requires `GH_TOKEN` or `gh auth login` for GitHub, `AZDO_TOKEN` + `AZDO_ORG_URL` for Azure DevOps.

## Key Design Decisions
- Canvas 2D (not D3/WebGL) for the visualization — self-contained, no CDN deps, works in webview CSP
- Particle effects + glow for visual impact (manager-friendly)
- Both VS Code and Cursor compatible (avoids Cursor-incompatible APIs)
- MCP server for Claude Code integration (stdio protocol)
