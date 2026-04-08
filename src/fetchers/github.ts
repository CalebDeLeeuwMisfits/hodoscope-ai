// NOTE: PR additions/deletions and description are surfaced in the scatter deep-dive detail panel
import { Octokit } from '@octokit/rest';
import type { PRTrace, TraceEvent, PRStatus, TraceEventType } from '../models/types';
import { buildRepoCreatedTrace } from '../models/trace-factory';

export interface FetchOptions {
  maxPRs?: number;
  state?: 'open' | 'closed' | 'all';
}

export class GitHubFetcher {
  private octokit: Octokit;

  constructor(token?: string) {
    this.octokit = new Octokit({ auth: token });
  }

  async fetchPRs(
    owner: string,
    repo: string,
    options: FetchOptions = {}
  ): Promise<PRTrace[]> {
    const { maxPRs = 200, state = 'all' } = options;

    const prs = await this.octokit.paginate(
      'GET /repos/{owner}/{repo}/pulls',
      {
        owner,
        repo,
        state,
        per_page: Math.min(maxPRs, 100),
        sort: 'updated',
        direction: 'desc',
      }
    );

    const limited = prs.slice(0, maxPRs);
    const traces: PRTrace[] = [];

    for (const pr of limited) {
      const [reviews, timelineEvents, comments] = await Promise.all([
        this.fetchReviews(owner, repo, pr.number),
        this.fetchTimelineEvents(owner, repo, pr.number),
        this.fetchComments(owner, repo, pr.number),
      ]);

      const events = this.buildEvents(pr, reviews, timelineEvents, comments);
      const status = this.determineStatus(pr);

      traces.push({
        id: `github-${owner}-${repo}-${pr.number}`,
        provider: 'github',
        repoFullName: `${owner}/${repo}`,
        prNumber: pr.number,
        title: pr.title,
        description: pr.body || '',
        author: pr.user?.login || 'unknown',
        authorAvatar: pr.user?.avatar_url,
        status,
        sourceBranch: pr.head.ref,
        targetBranch: pr.base.ref,
        createdAt: pr.created_at,
        updatedAt: pr.updated_at,
        mergedAt: pr.merged_at || undefined,
        closedAt: pr.closed_at || undefined,
        url: pr.html_url,
        events,
        labels: (pr.labels || []).map((l: any) => (typeof l === 'string' ? l : l.name)),
        reviewers: (pr.requested_reviewers || []).map((r: any) => r.login),
        additions: pr.additions ?? 0,
        deletions: pr.deletions ?? 0,
        changedFiles: pr.changed_files ?? 0,
      });
    }

    // Add synthetic repo creation trace
    try {
      const repoTrace = await this.fetchRepoCreation(owner, repo);
      if (repoTrace) traces.push(repoTrace);
    } catch { /* graceful degradation */ }

    return traces;
  }

  private async fetchRepoCreation(owner: string, repo: string): Promise<PRTrace | null> {
    const { data } = await this.octokit.repos.get({ owner, repo });
    // owner.login is the org for org-owned repos — try top contributor instead
    let author = data.owner?.login || 'unknown';
    try {
      const { data: contributors } = await this.octokit.repos.listContributors({
        owner, repo, per_page: 1,
      });
      if (contributors.length > 0 && contributors[0].login) {
        author = contributors[0].login;
      }
    } catch { /* fall back to owner */ }
    return buildRepoCreatedTrace(
      'github',
      `${owner}/${repo}`,
      data.created_at || new Date().toISOString(),
      author,
      data.html_url
    );
  }

  private determineStatus(pr: any): PRStatus {
    if (pr.merged_at) return 'merged';
    if (pr.draft) return 'draft';
    if (pr.state === 'open') return 'open';
    return 'closed';
  }

  private async fetchReviews(owner: string, repo: string, prNumber: number): Promise<any[]> {
    return this.octokit.paginate(
      this.octokit.pulls.listReviews.endpoint.merge({ owner, repo, pull_number: prNumber })
    );
  }

