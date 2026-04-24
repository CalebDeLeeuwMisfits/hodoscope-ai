#!/usr/bin/env node

// NOTE: PR detail responses now include description and timeline data for the deep-dive panel

/**
 * Hodoscope AI — MCP Server for Claude Code
 *
 * Provides PR trace data as MCP tools so Claude Code users
 * can query PR history from the terminal.
 */

import { GitHubFetcher } from '../src/fetchers/github';
import { AzureDevOpsFetcher } from '../src/fetchers/azure-devops';
import {
  buildTracePath,
  computeTraceStats,
  filterTraces,
  groupTraces,
  assignTraceColors,
} from '../src/models/trace-builder';
import type { PRTrace, TraceFilter } from '../src/models/types';
import { spawn } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';

// Simple MCP server over stdio
interface MCPRequest {
  jsonrpc: '2.0';
  id: string | number;
  method: string;
  params?: any;
}

interface MCPResponse {
  jsonrpc: '2.0';
  id: string | number;
  result?: any;
  error?: { code: number; message: string };
}

// Cached traces
let cachedTraces: PRTrace[] = [];

const TOOLS = [
  {
    name: 'hodoscope_list_prs',
    description: 'List PR traces from GitHub or Azure DevOps. Returns summary of each PR.',
    inputSchema: {
      type: 'object',
      properties: {
        provider: { type: 'string', enum: ['github', 'azure-devops'], description: 'SCM provider' },
        owner: { type: 'string', description: 'Repo owner or project name' },
        repo: { type: 'string', description: 'Repository name' },
        status: { type: 'string', enum: ['all', 'open', 'merged', 'closed'], default: 'all' },
        author: { type: 'string', description: 'Filter by author' },
        maxPRs: { type: 'number', default: 50 },
      },
      required: ['provider', 'owner', 'repo'],
    },
  },
  {
    name: 'hodoscope_pr_details',
    description: 'Get detailed trace (full event timeline) for a specific PR.',
    inputSchema: {
      type: 'object',
      properties: {
        provider: { type: 'string', enum: ['github', 'azure-devops'] },
        owner: { type: 'string' },
        repo: { type: 'string' },
        prNumber: { type: 'number', description: 'PR number' },
      },
      required: ['provider', 'owner', 'repo', 'prNumber'],
    },
  },
  {
    name: 'hodoscope_stats',
    description: 'Get aggregate PR statistics for a repository.',
    inputSchema: {
      type: 'object',
      properties: {
        provider: { type: 'string', enum: ['github', 'azure-devops'] },
        owner: { type: 'string' },
        repo: { type: 'string' },
        maxPRs: { type: 'number', default: 100 },
      },
      required: ['provider', 'owner', 'repo'],
    },
  },
  {
    name: 'hodoscope_timeline',
    description: 'Get PR activity timeline for a date range. Useful for standup reports.',
    inputSchema: {
      type: 'object',
      properties: {
        provider: { type: 'string', enum: ['github', 'azure-devops'] },
        owner: { type: 'string' },
        repo: { type: 'string' },
        startDate: { type: 'string', description: 'ISO date string (start)' },
        endDate: { type: 'string', description: 'ISO date string (end)' },
      },
      required: ['provider', 'owner', 'repo'],
    },
  },
  {
    name: 'hodoscope_open_scatter',
    description: 'Generate the cross-repo scatter visualization (GitHub + Azure DevOps + Wrike) and open it in the default browser. Uses whichever tokens are present in the environment (GH_TOKEN / gh CLI, AZDO_TOKEN, WRIKE_TOKEN). Skips any provider without credentials. Safe to run with only a GitHub token.',
    inputSchema: {
      type: 'object',
      properties: {
        openInBrowser: {
          type: 'boolean',
          default: true,
          description: 'Whether to launch the default browser after generation. Set false in headless environments.',
        },
      },
    },
  },
];

function openInBrowser(filePath: string): void {
  const abs = path.resolve(filePath);
  if (process.platform === 'win32') {
    // cmd `start` needs an empty title arg so paths with spaces parse correctly.
    spawn('cmd', ['/c', 'start', '""', abs], { detached: true, stdio: 'ignore' }).unref();
  } else if (process.platform === 'darwin') {
    spawn('open', [abs], { detached: true, stdio: 'ignore' }).unref();
  } else {
    spawn('xdg-open', [abs], { detached: true, stdio: 'ignore' }).unref();
  }
}

function runScatterScript(): Promise<{ html: string; log: string }> {
  return new Promise((resolve, reject) => {
    // Resolve the script relative to this file so it works from any cwd.
    const scriptPath = path.resolve(__dirname, '..', 'scripts', 'demo-scatter.ts');
    const htmlPath = path.resolve(__dirname, '..', 'dist', 'index.html');
    if (!fs.existsSync(scriptPath)) {
      reject(new Error(`demo-scatter.ts not found at ${scriptPath}`));
      return;
    }
    const child = spawn('npx', ['tsx', scriptPath], {
      env: process.env,
      shell: process.platform === 'win32',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let log = '';
    child.stdout?.on('data', (d) => { log += d.toString(); });
    child.stderr?.on('data', (d) => { log += d.toString(); });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(`demo-scatter.ts exited with code ${code}\n${log}`));
        return;
      }
      if (!fs.existsSync(htmlPath)) {
        reject(new Error(`index.html was not produced at ${htmlPath}`));
        return;
      }
      resolve({ html: htmlPath, log });
    });
  });
}

