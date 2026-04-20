import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AzureDevOpsFetcher } from './azure-devops';

// NOTE: Fetched PR data (description, dates) now feeds into the deep-dive detail panel

// Mock the azure-devops-node-api
const mockGetPullRequests = vi.fn();
const mockGetPullRequestThreads = vi.fn();
const mockGetPullRequestIterations = vi.fn();
const mockGetPullRequestReviewers = vi.fn();
const mockGetRepository = vi.fn();
const mockQueryByWiql = vi.fn();
const mockGetRevisions = vi.fn();

vi.mock('azure-devops-node-api', () => ({
  WebApi: vi.fn(() => ({
    getGitApi: vi.fn(() => ({
      getPullRequests: mockGetPullRequests,
      getThreads: mockGetPullRequestThreads,
      getPullRequestIterations: mockGetPullRequestIterations,
      getPullRequestReviewers: mockGetPullRequestReviewers,
      getRepository: mockGetRepository,
    })),
    getWorkItemTrackingApi: vi.fn(() => ({
      queryByWiql: mockQueryByWiql,
      getRevisions: mockGetRevisions,
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
    mockGetRepository.mockResolvedValue({
      name: 'repo',
      project: { name: 'project' },
      dateCreated: new Date('2021-03-01T00:00:00Z'),
      createdBy: { displayName: 'admin', uniqueName: 'admin@company.com' },
      webUrl: 'https://dev.azure.com/myorg/project/_git/repo',
    });
    fetcher = new AzureDevOpsFetcher('https://dev.azure.com/myorg', 'fake-token');
  });

  describe('fetchPRs', () => {
    it('fetches PRs from Azure DevOps and returns PRTrace array', async () => {
      mockGetPullRequests.mockResolvedValue([sampleAzdoPR]);
      mockGetPullRequestThreads.mockResolvedValue(sampleThreads);
      mockGetPullRequestIterations.mockResolvedValue(sampleIterations);
      mockGetPullRequestReviewers.mockResolvedValue(sampleReviewers);

      const traces = await fetcher.fetchPRs('project', 'repo');
      const prTraces = traces.filter(t => t.status !== 'repo_created');

      expect(prTraces).toHaveLength(1);
      const trace = prTraces[0];
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
      const prTraces = traces.filter(t => t.status !== 'repo_created');
      expect(prTraces).toEqual([]);
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

    it('includes a synthetic repo_created trace', async () => {
      mockGetPullRequests.mockResolvedValue([sampleAzdoPR]);
      mockGetPullRequestThreads.mockResolvedValue(sampleThreads);
      mockGetPullRequestIterations.mockResolvedValue(sampleIterations);
      mockGetPullRequestReviewers.mockResolvedValue(sampleReviewers);

      const traces = await fetcher.fetchPRs('project', 'repo');
      const repoTrace = traces.find(t => t.status === 'repo_created');
      expect(repoTrace).toBeDefined();
    });

    it('repo_created trace has correct shape for AzDO', async () => {
      mockGetPullRequests.mockResolvedValue([]);

      const traces = await fetcher.fetchPRs('project', 'repo');
      expect(traces).toHaveLength(1);
      const t = traces[0];
      expect(t.status).toBe('repo_created');
      expect(t.provider).toBe('azure-devops');
      expect(t.prNumber).toBe(0);
      expect(t.additions).toBe(0);
      expect(t.deletions).toBe(0);
      expect(t.changedFiles).toBe(0);
      expect(t.events).toHaveLength(1);
      expect(t.events[0].type).toBe('created');
      expect(t.labels).toEqual([]);
      expect(t.reviewers).toEqual([]);
    });

    // Regression: real Azure DevOps API responses often come back with date
    // fields as ISO strings (e.g. after JSON round-trips) rather than Date
    // instances. Calling `.toISOString()` on a string throws TypeError and
    // silently drops every PR in that repo via the outer try/catch.
    it('handles string-typed creationDate/closedDate without throwing', async () => {
      const stringDatedPR = {
        ...sampleAzdoPR,
        creationDate: '2026-02-10T08:00:00Z' as unknown as Date,
        closedDate: '2026-02-12T16:00:00Z' as unknown as Date,
      };
      mockGetPullRequests.mockResolvedValue([stringDatedPR]);
      mockGetPullRequestThreads.mockResolvedValue([]);
      mockGetPullRequestIterations.mockResolvedValue([]);
      mockGetPullRequestReviewers.mockResolvedValue([]);

      const traces = await fetcher.fetchPRs('project', 'repo');
      const prTraces = traces.filter(t => t.status !== 'repo_created');
      expect(prTraces).toHaveLength(1);
      expect(prTraces[0].createdAt).toBe('2026-02-10T08:00:00.000Z');
      expect(prTraces[0].mergedAt).toBe('2026-02-12T16:00:00.000Z');
    });

    it('handles string-typed iteration/thread timestamps without throwing', async () => {
      const stringDatedIterations = [
        {
          id: 1,
          createdDate: '2026-02-10T08:30:00Z' as unknown as Date,
          author: { displayName: 'Bob' },
          description: 'push',
          sourceRefCommit: { commitId: 'abc' },
        },
      ];
      const stringDatedThreads = [
        {
          id: 501,
          publishedDate: '2026-02-11T10:00:00Z' as unknown as Date,
          comments: [{ author: { displayName: 'Carol' }, content: 'lgtm', commentType: 1 }],
        },
      ];
      mockGetPullRequests.mockResolvedValue([sampleAzdoPR]);
      mockGetPullRequestThreads.mockResolvedValue(stringDatedThreads);
      mockGetPullRequestIterations.mockResolvedValue(stringDatedIterations);
      mockGetPullRequestReviewers.mockResolvedValue([]);

      const traces = await fetcher.fetchPRs('project', 'repo');
      const prTraces = traces.filter(t => t.status !== 'repo_created');
      expect(prTraces).toHaveLength(1);
      const commitEvent = prTraces[0].events.find(e => e.type === 'commit');
      expect(commitEvent?.timestamp).toBe('2026-02-10T08:30:00.000Z');
      const commentEvent = prTraces[0].events.find(e => e.type === 'comment');
      expect(commentEvent?.timestamp).toBe('2026-02-11T10:00:00.000Z');
    });

    describe('fetchWorkItems', () => {
      const sampleRevisions = [
        {
          rev: 1,
          fields: {
            'System.Title': 'Build TTS pipeline',
            'System.State': 'New',
            'System.IterationPath': 'Audiotising\\Sprint 1',
            'System.AssignedTo': { displayName: 'Alice' },
            'System.CreatedBy': { displayName: 'Alice' },
            'System.ChangedBy': { displayName: 'Alice' },
            'System.ChangedDate': new Date('2026-03-01T10:00:00Z'),
          },
        },
        {
          rev: 2,
          fields: {
            'System.Title': 'Build TTS pipeline',
            'System.State': 'Active',
            'System.IterationPath': 'Audiotising\\Sprint 1',
            'System.AssignedTo': { displayName: 'Alice' },
            'System.ChangedBy': { displayName: 'Alice' },
            'System.ChangedDate': new Date('2026-03-02T09:00:00Z'),
          },
        },
        {
          rev: 3,
          fields: {
            'System.Title': 'Build TTS pipeline',
            'System.State': 'Closed',
            'System.IterationPath': 'Audiotising\\Sprint 2',
            'System.AssignedTo': { displayName: 'Bob' },
            'System.ChangedBy': { displayName: 'Bob' },
            'System.ChangedDate': new Date('2026-03-04T15:00:00Z'),
          },
        },
      ];

      it('returns work item PRTraces with status work_item', async () => {
        mockQueryByWiql.mockResolvedValue({ workItems: [{ id: 42 }] });
        mockGetRevisions.mockResolvedValue(sampleRevisions);

        const traces = await fetcher.fetchWorkItems('Audiotising');
        expect(traces).toHaveLength(1);
        expect(traces[0].provider).toBe('azure-devops');
        expect(traces[0].status).toBe('work_item');
        expect(traces[0].prNumber).toBe(42);
        expect(traces[0].title).toBe('Build TTS pipeline');
        expect(traces[0].repoFullName).toBe('Audiotising');
        expect(traces[0].author).toBe('Alice');
        expect(traces[0].reviewers).toEqual(['Bob']);
      });

      it('builds state_changed and iteration_moved events from revisions', async () => {
        mockQueryByWiql.mockResolvedValue({ workItems: [{ id: 42 }] });
        mockGetRevisions.mockResolvedValue(sampleRevisions);

        const traces = await fetcher.fetchWorkItems('Audiotising');
        const stateEvents = traces[0].events.filter(e => e.type === 'state_changed');
        const iterEvents = traces[0].events.filter(e => e.type === 'iteration_moved');
        expect(stateEvents).toHaveLength(2);
        expect(iterEvents).toHaveLength(1);
      });

      it('handles string-typed ChangedDate fields without throwing', async () => {
        const stringDated = sampleRevisions.map(r => ({
          ...r,
          fields: {
            ...r.fields,
            'System.ChangedDate': (r.fields['System.ChangedDate'] as Date).toISOString(),
          },
        }));
        mockQueryByWiql.mockResolvedValue({ workItems: [{ id: 42 }] });
        mockGetRevisions.mockResolvedValue(stringDated);

        const traces = await fetcher.fetchWorkItems('Audiotising');
        expect(traces).toHaveLength(1);
        expect(traces[0].createdAt).toBe('2026-03-01T10:00:00.000Z');
        expect(traces[0].updatedAt).toBe('2026-03-04T15:00:00.000Z');
      });

      it('returns empty array when WIQL returns no work items', async () => {
        mockQueryByWiql.mockResolvedValue({ workItems: [] });
        const traces = await fetcher.fetchWorkItems('Audiotising');
        expect(traces).toEqual([]);
      });

      it('skips work items whose getRevisions call fails', async () => {
        mockQueryByWiql.mockResolvedValue({ workItems: [{ id: 1 }, { id: 2 }] });
        mockGetRevisions
          .mockResolvedValueOnce(sampleRevisions)
          .mockRejectedValueOnce(new Error('forbidden'));

        const traces = await fetcher.fetchWorkItems('Audiotising');
        expect(traces).toHaveLength(1);
        expect(traces[0].prNumber).toBe(1);
      });

      it('respects maxItems limit', async () => {
        const ids = Array.from({ length: 10 }, (_, i) => ({ id: i + 1 }));
        mockQueryByWiql.mockResolvedValue({ workItems: ids });
        mockGetRevisions.mockResolvedValue(sampleRevisions);

        const traces = await fetcher.fetchWorkItems('Audiotising', { maxItems: 3 });
        expect(traces).toHaveLength(3);
      });
    });

    it('handles string-typed repository dateCreated without throwing', async () => {
      mockGetRepository.mockResolvedValueOnce({
        name: 'repo',
        project: { name: 'project' },
        dateCreated: '2021-03-01T00:00:00Z',
        createdBy: { displayName: 'admin' },
        webUrl: 'https://dev.azure.com/myorg/project/_git/repo',
      });
      mockGetPullRequests.mockResolvedValue([]);

      const traces = await fetcher.fetchPRs('project', 'repo');
      const repoTrace = traces.find(t => t.status === 'repo_created');
      expect(repoTrace).toBeDefined();
      expect(repoTrace!.createdAt).toBe('2021-03-01T00:00:00.000Z');
    });
  });
});
