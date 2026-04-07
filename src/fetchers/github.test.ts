import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GitHubFetcher } from './github';
import type { PRTrace } from '../models/types';

// NOTE: GitHub PR data (description, additions, deletions, timeline) powers the deep-dive panel

// Mock Octokit
const mockPaginate = vi.fn();
const mockGetPR = vi.fn();
const mockListReviews = vi.fn();
const mockListEvents = vi.fn();
const mockListComments = vi.fn();
const mockReposGet = vi.fn();

vi.mock('@octokit/rest', () => ({
  Octokit: vi.fn(() => ({
    paginate: mockPaginate,
    pulls: {
      get: mockGetPR,
      listReviews: { endpoint: { merge: vi.fn() } },
    },
    issues: {
      listEvents: { endpoint: { merge: vi.fn() } },
      listComments: { endpoint: { merge: vi.fn() } },
    },
    repos: {
      get: mockReposGet,
    },
  })),
}));

// --- Test Data ---

const sampleGHPR = {
  number: 42,
  title: 'Add feature X',
  body: 'Implements feature X for the dashboard',
  state: 'closed',
  merged_at: '2026-01-17T14:00:00Z',
  created_at: '2026-01-15T10:00:00Z',
  updated_at: '2026-01-17T14:00:00Z',
  closed_at: '2026-01-17T14:00:00Z',
  html_url: 'https://github.com/org/repo/pull/42',
  head: { ref: 'feature/x' },
  base: { ref: 'main' },
  user: { login: 'alice', avatar_url: 'https://avatars.githubusercontent.com/alice' },
  labels: [{ name: 'feature' }, { name: 'ready' }],
  requested_reviewers: [{ login: 'bob' }],
  additions: 150,
  deletions: 20,
  changed_files: 5,
  draft: false,
};

const sampleReviews = [
  {
    id: 101,
    user: { login: 'bob' },
    state: 'APPROVED',
    submitted_at: '2026-01-16T15:00:00Z',
    body: 'LGTM!',
  },
];

const sampleEvents = [
  {
    id: 201,
    event: 'labeled',
    created_at: '2026-01-15T11:00:00Z',
    actor: { login: 'alice' },
    label: { name: 'feature' },
  },
  {
    id: 202,
    event: 'review_requested',
    created_at: '2026-01-15T12:00:00Z',
    actor: { login: 'alice' },
    requested_reviewer: { login: 'bob' },
  },
];

const sampleComments = [
  {
    id: 301,
    user: { login: 'charlie' },
    created_at: '2026-01-16T09:00:00Z',
    body: 'Nice approach!',
  },
];

