import { describe, it, expect } from 'vitest';
import { buildRepoCreatedTrace, buildWorkItemTrace } from './trace-factory';
import type { WorkItemRevision } from './trace-factory';

describe('buildRepoCreatedTrace', () => {
  it('produces a PRTrace with status repo_created and one synthetic event', () => {
    const t = buildRepoCreatedTrace(
      'github',
      'org/repo',
      '2025-01-01T00:00:00.000Z',
      'alice',
      'https://github.com/org/repo'
    );
    expect(t.status).toBe('repo_created');
    expect(t.prNumber).toBe(0);
    expect(t.events).toHaveLength(1);
    expect(t.events[0].type).toBe('created');
    expect(t.provider).toBe('github');
  });
});

describe('buildWorkItemTrace', () => {
  const baseRevisions: WorkItemRevision[] = [
    {
      changedDate: '2026-03-01T10:00:00.000Z',
      state: 'New',
      iterationPath: 'Project\\Sprint 1',
      assignedTo: 'Alice',
      changedBy: 'Alice',
    },
    {
      changedDate: '2026-03-02T09:00:00.000Z',
      state: 'Active',
      iterationPath: 'Project\\Sprint 1',
      assignedTo: 'Alice',
      changedBy: 'Alice',
    },
    {
      changedDate: '2026-03-03T12:00:00.000Z',
      state: 'Active',
      iterationPath: 'Project\\Sprint 2',
      assignedTo: 'Alice',
      changedBy: 'Alice',
    },
    {
      changedDate: '2026-03-04T15:00:00.000Z',
      state: 'Closed',
      iterationPath: 'Project\\Sprint 2',
      assignedTo: 'Bob',
      changedBy: 'Bob',
    },
  ];

  it('produces a PRTrace with status work_item and prNumber = work item id', () => {
    const t = buildWorkItemTrace({
      project: 'Audiotising',
      id: 42,
      title: 'Build TTS pipeline',
      url: 'https://dev.azure.com/org/_workitems/edit/42',
      revisions: baseRevisions,
    });

    expect(t.provider).toBe('azure-devops');
    expect(t.status).toBe('work_item');
    expect(t.prNumber).toBe(42);
    expect(t.title).toBe('Build TTS pipeline');
    expect(t.repoFullName).toBe('Audiotising');
    expect(t.author).toBe('Bob');
    expect(t.reviewers).toEqual(['Bob']);
  });

  it('emits a created event for the first revision', () => {
    const t = buildWorkItemTrace({
      project: 'Audiotising',
      id: 42,
      title: 'Build TTS pipeline',
      url: 'https://dev.azure.com/org/_workitems/edit/42',
      revisions: baseRevisions,
    });
    const created = t.events.filter(e => e.type === 'created');
    expect(created).toHaveLength(1);
    expect(created[0].timestamp).toBe('2026-03-01T10:00:00.000Z');
  });

  it('emits one state_changed event per state transition', () => {
    const t = buildWorkItemTrace({
      project: 'Audiotising',
      id: 42,
      title: 'Build TTS pipeline',
      url: 'https://dev.azure.com/org/_workitems/edit/42',
      revisions: baseRevisions,
    });
    const stateEvents = t.events.filter(e => e.type === 'state_changed');
    expect(stateEvents).toHaveLength(2);
    expect(stateEvents[0].description).toBe('State: New → Active');
    expect(stateEvents[1].description).toBe('State: Active → Closed');
  });

  it('emits one iteration_moved event per iteration change', () => {
    const t = buildWorkItemTrace({
      project: 'Audiotising',
      id: 42,
      title: 'Build TTS pipeline',
      url: 'https://dev.azure.com/org/_workitems/edit/42',
      revisions: baseRevisions,
    });
    const iterEvents = t.events.filter(e => e.type === 'iteration_moved');
    expect(iterEvents).toHaveLength(1);
    expect(iterEvents[0].description).toBe('Iteration: Project\\Sprint 1 → Project\\Sprint 2');
  });

  it('skips revisions that change neither state nor iteration', () => {
    const noiseRevisions: WorkItemRevision[] = [
      { changedDate: '2026-03-01T10:00:00.000Z', state: 'New', iterationPath: 'Sprint 1', assignedTo: 'Alice', changedBy: 'Alice' },
      { changedDate: '2026-03-02T10:00:00.000Z', state: 'New', iterationPath: 'Sprint 1', assignedTo: 'Alice', changedBy: 'Alice' }, // comment-only edit
      { changedDate: '2026-03-03T10:00:00.000Z', state: 'Active', iterationPath: 'Sprint 1', assignedTo: 'Alice', changedBy: 'Alice' },
    ];
    const t = buildWorkItemTrace({
      project: 'X',
      id: 1,
      title: 'T',
      url: '',
      revisions: noiseRevisions,
    });
    expect(t.events.filter(e => e.type === 'state_changed')).toHaveLength(1);
    expect(t.events.filter(e => e.type === 'iteration_moved')).toHaveLength(0);
  });

  it('uses current assignee (last revision) as both author and reviewer', () => {
    const t = buildWorkItemTrace({
      project: 'X',
      id: 1,
      title: 'T',
      url: '',
      revisions: baseRevisions,
    });
    expect(t.author).toBe('Bob'); // latest assignee — owns the dot on the scatter
    expect(t.reviewers).toEqual(['Bob']); // last revision's assignedTo
  });

  it('falls back to first changedBy when latest revision has no assignee', () => {
    const unassignedThenLeft: WorkItemRevision[] = [
      { changedDate: '2026-03-01T10:00:00.000Z', state: 'New', iterationPath: 'S1', assignedTo: '', changedBy: 'Alice' },
      { changedDate: '2026-03-02T10:00:00.000Z', state: 'Active', iterationPath: 'S1', assignedTo: '', changedBy: 'Alice' },
    ];
    const t = buildWorkItemTrace({
      project: 'X',
      id: 2,
      title: 'Unassigned',
      url: '',
      revisions: unassignedThenLeft,
    });
    expect(t.author).toBe('Alice');
  });

  it('handles a single-revision work item (just created)', () => {
    const t = buildWorkItemTrace({
      project: 'X',
      id: 7,
      title: 'Solo',
      url: '',
      revisions: [baseRevisions[0]],
    });
    expect(t.events).toHaveLength(1);
    expect(t.events[0].type).toBe('created');
    expect(t.status).toBe('work_item');
  });

  it('populates createdAt/updatedAt from first/last revision', () => {
    const t = buildWorkItemTrace({
      project: 'X',
      id: 1,
      title: 'T',
      url: '',
      revisions: baseRevisions,
    });
    expect(t.createdAt).toBe('2026-03-01T10:00:00.000Z');
    expect(t.updatedAt).toBe('2026-03-04T15:00:00.000Z');
  });
});