  private async fetchTimelineEvents(owner: string, repo: string, prNumber: number): Promise<any[]> {
    return this.octokit.paginate(
      this.octokit.issues.listEvents.endpoint.merge({ owner, repo, issue_number: prNumber })
    );
  }

  private async fetchComments(owner: string, repo: string, prNumber: number): Promise<any[]> {
    return this.octokit.paginate(
      this.octokit.issues.listComments.endpoint.merge({ owner, repo, issue_number: prNumber })
    );
  }

  private buildEvents(
    pr: any,
    reviews: any[],
    timelineEvents: any[],
    comments: any[]
  ): TraceEvent[] {
    const events: TraceEvent[] = [];

    // Synthetic "created" event
    events.push({
      id: `gh-created-${pr.number}`,
      type: 'created',
      timestamp: pr.created_at,
      author: pr.user?.login || 'unknown',
      description: `PR #${pr.number} created: ${pr.title}`,
    });

    // Reviews → approved / changes_requested / review_submitted
    for (const review of reviews) {
      const type = this.reviewStateToEventType(review.state);
      events.push({
        id: `gh-review-${review.id}`,
        type,
        timestamp: review.submitted_at,
        author: review.user?.login || 'unknown',
        description: review.body || `Review: ${review.state}`,
      });
    }

    // Timeline events
    for (const evt of timelineEvents) {
      const mapped = this.mapTimelineEvent(evt);
      if (mapped) events.push(mapped);
    }

    // Comments
    for (const comment of comments) {
      events.push({
        id: `gh-comment-${comment.id}`,
        type: 'comment',
        timestamp: comment.created_at,
        author: comment.user?.login || 'unknown',
        description: comment.body || 'Comment',
      });
    }

    // Synthetic "merged" or "closed" event
    if (pr.merged_at) {
      events.push({
        id: `gh-merged-${pr.number}`,
        type: 'merged',
        timestamp: pr.merged_at,
        author: pr.user?.login || 'unknown',
        description: `PR #${pr.number} merged`,
      });
    } else if (pr.closed_at && pr.state === 'closed') {
      events.push({
        id: `gh-closed-${pr.number}`,
        type: 'closed',
        timestamp: pr.closed_at,
        author: pr.user?.login || 'unknown',
        description: `PR #${pr.number} closed`,
      });
    }

    return events;
  }

  private reviewStateToEventType(state: string): TraceEventType {
    switch (state) {
      case 'APPROVED': return 'approved';
      case 'CHANGES_REQUESTED': return 'changes_requested';
      default: return 'review_submitted';
    }
  }

  private mapTimelineEvent(evt: any): TraceEvent | null {
    const author = evt.actor?.login || 'unknown';
    const ts = evt.created_at;

    switch (evt.event) {
      case 'labeled':
        return {
          id: `gh-evt-${evt.id}`,
          type: 'label_added',
          timestamp: ts,
          author,
          description: `Label added: ${evt.label?.name}`,
        };
      case 'unlabeled':
        return {
          id: `gh-evt-${evt.id}`,
          type: 'label_removed',
          timestamp: ts,
          author,
          description: `Label removed: ${evt.label?.name}`,
        };
      case 'review_requested':
        return {
          id: `gh-evt-${evt.id}`,
          type: 'review_requested',
          timestamp: ts,
          author,
          description: `Review requested from ${evt.requested_reviewer?.login || 'team'}`,
        };
      case 'reopened':
        return {
          id: `gh-evt-${evt.id}`,
          type: 'reopened',
          timestamp: ts,
          author,
          description: 'PR reopened',
        };
      case 'head_ref_force_pushed':
        return {
          id: `gh-evt-${evt.id}`,
          type: 'force_pushed',
          timestamp: ts,
          author,
          description: 'Force pushed',
        };
      default:
        return null; // Skip unrecognized events
    }
  }
}
