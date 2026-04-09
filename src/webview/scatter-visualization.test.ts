import { describe, it, expect } from 'vitest';
import { generateScatterHTML } from './scatter-visualization';
import type { ScatterPoint } from './scatter-visualization';
import type { TraceStats } from '../models/types';

function makePoint(overrides: Partial<ScatterPoint> = {}): ScatterPoint {
  return {
    id: 'pt-1', x: 0, y: 0, prNumber: 42, title: 'Test PR',
    author: 'alice', status: 'merged', provider: 'github',
    repoName: 'my-repo', sourceBranch: 'feature', targetBranch: 'main',
    url: 'https://github.com/org/repo/pull/42', eventCount: 4,
    additions: 100, deletions: 20, changedFiles: 5,
    createdAt: '2026-01-15T10:00:00Z', labels: [], reviewers: ['bob'],
    ...overrides,
  };
}

const stats: TraceStats = {
  totalPRs: 1, openPRs: 0, mergedPRs: 1, closedPRs: 0,
  totalEvents: 4, uniqueAuthors: 1, avgEventsPerPR: 4,
  dateRange: { start: '2026-01-01', end: '2026-01-31' },
  topAuthors: [{ author: 'alice', count: 1 }],
};

describe('generateScatterHTML — Wrike adaptations', () => {
  it('includes deferred color in statusColors', () => {
    const html = generateScatterHTML([makePoint({ status: 'deferred' })], stats, 'n', '');
    expect(html).toContain('deferred');
    expect(html).toContain('#FFA15A');
  });

  it('shows "Open in Wrike" for wrike provider', () => {
    const html = generateScatterHTML([makePoint({ provider: 'wrike' })], stats, 'n', '');
    expect(html).toContain('Wrike');
  });

  it('shows Task instead of PR # for wrike items in tooltip', () => {
    const html = generateScatterHTML([makePoint({ provider: 'wrike' })], stats, 'n', '');
    // The tooltip/detail should say "Task" not "PR #" for wrike
    expect(html).toContain("'Task '");
  });

  it('shows Project instead of Branch for wrike items', () => {
    const html = generateScatterHTML([makePoint({ provider: 'wrike' })], stats, 'n', '');
    expect(html).toContain('Project');
  });
});
