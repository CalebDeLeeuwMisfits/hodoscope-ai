// NOTE: PR description and dates are passed through to the deep-dive detail panel
import * as azdev from 'azure-devops-node-api';
import type { PRTrace, TraceEvent, PRStatus, TraceEventType } from '../models/types';

export interface AzdoFetchOptions {
  maxPRs?: number;
  status?: 'all' | 'active' | 'completed' | 'abandoned';
}

// Azure DevOps PR status codes
const AZDO_STATUS = {
  ACTIVE: 1,
  ABANDONED: 2,
  COMPLETED: 3,
} as const;

// Azure DevOps reviewer vote values
const AZDO_VOTE = {
  APPROVED: 10,
  APPROVED_WITH_SUGGESTIONS: 5,
  NO_VOTE: 0,
  WAIT: -5,
  REJECTED: -10,
} as const;

export class AzureDevOpsFetcher {
  private orgUrl: string;
  private token: string;

  constructor(orgUrl: string, token: string) {
    this.orgUrl = orgUrl;
    this.token = token;
  }

  async fetchPRs(
    project: string,
    repo: string,
    options: AzdoFetchOptions = {}
  ): Promise<PRTrace[]> {
    const { maxPRs = 200 } = options;

    const authHandler = azdev.getPersonalAccessTokenHandler(this.token);
    const connection = new azdev.WebApi(this.orgUrl, authHandler);
    const gitApi = await connection.getGitApi();

    const prs = await gitApi.getPullRequests(repo, {
      status: undefined, // all
    }, project);

    const limited = (prs || []).slice(0, maxPRs);
    const traces: PRTrace[] = [];

    for (const pr of limited) {
      const prId = pr.pullRequestId!;
      const [threads, iterations, reviewers] = await Promise.all([
        gitApi.getThreads(repo, prId, project).catch(() => []),
        gitApi.getPullRequestIterations(repo, prId, project).catch(() => []),
        gitApi.getPullRequestReviewers(repo, prId, project).catch(() => []),
      ]);

      const events = this.buildEvents(pr, threads || [], iterations || [], reviewers || []);
      const status = this.determineStatus(pr);

      const createdAt = pr.creationDate?.toISOString() || new Date().toISOString();
      const closedAt = pr.closedDate?.toISOString();

      traces.push({
        id: `azdo-${project}-${repo}-${prId}`,
        provider: 'azure-devops',
        repoFullName: `${project}/${repo}`,
        prNumber: prId,
        title: pr.title || '',
        description: pr.description || '',
        author: pr.createdBy?.displayName || 'unknown',
        authorAvatar: pr.createdBy?.imageUrl,
        status,
        sourceBranch: this.stripRefPrefix(pr.sourceRefName || ''),
        targetBranch: this.stripRefPrefix(pr.targetRefName || ''),
        createdAt,
        updatedAt: closedAt || createdAt,
        mergedAt: status === 'merged' ? closedAt : undefined,
        closedAt: closedAt,
        url: pr.url || '',
        events,
        labels: (pr.labels || []).map((l: any) => l.name),
        reviewers: (reviewers || []).map((r: any) => r.displayName),
        additions: 0, // AzDO doesn't expose this in PR summary
        deletions: 0,
        changedFiles: 0,
      });
    }

    return traces;
  }

  private stripRefPrefix(ref: string): string {
    return ref.replace(/^refs\/heads\//, '');
  }

  private determineStatus(pr: any): PRStatus {
    if (pr.status === AZDO_STATUS.COMPLETED) return 'merged';
    if (pr.status === AZDO_STATUS.ABANDONED) return 'closed';
    return 'open';
  }

  private buildEvents(
    pr: any,
    threads: any[],
    iterations: any[],
    reviewers: any[]
  ): TraceEvent[] {
    const events: TraceEvent[] = [];
    const createdAt = pr.creationDate?.toISOString() || new Date().toISOString();

    // Synthetic created event
    events.push({
      id: `azdo-created-${pr.pullRequestId}`,
      type: 'created',
      timestamp: createdAt,
      author: pr.createdBy?.displayName || 'unknown',
      description: `PR #${pr.pullRequestId} created: ${pr.title}`,
    });

    // Iterations → commit/push events
    for (const iter of iterations) {
      events.push({
        id: `azdo-iter-${iter.id}`,
        type: 'commit',
        timestamp: iter.createdDate?.toISOString() || createdAt,
        author: iter.author?.displayName || pr.createdBy?.displayName || 'unknown',
        description: iter.description || `Push iteration ${iter.id}`,
        metadata: { commitId: iter.sourceRefCommit?.commitId },
      });
    }

    // Threads → comments
    for (const thread of threads) {
      if (!thread.comments?.length) continue;
      const firstComment = thread.comments[0];
      if (firstComment.commentType === 0) continue; // skip system comments

      events.push({
        id: `azdo-thread-${thread.id}`,
        type: 'comment',
        timestamp: thread.publishedDate?.toISOString() || createdAt,
        author: firstComment.author?.displayName || 'unknown',
        description: firstComment.content || 'Comment',
      });
    }

    // Reviewer votes
    for (const reviewer of reviewers) {
      if (reviewer.vote === AZDO_VOTE.NO_VOTE) continue;

      const type: TraceEventType =
        reviewer.vote >= AZDO_VOTE.APPROVED_WITH_SUGGESTIONS ? 'approved' :
        reviewer.vote === AZDO_VOTE.REJECTED ? 'changes_requested' :
        reviewer.vote === AZDO_VOTE.WAIT ? 'review_submitted' :
        'review_submitted';

      events.push({
        id: `azdo-vote-${reviewer.uniqueName}`,
        type,
        timestamp: createdAt, // AzDO doesn't timestamp individual votes
        author: reviewer.displayName || 'unknown',
        description: `Vote: ${this.voteLabel(reviewer.vote)}`,
      });
    }

    // Merged/closed synthetic event
    if (pr.status === AZDO_STATUS.COMPLETED && pr.closedDate) {
      events.push({
        id: `azdo-merged-${pr.pullRequestId}`,
        type: 'merged',
        timestamp: pr.closedDate.toISOString(),
        author: pr.createdBy?.displayName || 'unknown',
        description: `PR #${pr.pullRequestId} merged`,
      });
    } else if (pr.status === AZDO_STATUS.ABANDONED && pr.closedDate) {
      events.push({
        id: `azdo-closed-${pr.pullRequestId}`,
        type: 'closed',
        timestamp: pr.closedDate.toISOString(),
        author: pr.createdBy?.displayName || 'unknown',
        description: `PR #${pr.pullRequestId} abandoned`,
      });
    }

    return events;
  }

  private voteLabel(vote: number): string {
    switch (vote) {
      case 10: return 'Approved';
      case 5: return 'Approved with suggestions';
      case -5: return 'Waiting';
      case -10: return 'Rejected';
      default: return 'No vote';
    }
  }
}
