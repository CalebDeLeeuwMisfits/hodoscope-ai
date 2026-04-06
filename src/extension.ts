// NOTE: This file renders the particle trace webview via generateWebviewHTML and passes PR trace data through to it.
import * as vscode from 'vscode';
import { GitHubFetcher } from './fetchers/github';
import { AzureDevOpsFetcher } from './fetchers/azure-devops';
import { buildTracePath, assignTraceColors, computeTraceStats, filterTraces } from './models/trace-builder';
import { generateWebviewHTML } from './webview/visualization';
import type { PRTrace, RepoConfig } from './models/types';

let currentPanel: vscode.WebviewPanel | undefined;
let cachedTraces: PRTrace[] = [];

export function activate(context: vscode.ExtensionContext) {
  // Command: Open Hodoscope Visualizer
  const openCmd = vscode.commands.registerCommand('hodoscope.open', async () => {
    if (currentPanel) {
      currentPanel.reveal(vscode.ViewColumn.One);
      return;
    }

    currentPanel = vscode.window.createWebviewPanel(
      'hodoscope',
      'Hodoscope AI — PR Traces',
      vscode.ViewColumn.One,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [context.extensionUri],
      }
    );

    currentPanel.onDidDispose(() => {
      currentPanel = undefined;
    });

    // Handle messages from webview
    currentPanel.webview.onDidReceiveMessage(async (message) => {
      if (message.type === 'openPR') {
        const trace = cachedTraces.find((t) =>
          `${t.provider}-${t.repoFullName.replace('/', '-')}-${t.prNumber}` === message.traceId ||
          t.id === message.traceId
        );
        if (trace?.url) {
          vscode.env.openExternal(vscode.Uri.parse(trace.url));
        }
      }
    });

    await refreshVisualization(context);
  });

  // Command: Refresh PR Data
  const refreshCmd = vscode.commands.registerCommand('hodoscope.refresh', async () => {
    cachedTraces = [];
    await refreshVisualization(context);
  });

  // Command: Select Repository
  const selectRepoCmd = vscode.commands.registerCommand('hodoscope.selectRepo', async () => {
    const repoConfig = await promptRepoConfig();
    if (!repoConfig) return;

    await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: 'Hodoscope: Fetching PR traces...',
        cancellable: false,
      },
      async (progress) => {
        try {
          const traces = await fetchTraces(repoConfig, progress);
          cachedTraces = traces;

          if (!currentPanel) {
            await vscode.commands.executeCommand('hodoscope.open');
          } else {
            await refreshVisualization(context);
          }

          vscode.window.showInformationMessage(
            `Hodoscope: Loaded ${traces.length} PR traces from ${repoConfig.owner}/${repoConfig.repo}`
          );
        } catch (err: any) {
          vscode.window.showErrorMessage(`Hodoscope: ${err.message}`);
        }
      }
    );
  });

  context.subscriptions.push(openCmd, refreshCmd, selectRepoCmd);
}

async function refreshVisualization(context: vscode.ExtensionContext) {
  if (!currentPanel) return;

  // Auto-detect repo from workspace if no cached traces
  if (cachedTraces.length === 0) {
    const autoConfig = await detectRepoFromWorkspace();
    if (autoConfig) {
      try {
        cachedTraces = await fetchTraces(autoConfig);
      } catch {
        // Silent fail on auto-detect — user can manually select
      }
    }
  }

  const paths = cachedTraces.map(buildTracePath);
  const colored = assignTraceColors(paths, 'author');
  const stats = computeTraceStats(cachedTraces);

  const nonce = getNonce();
  const cspSource = currentPanel.webview.cspSource;
  const html = generateWebviewHTML(colored, stats, nonce, cspSource);

  currentPanel.webview.html = html;
}

async function fetchTraces(
  config: RepoConfig,
  progress?: vscode.Progress<{ message?: string }>
): Promise<PRTrace[]> {
  const settings = vscode.workspace.getConfiguration('hodoscope');
  const maxPRs = settings.get<number>('maxPRs', 200);

  if (config.provider === 'github') {
    const token = settings.get<string>('github.token', '');
    const fetcher = new GitHubFetcher(token || undefined);
    progress?.report({ message: 'Fetching from GitHub...' });
    return fetcher.fetchPRs(config.owner, config.repo, { maxPRs });
  } else {
    const orgUrl = settings.get<string>('azureDevOps.orgUrl', '');
    const token = settings.get<string>('azureDevOps.token', '');
    if (!orgUrl || !token) {
      throw new Error('Azure DevOps org URL and token must be configured in settings');
    }
    const fetcher = new AzureDevOpsFetcher(orgUrl, token);
    progress?.report({ message: 'Fetching from Azure DevOps...' });
    return fetcher.fetchPRs(config.project || config.owner, config.repo, { maxPRs });
  }
}

async function promptRepoConfig(): Promise<RepoConfig | undefined> {
  const provider = await vscode.window.showQuickPick(
    [
      { label: 'GitHub', value: 'github' as const },
      { label: 'Azure DevOps', value: 'azure-devops' as const },
    ],
    { placeHolder: 'Select source control provider' }
  );
  if (!provider) return undefined;

  const repoInput = await vscode.window.showInputBox({
    prompt:
      provider.value === 'github'
        ? 'Enter GitHub repo (owner/repo)'
        : 'Enter Azure DevOps repo (project/repo)',
    placeHolder: provider.value === 'github' ? 'octocat/hello-world' : 'MyProject/MyRepo',
  });
  if (!repoInput) return undefined;

  const parts = repoInput.split('/');
  if (parts.length < 2) {
    vscode.window.showErrorMessage('Invalid format. Use owner/repo or project/repo');
    return undefined;
  }

  return {
    provider: provider.value,
    owner: parts[0],
    repo: parts[1],
    project: provider.value === 'azure-devops' ? parts[0] : undefined,
  };
}

async function detectRepoFromWorkspace(): Promise<RepoConfig | undefined> {
  // Try to detect GitHub/AzDO repo from git remote in workspace
  const folders = vscode.workspace.workspaceFolders;
  if (!folders?.length) return undefined;

  // This would use git commands to detect — simplified for now
  return undefined;
}

function getNonce(): string {
  let text = '';
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  for (let i = 0; i < 32; i++) {
    text += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return text;
}

export function deactivate() {
  currentPanel?.dispose();
}
