/**
 * End-to-end demo: fetch PRs from GitHub + Azure DevOps,
 * compute t-SNE projection, generate Hodoscope-style scatter visualization.
 */

import { GitHubFetcher } from '../src/fetchers/github';
import { AzureDevOpsFetcher } from '../src/fetchers/azure-devops';
import { computeTraceStats } from '../src/models/trace-builder';
import { extractFeatures, normalizeFeatures, computeTSNE } from '../src/models/projection';
import { generateScatterHTML } from '../src/webview/scatter-visualization';
import type { ScatterPoint } from '../src/webview/scatter-visualization';
import type { PRTrace } from '../src/models/types';
import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';

async function main() {
  const allTraces: PRTrace[] = [];
  const token = process.env.GH_TOKEN || process.env.GITHUB_TOKEN || '';

  // ===== GITHUB: marketingarchitects org =====
  console.log('=== GitHub: marketingarchitects ===');
  const ghFetcher = new GitHubFetcher(token || undefined);
  const ghRepos = execSync(
    `gh api orgs/marketingarchitects/repos --paginate --jq ".[].name"`,
    { encoding: 'utf-8', env: { ...process.env, PATH: process.env.PATH + ';C:\\Program Files\\GitHub CLI' } }
  ).trim().split('\n');
  console.log(`Found ${ghRepos.length} repos`);

  for (const repo of ghRepos) {
    try {
      process.stdout.write(`  ${repo}...`);
      const traces = await ghFetcher.fetchPRs('marketingarchitects', repo, { maxPRs: 50, state: 'all' });
      if (traces.length > 0) {
        allTraces.push(...traces);
        console.log(` ${traces.length} PRs`);
      } else {
        console.log(` 0`);
      }
    } catch (err: any) {
      console.log(` error`);
    }
  }

  // ===== AZURE DEVOPS: misfitsandmachines org =====
  const azdoOrg = process.env.AZDO_ORG_URL || 'https://dev.azure.com/misfitsandmachines';
  const azdoToken = process.env.AZDO_TOKEN || process.env.AZURE_DEVOPS_EXT_PAT || '';
  if (azdoToken) {
    console.log('\n=== Azure DevOps: misfitsandmachines ===');
    const azdoFetcher = new AzureDevOpsFetcher(azdoOrg, azdoToken);
    const azdoProjects = ['Venture Pitch Agent'];
    for (const project of azdoProjects) {
      try {
        // List repos in the project
        const reposJson = execSync(
          `az repos list --org "${azdoOrg}" --project "${project}" --query "[].name" -o tsv 2>/dev/null || echo ""`,
          { encoding: 'utf-8', env: { ...process.env, PATH: process.env.PATH + ';C:\\Program Files\\Microsoft SDKs\\Azure\\CLI2\\wbin' } }
        ).trim();
        const repos = reposJson.split('\n').filter(Boolean);
        console.log(`  Project "${project}": ${repos.length} repos`);

        for (const repo of repos) {
          try {
            process.stdout.write(`    ${repo}...`);
            const traces = await azdoFetcher.fetchPRs(project, repo, { maxPRs: 50 });
            if (traces.length > 0) {
              allTraces.push(...traces);
              console.log(` ${traces.length} PRs`);
            } else {
              console.log(` 0`);
            }
          } catch {
            console.log(` error`);
          }
        }
      } catch (err: any) {
        console.log(`  Error listing repos for ${project}: ${err.message?.slice(0, 60)}`);
      }
    }
  } else {
    console.log('\nSkipping Azure DevOps (no AZDO_TOKEN set)');
  }

  console.log(`\n=== Total: ${allTraces.length} PRs ===`);
  if (allTraces.length === 0) { console.log('No PRs found.'); process.exit(1); }

  // ===== FEATURE EXTRACTION & t-SNE =====
  console.log('Extracting features...');
  const featureMatrix = allTraces.map(extractFeatures);
  const normalized = normalizeFeatures(featureMatrix);

  console.log('Computing t-SNE projection...');
  const perplexity = Math.min(30, Math.max(2, Math.floor(allTraces.length / 4)));
  const projected = computeTSNE(normalized, {
    perplexity,
    maxIter: 500,
    learningRate: 200,
  });

  // ===== BUILD SCATTER POINTS =====
  const points: ScatterPoint[] = allTraces.map((t, i) => ({
    id: t.id,
    x: projected[i][0],
    y: projected[i][1],
    prNumber: t.prNumber,
    title: t.title,
    author: t.author,
    status: t.status,
    provider: t.provider,
    repoName: t.repoFullName.split('/').pop() || t.repoFullName,
    sourceBranch: t.sourceBranch,
    targetBranch: t.targetBranch,
    url: t.url,
    eventCount: t.events.length,
    additions: t.additions,
    deletions: t.deletions,
    changedFiles: t.changedFiles,
    createdAt: t.createdAt,
    labels: t.labels,
    reviewers: t.reviewers,
  }));

  const stats = computeTraceStats(allTraces);
  console.log(`Stats: ${stats.totalPRs} PRs, ${stats.uniqueAuthors} authors, ${stats.mergedPRs} merged`);

  // ===== GENERATE HTML =====
  const html = generateScatterHTML(points, stats, 'demo' + Date.now(), '', { standalone: true });

  const outDir = path.join(__dirname, '..', 'dist');
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
  const outFile = path.join(outDir, 'scatter.html');
  fs.writeFileSync(outFile, html, 'utf-8');
  console.log(`\nVisualization: ${outFile}`);

  try {
    if (process.platform === 'win32') execSync(`start "" "${outFile}"`);
  } catch {}
}

main().catch(err => { console.error('Error:', err.message); process.exit(1); });