describe('GitHubFetcher', () => {
  let fetcher: GitHubFetcher;

  beforeEach(() => {
    vi.clearAllMocks();
    fetcher = new GitHubFetcher('fake-token');
  });

  describe('fetchPRs', () => {
    it('fetches PRs from GitHub API and returns PRTrace array', async () => {
      mockPaginate
        .mockResolvedValueOnce([sampleGHPR]) // PRs
        .mockResolvedValueOnce(sampleReviews) // reviews for PR 42
        .mockResolvedValueOnce(sampleEvents) // events for PR 42
        .mockResolvedValueOnce(sampleComments); // comments for PR 42

      const traces = await fetcher.fetchPRs('org', 'repo', { maxPRs: 10 });

      expect(traces).toHaveLength(1);
      const trace = traces[0];
      expect(trace.provider).toBe('github');
      expect(trace.prNumber).toBe(42);
      expect(trace.title).toBe('Add feature X');
      expect(trace.author).toBe('alice');
      expect(trace.status).toBe('merged');
      expect(trace.sourceBranch).toBe('feature/x');
      expect(trace.targetBranch).toBe('main');
      expect(trace.url).toBe('https://github.com/org/repo/pull/42');
    });

    it('correctly determines PR status: merged', async () => {
      mockPaginate
        .mockResolvedValueOnce([sampleGHPR])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([]);

      const traces = await fetcher.fetchPRs('org', 'repo');
      expect(traces[0].status).toBe('merged');
    });

    it('correctly determines PR status: open', async () => {
      const openPR = { ...sampleGHPR, state: 'open', merged_at: null, closed_at: null };
      mockPaginate
        .mockResolvedValueOnce([openPR])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([]);

      const traces = await fetcher.fetchPRs('org', 'repo');
      expect(traces[0].status).toBe('open');
    });

    it('correctly determines PR status: draft', async () => {
      const draftPR = { ...sampleGHPR, state: 'open', merged_at: null, closed_at: null, draft: true };
      mockPaginate
        .mockResolvedValueOnce([draftPR])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([]);

      const traces = await fetcher.fetchPRs('org', 'repo');
      expect(traces[0].status).toBe('draft');
    });

    it('builds trace events from reviews, timeline events, and comments', async () => {
      mockPaginate
        .mockResolvedValueOnce([sampleGHPR])
        .mockResolvedValueOnce(sampleReviews)
        .mockResolvedValueOnce(sampleEvents)
        .mockResolvedValueOnce(sampleComments);

      const traces = await fetcher.fetchPRs('org', 'repo');
      const events = traces[0].events;

      // Should have: created + 1 review + 2 timeline events + 1 comment + merged = 6
      expect(events.length).toBeGreaterThanOrEqual(4);

      // Should include the 'created' synthetic event
      expect(events.some((e) => e.type === 'created')).toBe(true);

      // Should include the approval from review
      expect(events.some((e) => e.type === 'approved')).toBe(true);

      // Should include comment
      expect(events.some((e) => e.type === 'comment')).toBe(true);
    });

    it('adds merged event when PR is merged', async () => {
      mockPaginate
        .mockResolvedValueOnce([sampleGHPR])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([]);

      const traces = await fetcher.fetchPRs('org', 'repo');
      expect(traces[0].events.some((e) => e.type === 'merged')).toBe(true);
    });

    it('handles empty PR list', async () => {
      mockPaginate.mockResolvedValueOnce([]);
      const traces = await fetcher.fetchPRs('org', 'repo');
      expect(traces).toEqual([]);
    });

    it('populates labels and reviewers', async () => {
      mockPaginate
        .mockResolvedValueOnce([sampleGHPR])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([]);

      const traces = await fetcher.fetchPRs('org', 'repo');
      expect(traces[0].labels).toContain('feature');
      expect(traces[0].labels).toContain('ready');
      expect(traces[0].reviewers).toContain('bob');
    });

    it('populates additions/deletions/changedFiles', async () => {
      mockPaginate
        .mockResolvedValueOnce([sampleGHPR])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([]);

      const traces = await fetcher.fetchPRs('org', 'repo');
      expect(traces[0].additions).toBe(150);
      expect(traces[0].deletions).toBe(20);
      expect(traces[0].changedFiles).toBe(5);
    });

    it('includes a synthetic repo_created trace', async () => {
      mockPaginate
        .mockResolvedValueOnce([sampleGHPR])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([]);
      mockReposGet.mockResolvedValueOnce({
        data: {
          created_at: '2020-06-15T00:00:00Z',
          owner: { login: 'orgbot' },
          html_url: 'https://github.com/org/repo',
        },
      });

      const traces = await fetcher.fetchPRs('org', 'repo');
      const repoTrace = traces.find(t => t.status === 'repo_created');
      expect(repoTrace).toBeDefined();
    });

    it('repo_created trace has correct shape', async () => {
      mockPaginate.mockResolvedValueOnce([]);
      mockReposGet.mockResolvedValueOnce({
        data: {
          created_at: '2020-06-15T00:00:00Z',
          owner: { login: 'orgbot' },
          html_url: 'https://github.com/org/repo',
        },
      });

      const traces = await fetcher.fetchPRs('org', 'repo');
      expect(traces).toHaveLength(1);
      const t = traces[0];
      expect(t.status).toBe('repo_created');
      expect(t.prNumber).toBe(0);
      expect(t.additions).toBe(0);
      expect(t.deletions).toBe(0);
      expect(t.changedFiles).toBe(0);
      expect(t.sourceBranch).toBe('');
      expect(t.targetBranch).toBe('');
      expect(t.events).toHaveLength(1);
      expect(t.events[0].type).toBe('created');
      expect(t.labels).toEqual([]);
      expect(t.reviewers).toEqual([]);
      expect(t.url).toBe('https://github.com/org/repo');
      expect(t.author).toBe('orgbot');
      expect(t.createdAt).toBe('2020-06-15T00:00:00Z');
    });

    it('still works when repo metadata fetch fails', async () => {
      mockPaginate
        .mockResolvedValueOnce([sampleGHPR])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([]);
      mockReposGet.mockRejectedValueOnce(new Error('Not Found'));

      const traces = await fetcher.fetchPRs('org', 'repo');
      expect(traces).toHaveLength(1);
      expect(traces[0].status).toBe('merged');
    });
  });
});
