// NOTE: Trace stats (event counts, durations) are displayed in the deep-dive detail panel
import { describe, it, expect } from 'vitest';
import {
  buildTracePath,
  groupTraces,
  computeTraceStats,
  filterTraces,
  sortEventsByTime,
  assignTraceColors,
} from './trace-builder';
import type { PRTrace, TraceEvent, TraceFilter, TracePath } from './types';

// --- Test Fixtures ---

function makeEvent(overrides: Partial<TraceEvent> = {}): TraceEvent {
  return {
    id: 'evt-1',
    type: 'created',
    timestamp: '2026-01-15T10:00:00Z',
    author: 'alice',
    description: 'PR created',
    ...overrides,
  };
}

function makeTrace(overrides: Partial<PRTrace> = {}): PRTrace {
  return {
    id: 'pr-1',
    provider: 'github',
    repoFullName: 'org/repo',
    prNumber: 42,
    title: 'Add feature X',
    description: 'Implements feature X',
    author: 'alice',
    status: 'merged',
    sourceBranch: 'feature/x',
    targetBranch: 'main',
    createdAt: '2026-01-15T10:00:00Z',
    updatedAt: '2026-01-17T14:00:00Z',
    mergedAt: '2026-01-17T14:00:00Z',
    url: 'https://github.com/org/repo/pull/42',
    events: [
      makeEvent({ id: 'e1', type: 'created', timestamp: '2026-01-15T10:00:00Z' }),
      makeEvent({ id: 'e2', type: 'commit', timestamp: '2026-01-15T12:00:00Z', description: 'Initial impl' }),
      makeEvent({ id: 'e3', type: 'review_submitted', timestamp: '2026-01-16T09:00:00Z', author: 'bob' }),
      makeEvent({ id: 'e4', type: 'approved', timestamp: '2026-01-16T15:00:00Z', author: 'bob' }),
      makeEvent({ id: 'e5', type: 'merged', timestamp: '2026-01-17T14:00:00Z' }),
    ],
    labels: ['feature', 'ready'],
    reviewers: ['bob'],
    additions: 150,
    deletions: 20,
    changedFiles: 5,
    ...overrides,
  };
}

// --- Tests ---

describe('sortEventsByTime', () => {
  it('sorts events chronologically', () => {
    const events: TraceEvent[] = [
      makeEvent({ id: 'e3', timestamp: '2026-01-17T00:00:00Z' }),
      makeEvent({ id: 'e1', timestamp: '2026-01-15T00:00:00Z' }),
      makeEvent({ id: 'e2', timestamp: '2026-01-16T00:00:00Z' }),
    ];
    const sorted = sortEventsByTime(events);
    expect(sorted.map((e) => e.id)).toEqual(['e1', 'e2', 'e3']);
  });

  it('returns empty array for empty input', () => {
    expect(sortEventsByTime([])).toEqual([]);
  });

  it('does not mutate original array', () => {
    const events: TraceEvent[] = [
      makeEvent({ id: 'e2', timestamp: '2026-01-16T00:00:00Z' }),
      makeEvent({ id: 'e1', timestamp: '2026-01-15T00:00:00Z' }),
    ];
    const original = [...events];
    sortEventsByTime(events);
    expect(events[0].id).toBe(original[0].id);
  });
});

describe('buildTracePath', () => {
  it('converts a PRTrace into a TracePath with ordered points', () => {
    const trace = makeTrace();
    const path = buildTracePath(trace);

    expect(path.traceId).toBe('pr-1');
    expect(path.prNumber).toBe(42);
    expect(path.author).toBe('alice');
    expect(path.status).toBe('merged');
    expect(path.points).toHaveLength(5);
    expect(path.sourceBranch).toBe('feature/x');
    expect(path.targetBranch).toBe('main');
  });

  it('assigns x positions based on time progression', () => {
    const trace = makeTrace();
    const path = buildTracePath(trace);
    // Points should have increasing x values
    for (let i = 1; i < path.points.length; i++) {
      expect(path.points[i].x).toBeGreaterThan(path.points[i - 1].x);
    }
  });

  it('assigns y positions based on event type (layered detector model)', () => {
    const trace = makeTrace();
    const path = buildTracePath(trace);
    // Each point should have a defined y
    path.points.forEach((p) => {
      expect(typeof p.y).toBe('number');
      expect(Number.isFinite(p.y)).toBe(true);
    });
  });

  it('populates trace point metadata', () => {
    const trace = makeTrace();
    const path = buildTracePath(trace);
    const firstPoint = path.points[0];

    expect(firstPoint.type).toBe('created');
    expect(firstPoint.author).toBe('alice');
    expect(firstPoint.prTitle).toBe('Add feature X');
    expect(firstPoint.prNumber).toBe(42);
    expect(firstPoint.provider).toBe('github');
  });

  it('handles PR with single event', () => {
    const trace = makeTrace({
      events: [makeEvent({ id: 'e1', type: 'created' })],
    });
    const path = buildTracePath(trace);
    expect(path.points).toHaveLength(1);
  });

  it('handles PR with no events gracefully', () => {
    const trace = makeTrace({ events: [] });
    const path = buildTracePath(trace);
    expect(path.points).toHaveLength(0);
  });
});

