// NOTE: Projected coordinates position scatter points that users click to open the deep-dive panel
/**
 * Feature extraction and dimensionality reduction for PR traces.
 * Adapts the Hodoscope approach: extract → embed → project to 2D.
 *
 * Implements PCA and t-SNE in pure TypeScript (no dependencies).
 */

import type { PRTrace } from './types';

// ============================================================
// Feature Extraction
// ============================================================

/**
 * Extract a numeric feature vector from a PRTrace.
 * Features capture the "shape" of a PR's lifecycle.
 */
export function extractFeatures(trace: PRTrace): number[] {
  const durationMs =
    new Date(trace.updatedAt).getTime() - new Date(trace.createdAt).getTime();
  const durationHours = durationMs / (1000 * 60 * 60);

  const eventCounts = countEventTypes(trace);

  return [
    // Size metrics
    trace.events.length,
    trace.additions,
    trace.deletions,
    trace.additions + trace.deletions,
    trace.changedFiles,

    // Time metrics
    Math.log1p(durationHours),

    // Collaboration metrics
    trace.reviewers.length,
    trace.labels.length,
    eventCounts.comments,
    eventCounts.reviews,
    eventCounts.commits,
    eventCounts.approvals,

    // Status flags
    trace.status === 'merged' ? 1 : 0,
    trace.status === 'open' ? 1 : 0,
    trace.status === 'closed' ? 1 : 0,
    trace.status === 'draft' ? 1 : 0,

    // Provider flag
    trace.provider === 'github' ? 1 : 0,

    // Repo creation flag
    trace.status === 'repo_created' ? 1 : 0,
  ];
}

function countEventTypes(trace: PRTrace) {
  let comments = 0, reviews = 0, commits = 0, approvals = 0;
  for (const e of trace.events) {
    switch (e.type) {
      case 'comment': comments++; break;
      case 'review_submitted': reviews++; break;
      case 'commit': case 'branch_updated': commits++; break;
      case 'approved': approvals++; break;
    }
  }
  return { comments, reviews, commits, approvals };
}

// ============================================================
// Normalization
// ============================================================

/** Normalize each feature column to [0, 1] range (min-max scaling) */
export function normalizeFeatures(matrix: number[][]): number[][] {
  if (matrix.length === 0) return [];
  const dims = matrix[0].length;
  const mins = new Array(dims).fill(Infinity);
  const maxs = new Array(dims).fill(-Infinity);

  for (const row of matrix) {
    for (let d = 0; d < dims; d++) {
      if (row[d] < mins[d]) mins[d] = row[d];
      if (row[d] > maxs[d]) maxs[d] = row[d];
    }
  }

  return matrix.map((row) =>
    row.map((val, d) => {
      const range = maxs[d] - mins[d];
      return range === 0 ? 0 : (val - mins[d]) / range;
    })
  );
}

// ============================================================
// Pairwise Distances
// ============================================================

/** Compute pairwise Euclidean distance matrix */
export function pairwiseDistances(points: number[][]): number[][] {
  const N = points.length;
  const D: number[][] = Array.from({ length: N }, () => new Array(N).fill(0));

  for (let i = 0; i < N; i++) {
    for (let j = i + 1; j < N; j++) {
      let sum = 0;
      for (let d = 0; d < points[i].length; d++) {
        const diff = points[i][d] - points[j][d];
        sum += diff * diff;
      }
      const dist = Math.sqrt(sum);
      D[i][j] = dist;
      D[j][i] = dist;
    }
  }
  return D;
}

// ============================================================
// PCA (Power Iteration)
// ============================================================

