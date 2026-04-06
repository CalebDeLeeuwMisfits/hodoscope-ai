// NOTE: Trace colors assigned here are used in the deep-dive panel's change bar visualization
import type {
  PRTrace,
  TraceEvent,
  TracePoint,
  TracePath,
  TraceFilter,
  TraceStats,
  GroupedTraces,
  TraceEventType,
} from './types';

// Hodoscope-inspired color palette — vibrant, high-contrast for dark backgrounds
const TRACE_PALETTE = [
  '#00ff87', // neon green
  '#ff6b6b', // coral red
  '#4ecdc4', // teal
  '#ffd93d', // golden yellow
  '#6c5ce7', // purple
  '#ff9ff3', // pink
  '#54a0ff', // sky blue
  '#ff9f43', // tangerine
  '#00d2d3', // cyan
  '#c8d6e5', // silver
  '#f368e0', // magenta
  '#01a3a4', // dark teal
  '#5f27cd', // deep purple
  '#ee5253', // cherry
  '#10ac84', // emerald
  '#2e86de', // ocean blue
];

/** Y-layer positions for event types — simulates detector layers in a hodoscope */
const EVENT_LAYER: Record<TraceEventType, number> = {
  created: 0,
  commit: 1,
  branch_updated: 1,
  force_pushed: 1.5,
  review_requested: 2,
  comment: 2.5,
  review_submitted: 3,
  changes_requested: 3.5,
  approved: 4,
  ci_passed: 4.5,
  ci_failed: 4.5,
  label_added: 5,
  label_removed: 5,
  merged: 6,
  closed: 6,
  reopened: 0.5,
};

/** Sort events chronologically without mutating the original */
export function sortEventsByTime(events: TraceEvent[]): TraceEvent[] {
  return [...events].sort(
    (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
  );
}

/** Convert a PRTrace into a visualization-ready TracePath */
export function buildTracePath(trace: PRTrace): TracePath {
  const sorted = sortEventsByTime(trace.events);

  const points: TracePoint[] = sorted.map((event, index) => ({
    traceId: trace.id,
    eventId: event.id,
    x: index, // Will be normalized to time-based x in visualization
    y: EVENT_LAYER[event.type] ?? 3,
    timestamp: new Date(event.timestamp).getTime(),
    type: event.type,
    author: event.author,
    prTitle: trace.title,
    prNumber: trace.prNumber,
    status: trace.status,
    provider: trace.provider,
    description: event.description,
  }));

  // Assign time-based x positions (normalized 0..1)
  if (points.length > 1) {
    const tMin = points[0].timestamp;
    const tMax = points[points.length - 1].timestamp;
    const range = tMax - tMin || 1;
    for (const p of points) {
      p.x = (p.timestamp - tMin) / range;
    }
  }

  return {
    traceId: trace.id,
    prNumber: trace.prNumber,
    prTitle: trace.title,
    author: trace.author,
    status: trace.status,
    provider: trace.provider,
    points,
    color: '#00ff87', // default, overridden by assignTraceColors
    sourceBranch: trace.sourceBranch,
    targetBranch: trace.targetBranch,
  };
}

/** Assign colors to trace paths by a grouping key */
export function assignTraceColors(
  paths: TracePath[],
  colorBy: 'author' | 'status' | 'provider' | 'targetBranch'
): TracePath[] {
  const uniqueValues = [...new Set(paths.map((p) => p[colorBy]))];
  const colorMap = new Map<string, string>();
  uniqueValues.forEach((val, i) => {
    colorMap.set(val, TRACE_PALETTE[i % TRACE_PALETTE.length]);
  });

  return paths.map((p) => ({
    ...p,
    color: colorMap.get(p[colorBy]) || TRACE_PALETTE[0],
  }));
}

/** Group trace paths by a field */
export function groupTraces(
  paths: TracePath[],
  groupBy: 'author' | 'status' | 'provider' | 'targetBranch'
): GroupedTraces {
  const groups: GroupedTraces = {};
  for (const path of paths) {
    const key = path[groupBy];
    if (!groups[key]) groups[key] = [];
    groups[key].push(path);
  }
  return groups;
}

/** Filter PRTraces by criteria (AND logic) */
export function filterTraces(traces: PRTrace[], filter: TraceFilter): PRTrace[] {
  return traces.filter((trace) => {
    if (filter.authors?.length && !filter.authors.includes(trace.author)) {
      return false;
    }
    if (filter.statuses?.length && !filter.statuses.includes(trace.status)) {
      return false;
    }
    if (filter.providers?.length && !filter.providers.includes(trace.provider)) {
      return false;
    }
    if (filter.labels?.length && !filter.labels.some((l) => trace.labels.includes(l))) {
      return false;
    }
    if (filter.branches?.length) {
      const branchMatch =
        filter.branches.includes(trace.sourceBranch) ||
        filter.branches.includes(trace.targetBranch);
      if (!branchMatch) return false;
    }
    if (filter.dateRange) {
      const created = new Date(trace.createdAt).getTime();
      const start = new Date(filter.dateRange.start).getTime();
      const end = new Date(filter.dateRange.end).getTime();
      if (created < start || created > end) return false;
    }
    if (filter.searchText) {
      const search = filter.searchText.toLowerCase();
      const searchable = `${trace.title} ${trace.description} ${trace.author}`.toLowerCase();
      if (!searchable.includes(search)) return false;
    }
    return true;
  });
}

/** Compute summary statistics from PR traces */
export function computeTraceStats(traces: PRTrace[]): TraceStats {
  if (traces.length === 0) {
    return {
      totalPRs: 0,
      openPRs: 0,
      mergedPRs: 0,
      closedPRs: 0,
      totalEvents: 0,
      uniqueAuthors: 0,
      avgEventsPerPR: 0,
      dateRange: { start: '', end: '' },
      topAuthors: [],
    };
  }

  const totalEvents = traces.reduce((sum, t) => sum + t.events.length, 0);
  const authors = new Map<string, number>();
  for (const t of traces) {
    authors.set(t.author, (authors.get(t.author) || 0) + 1);
  }

  const topAuthors = [...authors.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([author, count]) => ({ author, count }));

  // Find earliest created and latest updated
  let earliest = traces[0].createdAt;
  let latest = traces[0].updatedAt;
  for (const t of traces) {
    if (new Date(t.createdAt) < new Date(earliest)) earliest = t.createdAt;
    if (new Date(t.updatedAt) > new Date(latest)) latest = t.updatedAt;
  }

  return {
    totalPRs: traces.length,
    openPRs: traces.filter((t) => t.status === 'open').length,
    mergedPRs: traces.filter((t) => t.status === 'merged').length,
    closedPRs: traces.filter((t) => t.status === 'closed').length,
    totalEvents,
    uniqueAuthors: authors.size,
    avgEventsPerPR: totalEvents / traces.length,
    dateRange: { start: earliest, end: latest },
    topAuthors,
  };
}