describe('assignTraceColors', () => {
  it('assigns unique colors to different authors', () => {
    const paths: TracePath[] = [
      buildTracePath(makeTrace({ id: 'pr-1', author: 'alice' })),
      buildTracePath(makeTrace({ id: 'pr-2', author: 'bob' })),
      buildTracePath(makeTrace({ id: 'pr-3', author: 'charlie' })),
    ];
    const colored = assignTraceColors(paths, 'author');
    const colors = new Set(colored.map((p) => p.color));
    expect(colors.size).toBe(3);
  });

  it('assigns same color to same author', () => {
    const paths: TracePath[] = [
      buildTracePath(makeTrace({ id: 'pr-1', author: 'alice' })),
      buildTracePath(makeTrace({ id: 'pr-2', author: 'alice' })),
    ];
    const colored = assignTraceColors(paths, 'author');
    expect(colored[0].color).toBe(colored[1].color);
  });

  it('can color by status', () => {
    const paths: TracePath[] = [
      buildTracePath(makeTrace({ id: 'pr-1', status: 'merged' })),
      buildTracePath(makeTrace({ id: 'pr-2', status: 'open' })),
      buildTracePath(makeTrace({ id: 'pr-3', status: 'closed' })),
    ];
    const colored = assignTraceColors(paths, 'status');
    const colors = new Set(colored.map((p) => p.color));
    expect(colors.size).toBe(3);
  });

  it('can color by provider', () => {
    const paths: TracePath[] = [
      buildTracePath(makeTrace({ id: 'pr-1', provider: 'github' })),
      buildTracePath(makeTrace({ id: 'pr-2', provider: 'azure-devops' })),
    ];
    const colored = assignTraceColors(paths, 'provider');
    expect(colored[0].color).not.toBe(colored[1].color);
  });
});

describe('groupTraces', () => {
  it('groups by author', () => {
    const paths: TracePath[] = [
      buildTracePath(makeTrace({ id: 'pr-1', author: 'alice' })),
      buildTracePath(makeTrace({ id: 'pr-2', author: 'bob' })),
      buildTracePath(makeTrace({ id: 'pr-3', author: 'alice' })),
    ];
    const groups = groupTraces(paths, 'author');
    expect(Object.keys(groups)).toContain('alice');
    expect(Object.keys(groups)).toContain('bob');
    expect(groups['alice']).toHaveLength(2);
    expect(groups['bob']).toHaveLength(1);
  });

  it('groups by status', () => {
    const paths: TracePath[] = [
      buildTracePath(makeTrace({ id: 'pr-1', status: 'merged' })),
      buildTracePath(makeTrace({ id: 'pr-2', status: 'open' })),
      buildTracePath(makeTrace({ id: 'pr-3', status: 'merged' })),
    ];
    const groups = groupTraces(paths, 'status');
    expect(groups['merged']).toHaveLength(2);
    expect(groups['open']).toHaveLength(1);
  });

  it('groups by provider', () => {
    const paths: TracePath[] = [
      buildTracePath(makeTrace({ id: 'pr-1', provider: 'github' })),
      buildTracePath(makeTrace({ id: 'pr-2', provider: 'azure-devops' })),
    ];
    const groups = groupTraces(paths, 'provider');
    expect(Object.keys(groups).sort()).toEqual(['azure-devops', 'github']);
  });

  it('groups by targetBranch', () => {
    const paths: TracePath[] = [
      buildTracePath(makeTrace({ id: 'pr-1', targetBranch: 'main' })),
      buildTracePath(makeTrace({ id: 'pr-2', targetBranch: 'develop' })),
      buildTracePath(makeTrace({ id: 'pr-3', targetBranch: 'main' })),
    ];
    const groups = groupTraces(paths, 'targetBranch');
    expect(groups['main']).toHaveLength(2);
    expect(groups['develop']).toHaveLength(1);
  });
});

