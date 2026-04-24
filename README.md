# <img src="https://github.com/user-attachments/assets/aa6a1ce7-d4a1-45ad-8f4f-73d9d82e2f7d" width="28" align="top"> Hodoscope PR Tracker

Turn your team's pull request history into an interactive scatter plot — instantly spot patterns, bottlenecks, and outliers across GitHub, Azure DevOps, and Wrike.

> Created by **Caleb DeLeeuw** at **[Misfits & Machines](https://github.com/marketingarchitects)**
>
> Inspired by [Hodoscope](https://github.com/AR-FORUM/hodoscope) — unsupervised trajectory analysis for AI agents

---

<p align="center">
  <img src="https://github.com/user-attachments/assets/26aac82d-400c-47af-adb1-8721a8768fec" alt="Hodoscope — 136 PRs from GitHub and Azure DevOps visualized as a t-SNE scatter plot" width="100%">
</p>

Every merged, open, and closed PR becomes a glowing dot on a 2D map. PRs with similar lifecycles cluster together automatically using [t-SNE](#how-t-sne-works) — so you see your team's engineering patterns at a glance, not buried in spreadsheets.

Click any dot to see the full story: timeline, reviewers, code size, and a direct link to the PR.

## Features

- **t-SNE clustering** — PRs projected from 17-dimension feature vectors into 2D clusters
- **Multi-provider** — GitHub + Azure DevOps + Wrike in one view
- **Multi-org** — fetch from multiple GitHub orgs simultaneously
- **Color modes** — switch between Author, Status, Provider, and Repo
- **Repo rings** — always-visible outer band shows repo membership
- **Density heatmap** — Gaussian KDE overlay reveals behavioral clusters
- **Search and filter** — live text search, legend toggle, repo label highlights
- **Detail panel** — click any dot for full PR metadata and browser link
- **Manager dashboard** — KPI cards for Total PRs, Merged, Open, Closed, Contributors
- **Claude Code MCP** — query PR data from your terminal via [4 MCP tools](#claude-code-integration)

## Quick Start

### Prerequisites

- Node.js 20+
- A GitHub token (`gh auth login` or a [personal access token](https://github.com/settings/tokens))

### Install

```bash
git clone https://github.com/MisfitsSkunkworks/hodoscope-pr-tracker.git
cd hodoscope-pr-tracker
npm install
cp .env.example .env
```

Add your token to `.env`:

```
GH_TOKEN=your-github-token
```

### Generate and serve

```bash
npm run generate   # fetches PR data, runs t-SNE, writes dist/index.html
npm start          # serves at http://localhost:3000
```

### Available scripts

| Script | Description |
|--------|-------------|
| `npm run generate` | Fetch PRs from all configured providers and generate the scatter visualization |
| `npm start` | Serve `dist/` locally |
| `npm test` | Run all 151 tests (~800ms) |
| `npm run test:watch` | Run tests in watch mode |
| `npm run test:coverage` | Run tests with coverage report |
| `npm run lint` | Lint source files |

## Configuration

Copy `.env.example` to `.env` and fill in the tokens you need:

| Variable | Required | Description |
|----------|----------|-------------|
| `GH_TOKEN` | Yes | GitHub personal access token (or use `gh auth login`) |
| `AZDO_TOKEN` | No | Azure DevOps personal access token |
| `AZDO_ORG_URL` | No | Azure DevOps org URL (default: `https://dev.azure.com/misfitsandmachines`) |
| `WRIKE_TOKEN` | No | Wrike API token |

Only `GH_TOKEN` is required. The generator gracefully skips any provider that has no token configured.

## How t-SNE Works

Each PR is converted to a 17-dimensional feature vector:

| Feature Group | Dimensions |
|---------------|------------|
| **Size** | event count, additions, deletions, total changes, changed files |
| **Time** | log(duration in hours) |
| **Collaboration** | reviewer count, label count, comments, reviews, commits, approvals |
| **Status** | merged, open, closed, draft (one-hot) |
| **Provider** | github flag |

These vectors are normalized to [0,1], then projected to 2D via a pure TypeScript t-SNE implementation (no external dependencies). PRs with similar lifecycle patterns naturally cluster together.

## Deployment

The scatter visualization is hosted on an **Azure Web App** and rebuilt nightly via GitHub Actions.

| Trigger | What happens |
|---------|-------------|
| **Nightly** (2 AM UTC) | Fetches fresh PR data, runs t-SNE, deploys updated `index.html` |
| **Push to `master`** | Same build + deploy pipeline |
| **Manual** | Trigger anytime via the Actions tab (`workflow_dispatch`) |

The pipeline is defined in [`.github/workflows/master_hodoscope.yml`](.github/workflows/master_hodoscope.yml). It builds a Docker image ([`Dockerfile`](Dockerfile)), pushes it to **Azure Container Registry**, and deploys it to the Web App using OIDC federated identity.

### GitHub Actions secrets

| Secret | Purpose |
|--------|---------|
| `GH_TOKEN` | GitHub PAT for PR data fetching |
| `AZDO_TOKEN` | Azure DevOps PAT |
| `WRIKE_TOKEN` | Wrike API token (optional) |
| `AZUREAPPSERVICE_CONTAINERUSERNAME_*` | ACR admin username (auto-configured) |
| `AZUREAPPSERVICE_CONTAINERPASSWORD_*` | ACR admin password (auto-configured) |
| `AZUREAPPSERVICE_CLIENTID_*` | Azure OIDC client ID (auto-configured) |
| `AZUREAPPSERVICE_TENANTID_*` | Azure OIDC tenant ID (auto-configured) |
| `AZUREAPPSERVICE_SUBSCRIPTIONID_*` | Azure OIDC subscription ID (auto-configured) |

### Local testing with Docker

```bash
npm run generate
docker build -t hodoscope-local .
docker run --rm -p 8080:8080 hodoscope-local
# → http://localhost:8080
```

## Claude Code Integration

Add the MCP server to your Claude Code config:

```json
{
  "mcpServers": {
    "hodoscope": {
      "command": "npx",
      "args": ["tsx", "claude-extension/server.ts"],
      "env": { "GH_TOKEN": "your-token" }
    }
  }
}
```

| Tool | Description |
|------|-------------|
| `hodoscope_list_prs` | List PRs with optional filters |
| `hodoscope_pr_details` | Full event timeline for a specific PR |
| `hodoscope_stats` | Aggregate repository statistics |
| `hodoscope_timeline` | PR activity in a date range |

## Architecture

```
hodoscope-pr-tracker/
├── src/
│   ├── models/
│   │   ├── types.ts                    # PRTrace, TraceEvent, ScatterPoint
│   │   ├── trace-builder.ts            # PR → TracePath, filtering, grouping, stats
│   │   └── projection.ts              # Feature extraction, t-SNE (pure TS)
│   ├── fetchers/
│   │   ├── github.ts                   # Octokit: PRs + reviews + events + comments
│   │   ├── azure-devops.ts             # AzDO REST: PRs + threads + iterations + votes
│   │   └── wrike.ts                    # Wrike REST: tasks + revisions
│   └── webview/
│       ├── scatter-visualization.ts    # Scatter plot renderer (Canvas 2D)
│       └── visualization.ts           # Timeline view
├── claude-extension/
│   ├── server.ts                       # MCP server (4 tools)
│   └── hodoscope.md                    # Claude Code slash command
├── scripts/
│   ├── demo-scatter.ts                 # Multi-org t-SNE scatter generator
│   ├── demo-multi.ts                   # Multi-repo timeline demo
│   └── demo.ts                         # Single-repo demo
├── .github/workflows/
│   └── master_hodoscope.yml            # Nightly build + deploy to Azure
├── Dockerfile                          # Node 20 + serve container for Azure Web App
├── .env.example                        # Environment variable template
└── 10 test files (151 tests)
```

## Acknowledgments

- [Hodoscope](https://github.com/AR-FORUM/hodoscope) by AR-FORUM — the trajectory analysis tool that inspired this project
- Built with pure TypeScript — no WebGL, no external visualization dependencies

---

<p align="center">
  <img src="https://github.com/user-attachments/assets/aa6a1ce7-d4a1-45ad-8f4f-73d9d82e2f7d" width="48">
  <br>
  <strong>Built by <a href="https://github.com/CalebDeLeeuwMisfits">Caleb DeLeeuw</a> at <a href="https://github.com/marketingarchitects">Misfits & Machines</a></strong>
</p>

## License

MIT