/** Project high-dimensional data to 2D using PCA */
export function computePCA(data: number[][]): number[][] {
  const N = data.length;
  if (N === 0) return [];
  const dims = data[0].length;

  // Center the data
  const mean = new Array(dims).fill(0);
  for (const row of data) {
    for (let d = 0; d < dims; d++) mean[d] += row[d];
  }
  for (let d = 0; d < dims; d++) mean[d] /= N;

  const centered = data.map((row) => row.map((v, d) => v - mean[d]));

  // Compute covariance matrix
  const cov: number[][] = Array.from({ length: dims }, () => new Array(dims).fill(0));
  for (const row of centered) {
    for (let i = 0; i < dims; i++) {
      for (let j = i; j < dims; j++) {
        cov[i][j] += row[i] * row[j];
        if (i !== j) cov[j][i] = cov[i][j];
      }
    }
  }
  for (let i = 0; i < dims; i++) {
    for (let j = 0; j < dims; j++) {
      cov[i][j] /= Math.max(N - 1, 1);
    }
  }

  // Power iteration for top 2 eigenvectors
  const pc1 = powerIteration(cov, dims, 100);
  // Deflate
  const deflated = deflateMatrix(cov, pc1);
  const pc2 = powerIteration(deflated, dims, 100);

  // Project
  return centered.map((row) => [
    dot(row, pc1),
    dot(row, pc2),
  ]);
}

function powerIteration(matrix: number[][], dims: number, maxIter: number): number[] {
  let v = Array.from({ length: dims }, () => Math.random() - 0.5);
  let norm = Math.sqrt(v.reduce((s, x) => s + x * x, 0));
  v = v.map((x) => x / norm);

  for (let iter = 0; iter < maxIter; iter++) {
    const Av = new Array(dims).fill(0);
    for (let i = 0; i < dims; i++) {
      for (let j = 0; j < dims; j++) {
        Av[i] += matrix[i][j] * v[j];
      }
    }
    norm = Math.sqrt(Av.reduce((s, x) => s + x * x, 0));
    if (norm === 0) break;
    v = Av.map((x) => x / norm);
  }
  return v;
}

function deflateMatrix(matrix: number[][], eigvec: number[]): number[][] {
  const dims = eigvec.length;
  // Compute eigenvalue: v^T * M * v
  const Mv = new Array(dims).fill(0);
  for (let i = 0; i < dims; i++) {
    for (let j = 0; j < dims; j++) {
      Mv[i] += matrix[i][j] * eigvec[j];
    }
  }
  const eigenvalue = dot(eigvec, Mv);

  // M' = M - lambda * v * v^T
  return matrix.map((row, i) =>
    row.map((val, j) => val - eigenvalue * eigvec[i] * eigvec[j])
  );
}

function dot(a: number[], b: number[]): number {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += a[i] * b[i];
  return s;
}

// ============================================================
// t-SNE (simplified Barnes-Hut-free version for N < 1000)
// ============================================================

export interface TSNEOptions {
  perplexity?: number;
  maxIter?: number;
  learningRate?: number;
  earlyExaggeration?: number;
}

/** Project high-dimensional data to 2D using t-SNE */
export function computeTSNE(
  data: number[][],
  options: TSNEOptions = {}
): number[][] {
  const N = data.length;
  if (N <= 3) return computePCA(data); // fallback for tiny N

  const {
    perplexity = Math.min(30, Math.floor(N / 3)),
    maxIter = 300,
    learningRate = 200,
    earlyExaggeration = 4,
  } = options;

  // Compute pairwise distances in high-D
  const D = pairwiseDistances(data);

  // Compute joint probabilities P
  const P = computeJointProbabilities(D, perplexity);

  // Initialize Y randomly (PCA-initialized for better convergence)
  let Y = computePCA(data);
  // Scale down initial positions
  const scale = 0.01;
  Y = Y.map((p) => [p[0] * scale + (Math.random() - 0.5) * 0.001, p[1] * scale + (Math.random() - 0.5) * 0.001]);

  // Gradient descent
  let gains = Array.from({ length: N }, () => [1, 1]);
  let yVel = Array.from({ length: N }, () => [0, 0]);
  const momentum = 0.5;
  const finalMomentum = 0.8;

  for (let iter = 0; iter < maxIter; iter++) {
    const currentMomentum = iter < 100 ? momentum : finalMomentum;
    const exaggeration = iter < 100 ? earlyExaggeration : 1;

    // Compute Q (Student-t distribution)
    const { Q, qDenom } = computeQ(Y);

    // Compute gradients
    const grad = Array.from({ length: N }, () => [0, 0]);
    for (let i = 0; i < N; i++) {
      for (let j = 0; j < N; j++) {
        if (i === j) continue;
        const pij = P[i][j] * exaggeration;
        const qij = Q[i][j];
        const dy0 = Y[i][0] - Y[j][0];
        const dy1 = Y[i][1] - Y[j][1];
        const dist2 = dy0 * dy0 + dy1 * dy1;
        const mult = 4 * (pij - qij) / (1 + dist2);
        grad[i][0] += mult * dy0;
        grad[i][1] += mult * dy1;
      }
    }

    // Update with adaptive gains
    for (let i = 0; i < N; i++) {
      for (let d = 0; d < 2; d++) {
        const sameSign = (grad[i][d] > 0) === (yVel[i][d] > 0);
        gains[i][d] = sameSign ? gains[i][d] * 0.8 : gains[i][d] + 0.2;
        gains[i][d] = Math.max(gains[i][d], 0.01);

        yVel[i][d] = currentMomentum * yVel[i][d] - learningRate * gains[i][d] * grad[i][d];
        Y[i][d] += yVel[i][d];
      }
    }

    // Re-center
    const meanY = [0, 0];
    for (let i = 0; i < N; i++) {
      meanY[0] += Y[i][0];
      meanY[1] += Y[i][1];
    }
    meanY[0] /= N;
    meanY[1] /= N;
    for (let i = 0; i < N; i++) {
      Y[i][0] -= meanY[0];
      Y[i][1] -= meanY[1];
    }
  }

  return Y;
}