describe('filterTraces', () => {
  const traces: PRTrace[] = [
    makeTrace({ id: 'pr-1', author: 'alice', status: 'merged', labels: ['bug'] }),
    makeTrace({ id: 'pr-2', author: 'bob', status: 'open', labels: ['feature'], provider: 'azure-devops' }),
    makeTrace({ id: 'pr-3', author: 'alice', status: 'closed', labels: ['feature', 'urgent'] }),
  ];

  it('filters by author', () => {
    const filter: TraceFilter = { authors: ['alice'] };
    const result = filterTraces(traces, filter);
    expect(result).toHaveLength(2);
    expect(result.every((t) => t.author === 'alice')).toBe(true);
  });

  it('filters by status', () => {
    const filter: TraceFilter = { statuses: ['merged', 'closed'] };
    const result = filterTraces(traces, filter);
    expect(result).toHaveLength(2);
  });

  it('filters by provider', () => {
    const filter: TraceFilter = { providers: ['azure-devops'] };
    const result = filterTraces(traces, filter);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('pr-2');
  });

  it('filters by label', () => {
    const filter: TraceFilter = { labels: ['feature'] };
    const result = filterTraces(traces, filter);
    expect(result).toHaveLength(2);
  });

  it('filters by date range', () => {
    const filter: TraceFilter = {
      dateRange: { start: '2026-01-15T00:00:00Z', end: '2026-01-15T23:59:59Z' },
    };
    const result = filterTraces(traces, filter);
    expect(result).toHaveLength(3); // all created on Jan 15
  });

  it('filters by search text (title match)', () => {
    const filter: TraceFilter = { searchText: 'feature X' };
    const result = filterTraces(traces, filter);
    expect(result).toHaveLength(3); // all have "Add feature X"
  });

  it('combines multiple filters with AND logic', () => {
    const filter: TraceFilter = { authors: ['alice'], statuses: ['merged'] };
    const result = filterTraces(traces, filter);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('pr-1');
  });

  it('returns all traces with empty filter', () => {
    const result = filterTraces(traces, {});
    expect(result).toHaveLength(3);
  });
});

describe('computeTraceStats', () => {
  it('computes correct statistics', () => {
    const traces: PRTrace[] = [
      makeTrace({ id: 'pr-1', author: 'alice', status: 'merged' }),
      makeTrace({ id: 'pr-2', author: 'bob', status: 'open', events: [makeEvent()] }),
      makeTrace({ id: 'pr-3', author: 'alice', status: 'closed', events: [makeEvent(), makeEvent({ id: 'e2' })] }),
    ];
    const stats = computeTraceStats(traces);

    expect(stats.totalPRs).toBe(3);
    expect(stats.openPRs).toBe(1);
    expect(stats.mergedPRs).toBe(1);
    expect(stats.closedPRs).toBe(1);
    expect(stats.uniqueAuthors).toBe(2);
    expect(stats.totalEvents).toBe(8); // 5 + 1 + 2
    expect(stats.avgEventsPerPR).toBeCloseTo(8 / 3);
  });

  it('computes top authors sorted by count', () => {
    const traces: PRTrace[] = [
      makeTrace({ id: 'pr-1', author: 'alice' }),
      makeTrace({ id: 'pr-2', author: 'alice' }),
      makeTrace({ id: 'pr-3', author: 'bob' }),
      makeTrace({ id: 'pr-4', author: 'alice' }),
      makeTrace({ id: 'pr-5', author: 'charlie' }),
    ];
    const stats = computeTraceStats(traces);
    expect(stats.topAuthors[0]).toEqual({ author: 'alice', count: 3 });
    expect(stats.topAuthors[1]).toEqual({ author: 'bob', count: 1 });
  });

  it('handles empty traces', () => {
    const stats = computeTraceStats([]);
    expect(stats.totalPRs).toBe(0);
    expect(stats.uniqueAuthors).toBe(0);
    expect(stats.avgEventsPerPR).toBe(0);
    expect(stats.repoCreatedCount).toBe(0);
  });

  it('counts repo_created traces separately', () => {
    const traces: PRTrace[] = [
      makeTrace({ id: 'pr-1', status: 'merged' }),
      makeTrace({ id: 'pr-2', status: 'open' }),
      makeTrace({ id: 'repo-1', status: 'repo_created', prNumber: 0 }),
    ];
    const stats = computeTraceStats(traces);
    expect(stats.totalPRs).toBe(3);
    expect(stats.repoCreatedCount).toBe(1);
    expect(stats.openPRs).toBe(1);
    expect(stats.mergedPRs).toBe(1);
    expect(stats.closedPRs).toBe(0);
  });

  it('computes date range from trace timestamps', () => {
    const traces: PRTrace[] = [
      makeTrace({ id: 'pr-1', createdAt: '2026-01-10T00:00:00Z', updatedAt: '2026-01-20T00:00:00Z' }),
      makeTrace({ id: 'pr-2', createdAt: '2026-01-05T00:00:00Z', updatedAt: '2026-01-25T00:00:00Z' }),
    ];
    const stats = computeTraceStats(traces);
    expect(stats.dateRange.start).toBe('2026-01-05T00:00:00Z');
    expect(stats.dateRange.end).toBe('2026-01-25T00:00:00Z');
  });
});
