// Hodoscope AI — PR Trace Data Models
// Adapts the Hodoscope trajectory model to PR lifecycles

/** Source control provider */
export type SCMProvider = 'github' | 'azure-devops' | 'wrike';

/** PR status */
export type PRStatus = 'open' | 'merged' | 'closed' | 'draft' | 'deferred' | 'repo_created' | 'work_item';

/** Types of events in a PR lifecycle */
export type TraceEventType =
  | 'created'
  | 'commit'
  | 'review_requested'
  | 'review_submitted'
  | 'comment'
  | 'approved'
  | 'changes_requested'
  | 'merged'
  | 'closed'
  | 'reopened'
  | 'force_pushed'
  | 'branch_updated'
  | 'ci_passed'
  | 'ci_failed'
  | 'label_added'
  | 'label_removed'
  | 'status_changed'
  | 'state_changed'
  | 'iteration_moved';

/** A single event in a PR trace (analogous to Hodoscope "action") */
export interface TraceEvent {
  id: string;
  type: TraceEventType;
  timestamp: string; // ISO 8601
  author: string;
  authorAvatar?: string;
  description: string;
  metadata?: Record<string, unknown>;
}

/** A PR trace — the full lifecycle of a pull request (analogous to Hodoscope "trajectory") */
export interface PRTrace {
  id: string;
  provider: SCMProvider;
  repoFullName: string; // e.g. "owner/repo" or "org/project/repo"
  prNumber: number;
  title: string;
  description: string;
  author: string;
  authorAvatar?: string;
  status: PRStatus;
  sourceBranch: string;
  targetBranch: string;
  createdAt: string; // ISO 8601
  updatedAt: string;
  mergedAt?: string;
  closedAt?: string;
  url: string;
  events: TraceEvent[];
  labels: string[];
  reviewers: string[];
  additions: number;
  deletions: number;
  changedFiles: number;
}

/** Visualization-ready trace point (2D projected) */
export interface TracePoint {
  traceId: string;
  eventId: string;
  x: number;
  y: number;
  timestamp: number; // epoch ms for timeline
  type: TraceEventType;
  author: string;
  prTitle: string;
  prNumber: number;
  status: PRStatus;
  provider: SCMProvider;
  description: string;
  color?: string;
}

/** A connected path of trace points for rendering */
export interface TracePath {
  traceId: string;
  prNumber: number;
  prTitle: string;
  author: string;
  status: PRStatus;
  provider: SCMProvider;
  points: TracePoint[];
  color: string;
  sourceBranch: string;
  targetBranch: string;
}

/** Filter state for the visualization */
export interface TraceFilter {
  authors?: string[];
  statuses?: PRStatus[];
  providers?: SCMProvider[];
  branches?: string[];
  labels?: string[];
  dateRange?: { start: string; end: string };
  searchText?: string;
}

/** Repository configuration for fetching */
export interface RepoConfig {
  provider: SCMProvider;
  owner: string;
  repo: string;
  project?: string; // Azure DevOps project name
}

/** Grouped traces for visualization (analogous to Hodoscope grouped summaries) */
export type GroupedTraces = Record<string, TracePath[]>;

/** Stats summary for dashboard display */
export interface TraceStats {
  totalPRs: number;
  openPRs: number;
  mergedPRs: number;
  closedPRs: number;
  repoCreatedCount: number;
  totalEvents: number;
  uniqueAuthors: number;
  avgEventsPerPR: number;
  dateRange: { start: string; end: string };
  topAuthors: Array<{ author: string; count: number }>;
}
