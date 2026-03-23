# Hodoscope AI — PR Trace Visualizer

> Visualize your Git PR history as glowing particle traces in VS Code & Cursor

<p align="center">
  <strong>Inspired by <a href="https://github.com/AR-FORUM/hodoscope">Hodoscope</a></strong> — unsupervised trajectory analysis for AI agents
</p>

---

## What is this?

Hodoscope AI turns your pull request history into an interactive **particle chamber visualization**. Each PR becomes a glowing trace flowing through time — from creation through reviews, approvals, and merge — like particle tracks in a physics detector.

**Built for managers and teams** who want to *see* their development flow at a glance.

### Features

- **Particle trace visualization** — PRs as animated, glowing traces on a dark canvas
- **GitHub + Azure DevOps** — Fetch PRs from both providers simultaneously
- **Interactive** — Hover for details, click to open PRs, filter by author/status/branch
- **Manager-friendly dashboard** — KPI cards (total, merged, open, closed, contributors)
- **Color by anything** — Author, status, provider, target branch
- **Timeline playback** — Watch your PR history animate from past to present
- **VS Code & Cursor** — Works in both editors
- **Claude Code integration** — Query PR data from your terminal via MCP

## Installation

### VS Code / Cursor

```bash
# Clone and build
git clone https://github.com/YOUR_USERNAME/hodoscope-ai.git
cd hodoscope-ai
npm install
npm run build:all

# Install in VS Code
code --install-extension hodoscope-ai-0.1.0.vsix
```

### Claude Code (MCP Server)

Add to your Claude Code settings (`~/.claude/settings.json`):

```json
{
  "mcpServers": {
    "hodoscope": {
      "command": "node",
      "args": ["/path/to/hodoscope-ai/dist/mcp-server.js"],
      "env": {
        "GITHUB_TOKEN": "ghp_your_token"
      }
    }
  }
}
```

## Usage

1. Open the Command Palette (`Ctrl+Shift+P` / `Cmd+Shift+P`)
2. Run **"Hodoscope: Select Repository"**
3. Choose GitHub or Azure DevOps
4. Enter `owner/repo` (e.g., `facebook/react`)
5. Watch your PR history come alive!

### Controls

| Control | Action |
|---------|--------|
| **Hover** | Show PR details tooltip |
| **Click** | Open PR in browser |
| **Replay** | Restart the animation |
| **Pause** | Freeze the animation |
| **Color by** | Switch coloring (author/status/branch) |
| **Search** | Filter traces by text |
| **Legend** | Click to toggle trace visibility |

## Configuration

| Setting | Default | Description |
|---------|---------|-------------|
| `hodoscope.github.token` | `""` | GitHub PAT (or use `gh` CLI auth) |
| `hodoscope.azureDevOps.orgUrl` | `""` | Azure DevOps org URL |
| `hodoscope.azureDevOps.token` | `""` | Azure DevOps PAT |
| `hodoscope.maxPRs` | `200` | Max PRs to fetch |
| `hodoscope.animation.speed` | `1.0` | Animation speed multiplier |
| `hodoscope.animation.particleTrails` | `true` | Enable particle trail effects |

## Development

```bash
npm install
npm test              # 65 tests, TDD-style
npm run test:watch    # Watch mode
npm run build:all     # Build extension + webview
```

## Architecture

```
hodoscope-ai/
├── src/
│   ├── models/           # PRTrace, TracePath types & builders
│   │   ├── types.ts      # Core interfaces
│   │   └── trace-builder.ts  # Transform PRs → visualization paths
│   ├── fetchers/         # API clients
│   │   ├── github.ts     # GitHub (Octokit)
│   │   └── azure-devops.ts  # Azure DevOps REST API
│   ├── webview/          # Visualization
│   │   └── visualization.ts  # Self-contained HTML/Canvas renderer
│   └── extension.ts      # VS Code extension entry
├── claude-extension/     # Claude Code MCP server
│   ├── server.ts
│   └── hodoscope.md      # Slash command
└── tests alongside source (*.test.ts)
```

## Acknowledgments

- [Hodoscope](https://github.com/AR-FORUM/hodoscope) by AR-FORUM — the original trajectory analysis tool
- Particle physics visualization metaphor — bubble chamber / hodoscope detectors

## License

MIT
