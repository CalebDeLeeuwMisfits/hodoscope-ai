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
  const allTraces: PRTrace[] = [];
  const token = getGhToken();
  if (!token) {
    console.warn('Warning: No GitHub token found. Run `gh auth login` or set GH_TOKEN.');
  }

  // ===== GITHUB: fetch from multiple orgs =====
  const ghFetcher = new GitHubFetcher(token || undefined);
  const ghOrgs = ['marketingarchitects', 'MisfitsSkunkworks'];
  const ghEnv = { ...process.env, PATH: process.env.PATH + ';C:\\Program Files\\GitHub CLI' };

  for (const org of ghOrgs) {
    console.log(`=== GitHub: ${org} ===`);
    let ghRepos: string[] = [];
    try {
      ghRepos = execSync(
        `gh api orgs/${org}/repos --paginate --jq ".[].name"`,
        { encoding: 'utf-8', env: ghEnv }
      ).trim().split('\n').filter(Boolean);
    } catch {
      console.log(`  Could not list repos for ${org}`);
      continue;
    }
    console.log(`Found ${ghRepos.length} repos`);

    for (const repo of ghRepos) {
      try {
        process.stdout.write(`  ${repo}...`);
        const traces = await ghFetcher.fetchPRs(org, repo, { maxPRs: 50, state: 'all' });
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
  }

  // ===== AZURE DEVOPS: misfitsandmachines org =====
  const azdoOrg = process.env.AZDO_ORG_URL || 'https://dev.azure.com/misfitsandmachines';
  const azdoToken = process.env.AZDO_TOKEN || process.env.AZURE_DEVOPS_EXT_PAT || process.env.AZURE_DEVOPS_TOKEN || '';
  if (azdoToken) {
    console.log('\n=== Azure DevOps: misfitsandmachines ===');
    const azdoFetcher = new AzureDevOpsFetcher(azdoOrg, azdoToken);

    // Use the node API to list projects and repos (more reliable than az CLI)
    const azdev = require('azure-devops-node-api');
    const azdoAuth = azdev.getPersonalAccessTokenHandler(azdoToken);
    const azdoConn = new azdev.WebApi(azdoOrg, azdoAuth);
    const coreApi = await azdoConn.getCoreApi();
    const gitApi = await azdoConn.getGitApi();

    let azdoProjects: any[] = [];
    try {
      const projectsResult = await coreApi.getProjects();
      azdoProjects = projectsResult || [];
      console.log(`Found ${azdoProjects.length} projects`);
    } catch (err: any) {
      console.log(`  Could not list projects: ${err.message?.slice(0, 60)}`);
    }

    for (const proj of azdoProjects) {
      const projectName = proj.name;
      try {
        const repos = await gitApi.getRepositories(projectName);
        const repoNames = (repos || []).map((r: any) => r.name).filter(Boolean);
        console.log(`  Project "${projectName}": ${repoNames.length} repos`);

        for (const repoName of repoNames) {
          try {
            process.stdout.write(`    ${repoName}...`);
            const traces = await azdoFetcher.fetchPRs(projectName, repoName, { maxPRs: 50 });
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
  // Separate repo_created traces from PR traces (repo_created don't go through t-SNE)
  const prTraces = allTraces.filter(t => t.status !== 'repo_created');
  const repoCreatedTraces = allTraces.filter(t => t.status === 'repo_created');

  console.log('Extracting features...');
  const featureMatrix = prTraces.map(extractFeatures);
  const normalized = normalizeFeatures(featureMatrix);

  console.log('Computing t-SNE projection...');
  const perplexity = Math.min(30, Math.max(2, Math.floor(prTraces.length / 4)));
  const projected = computeTSNE(normalized, {
    perplexity,
    maxIter: 500,
    learningRate: 200,
  });

  // ===== BUILD SCATTER POINTS (PRs first) =====
  function countEvents(t: PRTrace) {
    let reviews = 0, approvals = 0, comments = 0, timeline = 0;
    for (const e of t.events) {
      switch (e.type) {
        case 'review_submitted': case 'changes_requested': reviews++; break;
        case 'approved': approvals++; break;
        case 'comment': comments++; break;
        case 'label_added': case 'label_removed': case 'review_requested':
        case 'reopened': case 'force_pushed': timeline++; break;
      }
    }
    return { reviews, approvals, comments, timeline };
  }

  const traceToPoint = (t: PRTrace, x: number, y: number): ScatterPoint => {
    const ec = countEvents(t);
    return {
      id: t.id,
      x,
      y,
      prNumber: t.prNumber,
      title: t.title,
      description: t.description,
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
      updatedAt: t.updatedAt,
      mergedAt: t.mergedAt,
      closedAt: t.closedAt,
      labels: t.labels,
      reviewers: t.reviewers,
      reviewCount: ec.reviews,
      approvalCount: ec.approvals,
      commentCount: ec.comments,
      timelineEventCount: ec.timeline,
    };
  };

  const points: ScatterPoint[] = prTraces.map((t, i) => traceToPoint(t, projected[i][0], projected[i][1]));

  // Position repo_created diamonds at the centroid of their repo's PR cluster
  const repoCentroids: Record<string, { sx: number; sy: number; n: number }> = {};
  for (const p of points) {
    if (!repoCentroids[p.repoName]) repoCentroids[p.repoName] = { sx: 0, sy: 0, n: 0 };
    repoCentroids[p.repoName].sx += p.x;
    repoCentroids[p.repoName].sy += p.y;
    repoCentroids[p.repoName].n++;
  }
  for (const t of repoCreatedTraces) {
    const repoName = t.repoFullName.split('/').pop() || t.repoFullName;
    const c = repoCentroids[repoName];
    const x = c ? c.sx / c.n : 0;
    const y = c ? c.sy / c.n : 0;
    points.push(traceToPoint(t, x, y));
  }

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
