// NOTE: Demo output now includes the deep-dive detail panel — click any scatter point to explore
/**
 * End-to-end demo: fetch real PRs and generate the visualization HTML.
 *
 * Usage: npx tsx scripts/demo.ts <owner> <repo> [maxPRs]
 */

import { GitHubFetcher } from '../src/fetchers/github';
import { buildTracePath, assignTraceColors, computeTraceStats } from '../src/models/trace-builder';
import { generateWebviewHTML } from '../src/webview/visualization';
import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';

function getGhToken(): string {
  if (process.env.GH_TOKEN) return process.env.GH_TOKEN;
  if (process.env.GITHUB_TOKEN) return process.env.GITHUB_TOKEN;
  try {
    return execSync('gh auth token', { encoding: 'utf-8' }).trim();
  } catch {
    return '';
  }
}

async function main() {
  const owner = process.argv[2] || 'marketingarchitects';
  const repo = process.argv[3] || 'scriptsooth-app';
  const maxPRs = parseInt(process.argv[4] || '100', 10);

  console.log(`Fetching PRs from ${owner}/${repo} (max: ${maxPRs})...`);

  const token = getGhToken();
  if (!token) {
    console.warn('Warning: No GitHub token found. Run `gh auth login` or set GH_TOKEN.');
  }
  const fetcher = new GitHubFetcher(token || undefined);

  const traces = await fetcher.fetchPRs(owner, repo, { maxPRs, state: 'all' });
  console.log(`Fetched ${traces.length} PRs with ${traces.reduce((s, t) => s + t.events.length, 0)} total events`);

  if (traces.length === 0) {
    console.log('No PRs found. Exiting.');
    process.exit(1);
  }

  // Print summary
  const stats = computeTraceStats(traces);
  console.log(`\nStats:`);
  console.log(`  Total PRs:    ${stats.totalPRs}`);
  console.log(`  Merged:       ${stats.mergedPRs}`);
  console.log(`  Open:         ${stats.openPRs}`);
  console.log(`  Closed:       ${stats.closedPRs}`);
  console.log(`  Authors:      ${stats.uniqueAuthors}`);
  console.log(`  Avg events:   ${stats.avgEventsPerPR.toFixed(1)}`);
  console.log(`  Date range:   ${stats.dateRange.start} → ${stats.dateRange.end}`);
  console.log(`  Top authors:`);
  stats.topAuthors.slice(0, 5).forEach(a => {
    console.log(`    ${a.author}: ${a.count} PRs`);
  });

  // Build visualization
  const paths = traces.map(buildTracePath);
  const colored = assignTraceColors(paths, 'author');
  const nonce = 'demo' + Date.now();
  const html = generateWebviewHTML(colored, stats, nonce, 'https://localhost', { standalone: true });

  // Write HTML
  const outDir = path.join(__dirname, '..', 'dist');
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
  const outFile = path.join(outDir, 'demo.html');
  fs.writeFileSync(outFile, html, 'utf-8');
  console.log(`\nVisualization written to: ${outFile}`);
  console.log(`Opening in browser...`);

  // Open in default browser
  try {
    if (process.platform === 'win32') {
      execSync(`start "" "${outFile}"`);
    } else if (process.platform === 'darwin') {
      execSync(`open "${outFile}"`);
    } else {
      execSync(`xdg-open "${outFile}"`);
    }
  } catch {
    console.log(`Could not auto-open. Open manually: file://${outFile}`);
  }
}

main().catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
