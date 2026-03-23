import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AzureDevOpsFetcher } from './azure-devops';

// Mock the azure-devops-node-api
const mockGetPullRequests = vi.fn();
const mockGetPullRequestThreads = vi.fn();
const mockGetPullRequestIterations = vi.fn();
const mockGetPullRequestReviewers = vi.fn();

vi.mock('azure-devops-node-api', () => ({
  WebApi: vi.fn(() => ({
    getGitApi: vi.fn(() => ({
      getPullRequests: mockGetPullRequests,
      getThreads: mockGetPullRequestThreads,
      getPullRequestIterations: mockGetPullRequestIterations,
      getPullRequestReviewers: mockGetPullRequestReviewers,
    })),
  })),
  getPersonalAccessTokenHandler: vi.fn(() => ({})),
}));

// --- Test Data ---

const sampleAzdoPR = {
  pullRequestId: 99,
  title: 'Fix login bug',
  description: 'Fixes the SSO timeout issue',
  status: 3, // completed (merged)
  creationDate: new Date('2026-02-10T08:00:00Z'),
  closedDate: new Date('2026-02-12T16:00:00Z'),
  sourceRefName: 'refs/heads/fix/login',
  targetRefName: 'refs/heads/main',
  createdBy: {
    displayName: 'Bob',
    uniqueName: 'bob@company.com',
    imageUrl: 'https://azdo.com/avatar/bob',
  },
  mergeStatus: 3, // succeeded
  url: 'https://dev.azure.com/myorg/project/_git/repo/pullrequest/99',
  labels: [{ name: 'bugfix' }],
  repository: { name: 'repo', project: { name: 'project' } },
};

const sampleThreads = [
  {
    id: 501,
    publishedDate: new Date('2026-02-11T10:00:00Z'),
    status: 0,
    comments: [
      {
        id: 1,
        author: { displayName: 'Carol', uniqueName: 'carol@company.com' },
        content: 'Looks good but check edge case',
        publishedDate: new Date('2026-02-11T10:00:00Z'),
        commentType: 1, // text
      },
    ],
  },
];

const sampleIterations = [
  {
    id: 1,
    createdDate: new Date('2026-02-10T08:30:00Z'),
    author: { displayName: 'Bob', uniqueName: 'bob@company.com' },
    description: 'Initial push',
    sourceRefCommit: { commitId: 'abc123' },
  },
  {
    id: 2,
    createdDate: new Date('2026-02-11T14:00:00Z'),
    author: { displayName: 'Bob', uniqueName: 'bob@company.com' },
    description: 'Address review feedback',
    sourceRefCommit: { commitId: 'def456' },
  },
];

const sampleReviewers = [
  {
    displayName: 'Carol',
    uniqueName: 'carol@company.com',
    vote: 10, // approved
    imageUrl: 'https://azdo.com/avatar/carol',
  },
  {
    displayName: 'Dave',
    uniqueName: 'dave@company.com',
    vote: 0, // no vote
    imageUrl: 'https://azdo.com/avatar/dave',
  },
];

