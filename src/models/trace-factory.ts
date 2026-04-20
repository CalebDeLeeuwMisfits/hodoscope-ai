import type { PRTrace, SCMProvider, TraceEvent } from './types';

/** Revision-level slice of an Azure DevOps work item, normalized for our use. */
export interface WorkItemRevision {
  changedDate: string; // ISO 8601
  state: string;
  iterationPath: string;
  assignedTo: string;
  changedBy: string;
}

export interface BuildWorkItemTraceInput {
  project: string;
  id: number;
  title: string;
  url: string;
  revisions: WorkItemRevision[];
}

/**
 * Build a PRTrace representing an Azure DevOps work item.
 *
 * Revisions are the only primary source — we derive createdAt, updatedAt,
 * author, current assignee, and the full event timeline (created +
 * state_changed + iteration_moved) from that sequence.
 */
export function buildWorkItemTrace(input: BuildWorkItemTraceInput): PRTrace {
  const { project, id, title, url, revisions } = input;
  if (!revisions.length) {
    throw new Error(`buildWorkItemTrace: at least one revision required (work item ${id})`);
  }

  const first = revisions[0];
  const last = revisions[revisions.length - 1];
  const events: TraceEvent[] = [];

  events.push({
    id: `azdo-wi-${id}-created`,
    type: 'created',
    timestamp: first.changedDate,
    author: first.changedBy || 'unknown',
    description: `Work item #${id} created: ${title}`,
  });

  for (let i = 1; i < revisions.length; i++) {
    const prev = revisions[i - 1];
    const cur = revisions[i];
    if (cur.state !== prev.state) {
      events.push({
        id: `azdo-wi-${id}-state-${i}`,
        type: 'state_changed',
        timestamp: cur.changedDate,
        author: cur.changedBy || 'unknown',
        description: `State: ${prev.state} → ${cur.state}`,
        metadata: { oldState: prev.state, newState: cur.state },
      });
    }
    if (cur.iterationPath !== prev.iterationPath) {
      events.push({
        id: `azdo-wi-${id}-iter-${i}`,
        type: 'iteration_moved',
        timestamp: cur.changedDate,
        author: cur.changedBy || 'unknown',
        description: `Iteration: ${prev.iterationPath} → ${cur.iterationPath}`,
        metadata: { oldIteration: prev.iterationPath, newIteration: cur.iterationPath },
      });
    }
  }

  return {
    id: `azdo-wi-${project}-${id}`,
    provider: 'azure-devops',
    repoFullName: project,
    prNumber: id,
    title,
    description: '',
    author: first.changedBy || 'unknown',
    status: 'work_item',
    sourceBranch: '',
    // Co-opt targetBranch to carry the *current* state so the scatter viz
    // can surface it in tooltips and detail panels (parallel to how Wrike
    // traces put the project name here). No schema change needed.
    targetBranch: last.state || '',
    createdAt: first.changedDate,
    updatedAt: last.changedDate,
    url,
    events,
    labels: [],
    reviewers: last.assignedTo ? [last.assignedTo] : [],
    additions: 0,
    deletions: 0,
    changedFiles: 0,
  };
}

/** Build a synthetic PRTrace representing a repository creation event */
export function buildRepoCreatedTrace(
  provider: SCMProvider,
  repoFullName: string,
  createdAt: string,
  author: string,
  url: string
): PRTrace {
  return {
    id: `${provider}-${repoFullName.replace(/\//g, '-')}-repo-created`,
    provider,
    repoFullName,
    prNumber: 0,
    title: `Repository created: ${repoFullName}`,
    description: '',
    author,
    status: 'repo_created',
    sourceBranch: '',
    targetBranch: '',
    createdAt,
    updatedAt: createdAt,
    url,
    events: [{
      id: `${provider}-repo-created-${repoFullName.replace(/\//g, '-')}`,
      type: 'created' as const,
      timestamp: createdAt,
      author,
      description: `Repository ${repoFullName} created`,
    }],
    labels: [],
    reviewers: [],
    additions: 0,
    deletions: 0,
    changedFiles: 0,
  };
}