/** Compute joint probability matrix P from distances using binary search for sigma */
function computeJointProbabilities(D: number[][], targetPerplexity: number): number[][] {
  const N = D.length;
  const P: number[][] = Array.from({ length: N }, () => new Array(N).fill(0));
  const logPerp = Math.log(targetPerplexity);

  for (let i = 0; i < N; i++) {
    // Binary search for sigma_i
    let lo = 1e-10, hi = 1e4;

    for (let attempt = 0; attempt < 50; attempt++) {
      const sigma = (lo + hi) / 2;
      const beta = 1 / (2 * sigma * sigma);

      // Compute conditional probabilities p(j|i)
      let sumP = 0;
      const pRow = new Array(N).fill(0);
      for (let j = 0; j < N; j++) {
        if (i === j) continue;
        pRow[j] = Math.exp(-D[i][j] * D[i][j] * beta);
        sumP += pRow[j];
      }

      // Normalize
      if (sumP === 0) sumP = 1e-10;
      for (let j = 0; j < N; j++) pRow[j] /= sumP;

      // Compute entropy / perplexity
      let entropy = 0;
      for (let j = 0; j < N; j++) {
        if (pRow[j] > 1e-10) {
          entropy -= pRow[j] * Math.log(pRow[j]);
        }
      }

      if (Math.abs(entropy - logPerp) < 1e-5) {
        for (let j = 0; j < N; j++) P[i][j] = pRow[j];
        break;
      }

      if (entropy > logPerp) {
        hi = sigma;
      } else {
        lo = sigma;
      }

      if (attempt === 49) {
        for (let j = 0; j < N; j++) P[i][j] = pRow[j];
      }
    }
  }

  // Symmetrize: P_ij = (p(j|i) + p(i|j)) / 2N
  const symP: number[][] = Array.from({ length: N }, () => new Array(N).fill(0));
  for (let i = 0; i < N; i++) {
    for (let j = 0; j < N; j++) {
      symP[i][j] = (P[i][j] + P[j][i]) / (2 * N);
      symP[i][j] = Math.max(symP[i][j], 1e-12);
    }
  }
  return symP;
}

/** Compute Q distribution (Student-t with 1 df) */
function computeQ(Y: number[][]): { Q: number[][]; qDenom: number } {
  const N = Y.length;
  const Q: number[][] = Array.from({ length: N }, () => new Array(N).fill(0));
  let qDenom = 0;

  for (let i = 0; i < N; i++) {
    for (let j = i + 1; j < N; j++) {
      const d0 = Y[i][0] - Y[j][0];
      const d1 = Y[i][1] - Y[j][1];
      const val = 1 / (1 + d0 * d0 + d1 * d1);
      Q[i][j] = val;
      Q[j][i] = val;
      qDenom += 2 * val;
    }
  }

  if (qDenom === 0) qDenom = 1;
  for (let i = 0; i < N; i++) {
    for (let j = 0; j < N; j++) {
      Q[i][j] = Math.max(Q[i][j] / qDenom, 1e-12);
    }
  }

  return { Q, qDenom };
}