describe('AzureDevOpsFetcher', () => {
  let fetcher: AzureDevOpsFetcher;

  beforeEach(() => {
    vi.clearAllMocks();
    fetcher = new AzureDevOpsFetcher('https://dev.azure.com/myorg', 'fake-token');
  });

  describe('fetchPRs', () => {
    it('fetches PRs from Azure DevOps and returns PRTrace array', async () => {
      mockGetPullRequests.mockResolvedValue([sampleAzdoPR]);
      mockGetPullRequestThreads.mockResolvedValue(sampleThreads);
      mockGetPullRequestIterations.mockResolvedValue(sampleIterations);
      mockGetPullRequestReviewers.mockResolvedValue(sampleReviewers);

      const traces = await fetcher.fetchPRs('project', 'repo');

      expect(traces).toHaveLength(1);
      const trace = traces[0];
      expect(trace.provider).toBe('azure-devops');
      expect(trace.prNumber).toBe(99);
      expect(trace.title).toBe('Fix login bug');
      expect(trace.author).toBe('Bob');
      expect(trace.sourceBranch).toBe('fix/login');
      expect(trace.targetBranch).toBe('main');
    });

    it('correctly determines merged status', async () => {
      mockGetPullRequests.mockResolvedValue([sampleAzdoPR]);
      mockGetPullRequestThreads.mockResolvedValue([]);
      mockGetPullRequestIterations.mockResolvedValue([]);
      mockGetPullRequestReviewers.mockResolvedValue([]);

      const traces = await fetcher.fetchPRs('project', 'repo');
      expect(traces[0].status).toBe('merged');
    });

    it('correctly determines open/active status', async () => {
      const activePR = { ...sampleAzdoPR, status: 1, closedDate: null, mergeStatus: 0 };
      mockGetPullRequests.mockResolvedValue([activePR]);
      mockGetPullRequestThreads.mockResolvedValue([]);
      mockGetPullRequestIterations.mockResolvedValue([]);
      mockGetPullRequestReviewers.mockResolvedValue([]);

      const traces = await fetcher.fetchPRs('project', 'repo');
      expect(traces[0].status).toBe('open');
    });

    it('correctly determines abandoned (closed) status', async () => {
      const abandonedPR = { ...sampleAzdoPR, status: 2, mergeStatus: 0 };
      mockGetPullRequests.mockResolvedValue([abandonedPR]);
      mockGetPullRequestThreads.mockResolvedValue([]);
      mockGetPullRequestIterations.mockResolvedValue([]);
      mockGetPullRequestReviewers.mockResolvedValue([]);

      const traces = await fetcher.fetchPRs('project', 'repo');
      expect(traces[0].status).toBe('closed');
    });

    it('builds events from iterations (push events)', async () => {
      mockGetPullRequests.mockResolvedValue([sampleAzdoPR]);
      mockGetPullRequestThreads.mockResolvedValue([]);
      mockGetPullRequestIterations.mockResolvedValue(sampleIterations);
      mockGetPullRequestReviewers.mockResolvedValue([]);

      const traces = await fetcher.fetchPRs('project', 'repo');
      const commitEvents = traces[0].events.filter((e) => e.type === 'commit');
      expect(commitEvents).toHaveLength(2);
    });

    it('builds events from threads (comments)', async () => {
      mockGetPullRequests.mockResolvedValue([sampleAzdoPR]);
      mockGetPullRequestThreads.mockResolvedValue(sampleThreads);
      mockGetPullRequestIterations.mockResolvedValue([]);
      mockGetPullRequestReviewers.mockResolvedValue([]);

      const traces = await fetcher.fetchPRs('project', 'repo');
      const commentEvents = traces[0].events.filter((e) => e.type === 'comment');
      expect(commentEvents.length).toBeGreaterThanOrEqual(1);
    });

    it('builds events from reviewer votes', async () => {
      mockGetPullRequests.mockResolvedValue([sampleAzdoPR]);
      mockGetPullRequestThreads.mockResolvedValue([]);
      mockGetPullRequestIterations.mockResolvedValue([]);
      mockGetPullRequestReviewers.mockResolvedValue(sampleReviewers);

      const traces = await fetcher.fetchPRs('project', 'repo');
      const approvalEvents = traces[0].events.filter((e) => e.type === 'approved');
      expect(approvalEvents).toHaveLength(1);
      expect(approvalEvents[0].author).toBe('Carol');
    });

    it('strips refs/heads/ from branch names', async () => {
      mockGetPullRequests.mockResolvedValue([sampleAzdoPR]);
      mockGetPullRequestThreads.mockResolvedValue([]);
      mockGetPullRequestIterations.mockResolvedValue([]);
      mockGetPullRequestReviewers.mockResolvedValue([]);

      const traces = await fetcher.fetchPRs('project', 'repo');
      expect(traces[0].sourceBranch).toBe('fix/login');
      expect(traces[0].targetBranch).toBe('main');
    });

    it('handles empty PR list', async () => {
      mockGetPullRequests.mockResolvedValue([]);
      const traces = await fetcher.fetchPRs('project', 'repo');
      expect(traces).toEqual([]);
    });

    it('populates reviewers list', async () => {
      mockGetPullRequests.mockResolvedValue([sampleAzdoPR]);
      mockGetPullRequestThreads.mockResolvedValue([]);
      mockGetPullRequestIterations.mockResolvedValue([]);
      mockGetPullRequestReviewers.mockResolvedValue(sampleReviewers);

      const traces = await fetcher.fetchPRs('project', 'repo');
      expect(traces[0].reviewers).toContain('Carol');
      expect(traces[0].reviewers).toContain('Dave');
    });
  });
});
