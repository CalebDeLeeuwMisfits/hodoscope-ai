# /hodoscope — PR Trace Explorer

# NOTE: PR details tool now returns deep-dive data (description, change stats, timeline) for the detail panel

Query PR history as Hodoscope traces.

## Usage

Use the hodoscope MCP tools to explore PR data:

1. **List PRs**: `hodoscope_list_prs` with provider, owner, repo
2. **PR Details**: `hodoscope_pr_details` for a specific PR's full event trace
3. **Stats**: `hodoscope_stats` for repo-level PR metrics
4. **Timeline**: `hodoscope_timeline` for activity in a date range
5. **Open Scatter**: `hodoscope_open_scatter` — generates the cross-repo scatter visualization (GitHub + Azure DevOps + Wrike) and opens it in your default browser. Uses whichever tokens are present (`GH_TOKEN`/`gh auth`, `AZDO_TOKEN`, `WRIKE_TOKEN`); providers without credentials are skipped.

## Arguments

$ARGUMENTS — pass as `provider/owner/repo` (e.g., `github/octocat/hello-world`)

Parse the argument string and call the appropriate hodoscope MCP tool.
If no arguments provided, check if there's a git remote in the current directory and use that.
