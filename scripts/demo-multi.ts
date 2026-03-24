/**
 * Multi-repo demo: fetch PRs from ALL repos in the org for a richer visualization.
 */

import { GitHubFetcher } from '../src/fetchers/github';
import { buildTracePath, assignTraceColors, computeTraceStats } from '../src/models/trace-builder';
import { generateWebviewHTML } from '../src/webview/visualization';
import type { PRTrace } from '../src/models/types';
import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';

async function main() {
  const org = process.argv[2] || 'marketingarchitects';
  const token = process.env.GH_TOKEN || process.env.GITHUB_TOKEN || '';
  const fetcher = new GitHubFetcher(token || undefined);

  // List all repos in the org
  console.log(`Listing repos in ${org}...`);
  const reposRaw = execSync(
    `"${process.env.GH_PATH || 'gh'}" api orgs/${org}/repos --paginate --jq ".[].name"`,
    { encoding: 'utf-8', env: { ...process.env, PATH: process.env.PATH + ';C:\\Program Files\\GitHub CLI' } }
  ).trim().split('\n');
  console.log(`Found ${reposRaw.length} repos`);

  const allTraces: PRTrace[] = [];

  for (const repo of reposRaw) {
    try {
      process.stdout.write(`  ${repo}...`);
      const traces = await fetcher.fetchPRs(org, repo, { maxPRs: 50, state: 'all' });
      if (traces.length > 0) {
        allTraces.push(...traces);
        console.log(` ${traces.length} PRs`);
      } else {
        console.log(` 0 PRs`);
      }
    } catch (err: any) {
      console.log(` error: ${err.message?.slice(0, 60)}`);
    }
  }

  console.log(`\nTotal: ${allTraces.length} PRs across ${reposRaw.length} repos`);

  if (allTraces.length === 0) {
    console.log('No PRs found. Exiting.');
    process.exit(1);
  }

  const stats = computeTraceStats(allTraces);
  console.log(`Stats:`);
  console.log(`  Total PRs:    ${stats.totalPRs}`);
  console.log(`  Merged:       ${stats.mergedPRs}`);
  console.log(`  Open:         ${stats.openPRs}`);
  console.log(`  Closed:       ${stats.closedPRs}`);
  console.log(`  Authors:      ${stats.uniqueAuthors}`);
  console.log(`  Avg events:   ${stats.avgEventsPerPR.toFixed(1)}`);
  console.log(`  Date range:   ${stats.dateRange.start} → ${stats.dateRange.end}`);
  console.log(`  Top authors:`);
  stats.topAuthors.slice(0, 10).forEach(a => {
    console.log(`    ${a.author}: ${a.count} PRs`);
  });

  // Build visualization
  const paths = allTraces.map(buildTracePath);
  const colored = assignTraceColors(paths, 'author');
  const nonce = 'demo' + Date.now();
  const html = generateWebviewHTML(colored, stats, nonce, 'https://localhost', { standalone: true });

  const outDir = path.join(__dirname, '..', 'dist');
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
  const outFile = path.join(outDir, 'demo-org.html');
  fs.writeFileSync(outFile, html, 'utf-8');
  console.log(`\nVisualization written to: ${outFile}`);
  console.log(`Opening in browser...`);

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
