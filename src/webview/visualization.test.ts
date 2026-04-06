// NOTE: Particle trace view tests — deep-dive panel tests live in scatter-visualization.test.ts
import { describe, it, expect } from 'vitest';
import { generateWebviewHTML } from './visualization';
import type { TracePath, TraceStats } from '../models/types';
import { buildTracePath } from '../models/trace-builder';
import type { PRTrace, TraceEvent } from '../models/types';

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
      makeEvent({ id: 'e2', type: 'commit', timestamp: '2026-01-15T12:00:00Z' }),
      makeEvent({ id: 'e3', type: 'approved', timestamp: '2026-01-16T15:00:00Z', author: 'bob' }),
      makeEvent({ id: 'e4', type: 'merged', timestamp: '2026-01-17T14:00:00Z' }),
    ],
    labels: ['feature'],
    reviewers: ['bob'],
    additions: 150,
    deletions: 20,
    changedFiles: 5,
    ...overrides,
  };
}

const sampleStats: TraceStats = {
  totalPRs: 3,
  openPRs: 1,
  mergedPRs: 1,
  closedPRs: 1,
  totalEvents: 12,
  uniqueAuthors: 2,
  avgEventsPerPR: 4,
  dateRange: { start: '2026-01-01', end: '2026-01-31' },
  topAuthors: [{ author: 'alice', count: 2 }, { author: 'bob', count: 1 }],
};

describe('generateWebviewHTML', () => {
  it('returns valid HTML string', () => {
    const paths = [buildTracePath(makeTrace())];
    const html = generateWebviewHTML(paths, sampleStats, 'test-nonce', 'https://cdn');

    expect(html).toContain('<!DOCTYPE html>');
    expect(html).toContain('</html>');
  });

  it('includes CSP meta tag with nonce', () => {
    const paths = [buildTracePath(makeTrace())];
    const html = generateWebviewHTML(paths, sampleStats, 'abc123', 'https://cdn');

    expect(html).toContain("nonce-abc123");
  });

  it('embeds trace data as JSON', () => {
    const paths = [buildTracePath(makeTrace())];
    const html = generateWebviewHTML(paths, sampleStats, 'nonce', 'https://cdn');

    expect(html).toContain('window.__HODOSCOPE_DATA__');
    expect(html).toContain('"traceId":"pr-1"');
  });

  it('embeds stats data', () => {
    const paths = [buildTracePath(makeTrace())];
    const html = generateWebviewHTML(paths, sampleStats, 'nonce', 'https://cdn');

    expect(html).toContain('window.__HODOSCOPE_STATS__');
    expect(html).toContain('"totalPRs":3');
  });

  it('includes canvas element for rendering', () => {
    const paths = [buildTracePath(makeTrace())];
    const html = generateWebviewHTML(paths, sampleStats, 'nonce', 'https://cdn');

    expect(html).toContain('<canvas');
    expect(html).toContain('id="hodoscope-canvas"');
  });

  it('includes stats dashboard panel', () => {
    const paths = [buildTracePath(makeTrace())];
    const html = generateWebviewHTML(paths, sampleStats, 'nonce', 'https://cdn');

    expect(html).toContain('stats-panel');
    expect(html).toContain('Total PRs');
  });

  it('includes filter controls', () => {
    const paths = [buildTracePath(makeTrace())];
    const html = generateWebviewHTML(paths, sampleStats, 'nonce', 'https://cdn');

    expect(html).toContain('filter');
    expect(html).toContain('search');
  });

  it('includes legend', () => {
    const paths = [
      buildTracePath(makeTrace({ id: 'pr-1', author: 'alice' })),
      buildTracePath(makeTrace({ id: 'pr-2', author: 'bob' })),
    ];
    const html = generateWebviewHTML(paths, sampleStats, 'nonce', 'https://cdn');

    expect(html).toContain('legend');
  });

  it('handles empty traces gracefully', () => {
    const emptyStats: TraceStats = {
      ...sampleStats,
      totalPRs: 0,
      openPRs: 0,
      mergedPRs: 0,
      closedPRs: 0,
    };
    const html = generateWebviewHTML([], emptyStats, 'nonce', 'https://cdn');

    expect(html).toContain('<!DOCTYPE html>');
    expect(html).toContain('No PR traces');
  });

  it('includes animation/particle trail rendering code', () => {
    const paths = [buildTracePath(makeTrace())];
    const html = generateWebviewHTML(paths, sampleStats, 'nonce', 'https://cdn');

    expect(html).toContain('requestAnimationFrame');
    expect(html).toContain('particle');
  });

  it('includes hover tooltip functionality', () => {
    const paths = [buildTracePath(makeTrace())];
    const html = generateWebviewHTML(paths, sampleStats, 'nonce', 'https://cdn');

    expect(html).toContain('tooltip');
    expect(html).toContain('mousemove');
  });

  it('works without external CDN resources (self-contained)', () => {
    const paths = [buildTracePath(makeTrace())];
    const html = generateWebviewHTML(paths, sampleStats, 'nonce', 'https://cdn');

    // Should NOT require external script loads — all rendering is inline Canvas
    // D3 or any lib should be bundled, not CDN-loaded
    expect(html).not.toContain('src="https://cdn');
  });
});
