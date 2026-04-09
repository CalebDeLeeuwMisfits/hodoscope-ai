import { describe, it, expect } from 'vitest';
import {
  extractFeatures,
  computePCA,
  computeTSNE,
  normalizeFeatures,
  pairwiseDistances,
} from './projection';
import type { PRTrace, TraceEvent } from './types';

// --- Fixtures ---

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

// --- Tests ---

describe('extractFeatures', () => {
  it('returns a numeric feature vector for a PRTrace', () => {
    const trace = makeTrace();
    const features = extractFeatures(trace);

    expect(Array.isArray(features)).toBe(true);
    expect(features.length).toBeGreaterThan(0);
    expect(features.every((f) => typeof f === 'number' && Number.isFinite(f))).toBe(true);
  });

  it('captures event count', () => {
    const traceA = makeTrace({ events: [makeEvent()] });
    const traceB = makeTrace({
      events: [makeEvent(), makeEvent({ id: 'e2' }), makeEvent({ id: 'e3' })],
    });
    const featA = extractFeatures(traceA);
    const featB = extractFeatures(traceB);

    // Feature vectors should differ since event counts differ
    expect(featA).not.toEqual(featB);
  });

  it('captures code size (additions + deletions)', () => {
    const traceSmall = makeTrace({ additions: 5, deletions: 2 });
    const traceLarge = makeTrace({ additions: 500, deletions: 200 });
    const featSmall = extractFeatures(traceSmall);
    const featLarge = extractFeatures(traceLarge);

    expect(featSmall).not.toEqual(featLarge);
  });

  it('captures PR duration', () => {
    const traceQuick = makeTrace({
      createdAt: '2026-01-15T10:00:00Z',
      updatedAt: '2026-01-15T11:00:00Z',
    });
    const traceSlow = makeTrace({
      createdAt: '2026-01-15T10:00:00Z',
      updatedAt: '2026-01-25T10:00:00Z',
    });
    expect(extractFeatures(traceQuick)).not.toEqual(extractFeatures(traceSlow));
  });

  it('captures status as numeric flags', () => {
    const merged = makeTrace({ status: 'merged' });
    const open = makeTrace({ status: 'open' });
    expect(extractFeatures(merged)).not.toEqual(extractFeatures(open));
  });

  it('sets repo_created flag at index 19', () => {
    const trace = makeTrace({ status: 'repo_created' });
    const features = extractFeatures(trace);
    expect(features[19]).toBe(1);
    // Other status flags should be 0
    expect(features[12]).toBe(0); // merged
    expect(features[13]).toBe(0); // open
    expect(features[14]).toBe(0); // closed
    expect(features[15]).toBe(0); // draft
    expect(features[18]).toBe(0); // deferred
  });

  it('repo_created flag is 0 for non-repo_created statuses', () => {
    const features = extractFeatures(makeTrace({ status: 'merged' }));
    expect(features[19]).toBe(0);
  });

  it('returns consistent vector length across different traces', () => {
    const traces = [
      makeTrace({ id: 'pr-1' }),
      makeTrace({ id: 'pr-2', events: [], additions: 0, deletions: 0 }),
      makeTrace({ id: 'pr-3', labels: ['a', 'b', 'c'], reviewers: ['x', 'y'] }),
    ];
    const lengths = traces.map((t) => extractFeatures(t).length);
    expect(new Set(lengths).size).toBe(1); // all same length
  });

  it('returns 20-element feature vector', () => {
    const features = extractFeatures(makeTrace());
    expect(features).toHaveLength(20);
  });

  it('sets provider flags correctly for github', () => {
    const features = extractFeatures(makeTrace({ provider: 'github' }));
    expect(features[16]).toBe(1); // isGitHub
    expect(features[17]).toBe(0); // isAzDO
  });

  it('sets provider flags correctly for azure-devops', () => {
    const features = extractFeatures(makeTrace({ provider: 'azure-devops' }));
    expect(features[16]).toBe(0); // isGitHub
    expect(features[17]).toBe(1); // isAzDO
  });

  it('sets provider flags correctly for wrike', () => {
    const features = extractFeatures(makeTrace({ provider: 'wrike' }));
    expect(features[16]).toBe(0); // isGitHub
    expect(features[17]).toBe(0); // isAzDO
  });

  it('sets deferred status flag', () => {
    const features = extractFeatures(makeTrace({ status: 'deferred' }));
    expect(features[18]).toBe(1); // isDeferred
  });

  it('deferred flag is 0 for non-deferred statuses', () => {
    const features = extractFeatures(makeTrace({ status: 'merged' }));
    expect(features[18]).toBe(0);
  });
});