async function fetchPRsIfNeeded(provider: string, owner: string, repo: string, maxPRs = 100): Promise<PRTrace[]> {
  // Use cache if same repo
  const cacheKey = `${provider}-${owner}-${repo}`;
  if (cachedTraces.length > 0 && cachedTraces[0]?.repoFullName === `${owner}/${repo}`) {
    return cachedTraces;
  }

  if (provider === 'github') {
    const token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN;
    const fetcher = new GitHubFetcher(token);
    cachedTraces = await fetcher.fetchPRs(owner, repo, { maxPRs });
  } else {
    const orgUrl = process.env.AZDO_ORG_URL || '';
    const token = process.env.AZDO_TOKEN || '';
    const fetcher = new AzureDevOpsFetcher(orgUrl, token);
    cachedTraces = await fetcher.fetchPRs(owner, repo, { maxPRs });
  }
  return cachedTraces;
}

async function handleToolCall(name: string, args: any): Promise<any> {
  switch (name) {
    case 'hodoscope_list_prs': {
      const traces = await fetchPRsIfNeeded(args.provider, args.owner, args.repo, args.maxPRs || 50);
      const filter: TraceFilter = {};
      if (args.status && args.status !== 'all') filter.statuses = [args.status];
      if (args.author) filter.authors = [args.author];
      const filtered = filterTraces(traces, filter);

      return {
        content: [{
          type: 'text',
          text: JSON.stringify(filtered.map(t => ({
            number: t.prNumber,
            title: t.title,
            author: t.author,
            status: t.status,
            branch: `${t.sourceBranch} → ${t.targetBranch}`,
            created: t.createdAt,
            events: t.events.length,
            url: t.url,
          })), null, 2),
        }],
      };
    }

    case 'hodoscope_pr_details': {
      const traces = await fetchPRsIfNeeded(args.provider, args.owner, args.repo);
      const trace = traces.find(t => t.prNumber === args.prNumber);
      if (!trace) return { content: [{ type: 'text', text: `PR #${args.prNumber} not found` }] };

      const path = buildTracePath(trace);
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            ...trace,
            tracePath: path.points.map(p => ({
              event: p.type,
              author: p.author,
              time: new Date(p.timestamp).toISOString(),
              description: p.description,
            })),
          }, null, 2),
        }],
      };
    }

    case 'hodoscope_stats': {
      const traces = await fetchPRsIfNeeded(args.provider, args.owner, args.repo, args.maxPRs || 100);
      const stats = computeTraceStats(traces);
      return {
        content: [{ type: 'text', text: JSON.stringify(stats, null, 2) }],
      };
    }

    case 'hodoscope_timeline': {
      const traces = await fetchPRsIfNeeded(args.provider, args.owner, args.repo);
      const filter: TraceFilter = {};
      if (args.startDate && args.endDate) {
        filter.dateRange = { start: args.startDate, end: args.endDate };
      }
      const filtered = filterTraces(traces, filter);
      // Build timeline of all events across PRs
      const allEvents = filtered.flatMap(t =>
        t.events.map(e => ({
          prNumber: t.prNumber,
          prTitle: t.title,
          ...e,
        }))
      ).sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

      return {
        content: [{ type: 'text', text: JSON.stringify(allEvents, null, 2) }],
      };
    }

    case 'hodoscope_open_scatter': {
      const { html, log } = await runScatterScript();
      const shouldOpen = args.openInBrowser !== false;
      if (shouldOpen) openInBrowser(html);
      const summary = log.split('\n').filter(l => l.includes('===') || /^Stats:/.test(l)).join('\n');
      return {
        content: [{
          type: 'text',
          text: `Generated scatter visualization at:\n${html}\n\n${summary || log.slice(-500)}\n\n${shouldOpen ? 'Opened in your default browser.' : 'Browser open skipped (openInBrowser=false).'}`,
        }],
      };
    }

    default:
      return { content: [{ type: 'text', text: `Unknown tool: ${name}` }] };
  }
}

// MCP stdio protocol handler
async function handleMessage(msg: MCPRequest): Promise<MCPResponse> {
  try {
    switch (msg.method) {
      case 'initialize':
        return {
          jsonrpc: '2.0',
          id: msg.id,
          result: {
            protocolVersion: '2024-11-05',
            capabilities: { tools: {} },
            serverInfo: { name: 'hodoscope-ai', version: '0.1.0' },
          },
        };

      case 'tools/list':
        return {
          jsonrpc: '2.0',
          id: msg.id,
          result: { tools: TOOLS },
        };

      case 'tools/call':
        const result = await handleToolCall(msg.params.name, msg.params.arguments || {});
        return { jsonrpc: '2.0', id: msg.id, result };

      default:
        return {
          jsonrpc: '2.0',
          id: msg.id,
          result: {},
        };
    }
  } catch (err: any) {
    return {
      jsonrpc: '2.0',
      id: msg.id,
      error: { code: -32000, message: err.message },
    };
  }
}

// Stdio transport
if (require.main === module) {
  let buffer = '';
  process.stdin.setEncoding('utf-8');
  process.stdin.on('data', (chunk: string) => {
    buffer += chunk;
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';
    for (const line of lines) {
      if (!line.trim()) continue;
      try {
        const msg = JSON.parse(line) as MCPRequest;
        handleMessage(msg).then((res) => {
          process.stdout.write(JSON.stringify(res) + '\n');
        });
      } catch {
        // Skip malformed lines
      }
    }
  });
}

export { handleToolCall, TOOLS };
