import { describe, it, expect, vi, beforeEach } from 'vitest';
import { WrikeFetcher } from './wrike';

describe('WrikeFetcher', () => {
  let fetcher: WrikeFetcher;

  beforeEach(() => {
    fetcher = new WrikeFetcher('test-token');
  });

  describe('mapStatus', () => {
    it('maps Active to open', () => {
      expect(fetcher.mapStatus('Active')).toBe('open');
    });

    it('maps Completed to merged', () => {
      expect(fetcher.mapStatus('Completed')).toBe('merged');
    });

    it('maps Deferred to deferred', () => {
      expect(fetcher.mapStatus('Deferred')).toBe('deferred');
    });

    it('maps Cancelled to closed', () => {
      expect(fetcher.mapStatus('Cancelled')).toBe('closed');
    });

    it('defaults unknown status to open', () => {
      expect(fetcher.mapStatus('SomeCustomStatus')).toBe('open');
    });
  });

  describe('buildEvents', () => {
    it('returns created event from createdDate', () => {
      const task = { createdDate: '2026-03-01T10:00:00Z', authorIds: ['USER1'], status: 'Active' };
      const events = fetcher.buildEvents(task, [], new Map([['USER1', 'Alice']]));
      expect(events).toHaveLength(1);
      expect(events[0].type).toBe('created');
      expect(events[0].timestamp).toBe('2026-03-01T10:00:00Z');
      expect(events[0].author).toBe('Alice');
    });

    it('includes comment events sorted by timestamp', () => {
      const task = { createdDate: '2026-03-01T10:00:00Z', authorIds: ['USER1'], status: 'Active' };
      const comments = [
        { id: 'c2', authorId: 'USER2', createdDate: '2026-03-03T10:00:00Z', text: 'Second' },
        { id: 'c1', authorId: 'USER1', createdDate: '2026-03-02T10:00:00Z', text: 'First' },
      ];
      const contacts = new Map([['USER1', 'Alice'], ['USER2', 'Bob']]);
      const events = fetcher.buildEvents(task, comments, contacts);
      expect(events).toHaveLength(3);
      expect(events[0].type).toBe('created');
      expect(events[1].type).toBe('comment');
      expect(events[1].author).toBe('Alice');
      expect(events[2].type).toBe('comment');
      expect(events[2].author).toBe('Bob');
    });

    it('adds merged event for completed tasks', () => {
      const task = {
        createdDate: '2026-03-01T10:00:00Z',
        completedDate: '2026-03-05T10:00:00Z',
        authorIds: ['USER1'],
        status: 'Completed',
      };
      const contacts = new Map([['USER1', 'Alice']]);
      const events = fetcher.buildEvents(task, [], contacts);
      expect(events).toHaveLength(2);
      expect(events[1].type).toBe('merged');
      expect(events[1].timestamp).toBe('2026-03-05T10:00:00Z');
    });

    it('adds closed event for cancelled tasks', () => {
      const task = {
        createdDate: '2026-03-01T10:00:00Z',
        completedDate: '2026-03-05T10:00:00Z',
        authorIds: ['USER1'],
        status: 'Cancelled',
      };
      const contacts = new Map([['USER1', 'Alice']]);
      const events = fetcher.buildEvents(task, [], contacts);
      expect(events).toHaveLength(2);
      expect(events[1].type).toBe('closed');
    });

    it('sorts all events chronologically', () => {
      const task = {
        createdDate: '2026-03-01T10:00:00Z',
        completedDate: '2026-03-10T10:00:00Z',
        authorIds: ['USER1'],
        status: 'Completed',
      };
      const comments = [
        { id: 'c1', authorId: 'USER1', createdDate: '2026-03-05T10:00:00Z', text: 'Mid' },
      ];
      const contacts = new Map([['USER1', 'Alice']]);
      const events = fetcher.buildEvents(task, comments, contacts);
      expect(events).toHaveLength(3);
      expect(events.map(e => e.type)).toEqual(['created', 'comment', 'merged']);
    });
  });

  describe('mapTaskToTrace', () => {
    const sampleTask = {
      id: 'IEAAAAAQ1234',
      title: 'Design homepage',
      description: '<p>Build the <strong>new</strong> homepage</p>',
      status: 'Completed',
      importance: 'High',
      createdDate: '2026-03-01T10:00:00Z',
      updatedDate: '2026-03-08T10:00:00Z',
      completedDate: '2026-03-10T10:00:00Z',
      permalink: 'https://www.wrike.com/open.htm?id=123456',
      authorIds: ['USER1'],
      responsibleIds: ['USER2', 'USER3'],
      parentIds: ['FOLDER1'],
      subTaskIds: ['SUB1', 'SUB2'],
    };
    const contacts = new Map([['USER1', 'Alice'], ['USER2', 'Bob'], ['USER3', 'Carol']]);
    const folders = new Map([['FOLDER1', 'Marketing Project']]);

    it('maps id correctly', () => {
      const trace = fetcher.mapTaskToTrace(sampleTask, [], contacts, folders);
      expect(trace.id).toBe('wrike-IEAAAAAQ1234');
    });

    it('sets provider to wrike', () => {
      const trace = fetcher.mapTaskToTrace(sampleTask, [], contacts, folders);
      expect(trace.provider).toBe('wrike');
    });

    it('maps repoFullName to parent folder name', () => {
      const trace = fetcher.mapTaskToTrace(sampleTask, [], contacts, folders);
      expect(trace.repoFullName).toBe('Marketing Project');
    });

    it('strips HTML from description', () => {
      const trace = fetcher.mapTaskToTrace(sampleTask, [], contacts, folders);
      expect(trace.description).toBe('Build the new homepage');
    });

    it('resolves author from contact name', () => {
      const trace = fetcher.mapTaskToTrace(sampleTask, [], contacts, folders);
      expect(trace.author).toBe('Alice');
    });

    it('maps status through mapStatus', () => {
      const trace = fetcher.mapTaskToTrace(sampleTask, [], contacts, folders);
      expect(trace.status).toBe('merged');
    });

    it('maps importance to sourceBranch and project to targetBranch', () => {
      const trace = fetcher.mapTaskToTrace(sampleTask, [], contacts, folders);
      expect(trace.sourceBranch).toBe('High');
      expect(trace.targetBranch).toBe('Marketing Project');
    });

    it('builds Wrike permalink URL', () => {
      const trace = fetcher.mapTaskToTrace(sampleTask, [], contacts, folders);
      expect(trace.url).toBe('https://www.wrike.com/open.htm?id=123456');
    });

    it('resolves reviewers from responsible contacts', () => {
      const trace = fetcher.mapTaskToTrace(sampleTask, [], contacts, folders);
      expect(trace.reviewers).toEqual(['Bob', 'Carol']);
    });

    it('uses subtask count as additions', () => {
      const trace = fetcher.mapTaskToTrace(sampleTask, [], contacts, folders);
      expect(trace.additions).toBe(2);
      expect(trace.deletions).toBe(0);
      expect(trace.changedFiles).toBe(0);
    });

    it('maps dates correctly', () => {
      const trace = fetcher.mapTaskToTrace(sampleTask, [], contacts, folders);
      expect(trace.createdAt).toBe('2026-03-01T10:00:00Z');
      expect(trace.updatedAt).toBe('2026-03-08T10:00:00Z');
      expect(trace.mergedAt).toBe('2026-03-10T10:00:00Z');
    });

    it('includes events from buildEvents', () => {
      const trace = fetcher.mapTaskToTrace(sampleTask, [], contacts, folders);
      expect(trace.events.length).toBeGreaterThanOrEqual(2);
      expect(trace.events[0].type).toBe('created');
    });
  });

  describe('fetchTasks', () => {
    beforeEach(() => {
      vi.restoreAllMocks();
    });

    function mockFetch(responses: Record<string, any>) {
      vi.stubGlobal('fetch', vi.fn((url: string) => {
        for (const [pattern, data] of Object.entries(responses)) {
          if (url.includes(pattern)) {
            return Promise.resolve({
              ok: true,
              json: () => Promise.resolve(data),
            });
          }
        }
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ data: [] }) });
      }));
    }

    it('returns empty array when no tasks found', async () => {
      mockFetch({ '/tasks': { data: [] } });
      const traces = await fetcher.fetchTasks();
      expect(traces).toEqual([]);
    });

    it('fetches tasks, comments, contacts, and folders', async () => {
      mockFetch({
        '/tasks?': {
          data: [{
            id: 'T1', title: 'Task 1', description: 'desc', status: 'Active',
            importance: 'Normal', createdDate: '2026-03-01T00:00:00Z',
            updatedDate: '2026-03-02T00:00:00Z', permalink: 'https://www.wrike.com/open.htm?id=111',
            authorIds: ['U1'], responsibleIds: ['U2'], parentIds: ['F1'], subTaskIds: [],
          }],
        },
        '/tasks/T1/comments': { data: [] },
        '/contacts?': { data: [{ id: 'U1', firstName: 'Alice', lastName: 'A' }, { id: 'U2', firstName: 'Bob', lastName: 'B' }] },
        '/folders?': { data: [{ id: 'F1', title: 'My Project' }] },
      });

      const traces = await fetcher.fetchTasks();
      expect(traces).toHaveLength(1);
      expect(traces[0].provider).toBe('wrike');
      expect(traces[0].title).toBe('Task 1');
      expect(traces[0].author).toBe('Alice A');
      expect(traces[0].repoFullName).toBe('My Project');
    });

    it('handles API errors gracefully', async () => {
      vi.stubGlobal('fetch', vi.fn(() =>
        Promise.resolve({ ok: false, status: 401, json: () => Promise.resolve({ error: 'Unauthorized' }) })
      ));
      await expect(fetcher.fetchTasks()).rejects.toThrow();
    });
  });
});