describe('normalizeFeatures', () => {
  it('normalizes each feature to 0-1 range', () => {
    const matrix = [
      [0, 10, 100],
      [5, 20, 200],
      [10, 30, 300],
    ];
    const normalized = normalizeFeatures(matrix);

    // Each column should have min=0, max=1
    for (let col = 0; col < 3; col++) {
      const vals = normalized.map((row) => row[col]);
      expect(Math.min(...vals)).toBeCloseTo(0);
      expect(Math.max(...vals)).toBeCloseTo(1);
    }
  });

  it('handles constant columns (all same value)', () => {
    const matrix = [
      [5, 10],
      [5, 20],
      [5, 30],
    ];
    const normalized = normalizeFeatures(matrix);
    // Constant column should become all 0
    expect(normalized.every((row) => row[0] === 0)).toBe(true);
  });

  it('handles single row', () => {
    const matrix = [[1, 2, 3]];
    const normalized = normalizeFeatures(matrix);
    expect(normalized).toEqual([[0, 0, 0]]);
  });
});

describe('pairwiseDistances', () => {
  it('computes euclidean distance matrix', () => {
    const points = [
      [0, 0],
      [3, 4],
      [0, 0],
    ];
    const D = pairwiseDistances(points);

    expect(D[0][0]).toBe(0);
    expect(D[0][1]).toBeCloseTo(5); // 3-4-5 triangle
    expect(D[0][2]).toBe(0);
    expect(D[1][0]).toBeCloseTo(5);
  });

  it('produces symmetric matrix', () => {
    const points = [
      [1, 2],
      [3, 4],
      [5, 6],
    ];
    const D = pairwiseDistances(points);
    for (let i = 0; i < 3; i++) {
      for (let j = 0; j < 3; j++) {
        expect(D[i][j]).toBeCloseTo(D[j][i]);
      }
    }
  });
});

describe('computePCA', () => {
  it('projects N points to 2D', () => {
    const data = [
      [1, 0, 0, 0],
      [0, 1, 0, 0],
      [0, 0, 1, 0],
      [0, 0, 0, 1],
      [1, 1, 0, 0],
    ];
    const result = computePCA(data);

    expect(result).toHaveLength(5);
    result.forEach((point) => {
      expect(point).toHaveLength(2);
      expect(Number.isFinite(point[0])).toBe(true);
      expect(Number.isFinite(point[1])).toBe(true);
    });
  });

  it('preserves relative distances roughly', () => {
    // Points that are close in high-D should be close in 2D
    const data = [
      [0, 0, 0],
      [0.1, 0.1, 0.1],
      [10, 10, 10],
      [10.1, 10.1, 10.1],
    ];
    const result = computePCA(data);

    // Distance between first two should be much less than between first and third
    const d01 = Math.hypot(result[0][0] - result[1][0], result[0][1] - result[1][1]);
    const d02 = Math.hypot(result[0][0] - result[2][0], result[0][1] - result[2][1]);
    expect(d01).toBeLessThan(d02);
  });

  it('handles 2 points', () => {
    const data = [
      [1, 2, 3],
      [4, 5, 6],
    ];
    const result = computePCA(data);
    expect(result).toHaveLength(2);
  });
});

describe('computeTSNE', () => {
  it('projects N points to 2D', () => {
    const data = [
      [1, 0, 0],
      [0, 1, 0],
      [0, 0, 1],
      [1, 1, 0],
      [0, 1, 1],
    ];
    const result = computeTSNE(data, { perplexity: 2, maxIter: 50 });

    expect(result).toHaveLength(5);
    result.forEach((point) => {
      expect(point).toHaveLength(2);
      expect(Number.isFinite(point[0])).toBe(true);
      expect(Number.isFinite(point[1])).toBe(true);
    });
  });

  it('clusters similar points together', () => {
    // Two distinct clusters
    const data = [
      [0, 0, 0],
      [0.1, 0, 0],
      [0, 0.1, 0],
      [10, 10, 10],
      [10.1, 10, 10],
      [10, 10.1, 10],
    ];
    const result = computeTSNE(data, { perplexity: 2, maxIter: 200 });

    // Centroid of cluster A (indices 0-2) and cluster B (indices 3-5)
    const cA = [
      (result[0][0] + result[1][0] + result[2][0]) / 3,
      (result[0][1] + result[1][1] + result[2][1]) / 3,
    ];
    const cB = [
      (result[3][0] + result[4][0] + result[5][0]) / 3,
      (result[3][1] + result[4][1] + result[5][1]) / 3,
    ];

    // Intra-cluster distance should be less than inter-cluster distance
    const intraA = Math.hypot(result[0][0] - result[1][0], result[0][1] - result[1][1]);
    const inter = Math.hypot(cA[0] - cB[0], cA[1] - cB[1]);
    expect(intraA).toBeLessThan(inter);
  });

  it('handles small N gracefully (falls back to PCA)', () => {
    const data = [
      [1, 2],
      [3, 4],
    ];
    const result = computeTSNE(data, { perplexity: 1, maxIter: 50 });
    expect(result).toHaveLength(2);
  });

  it('respects maxIter parameter (terminates)', () => {
    const data = Array.from({ length: 20 }, (_, i) => [Math.random(), Math.random(), Math.random()]);
    const start = Date.now();
    computeTSNE(data, { perplexity: 5, maxIter: 10 });
    const elapsed = Date.now() - start;
    expect(elapsed).toBeLessThan(5000); // should be fast
  });
});
