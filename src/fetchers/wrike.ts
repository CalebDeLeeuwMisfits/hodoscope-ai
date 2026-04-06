import type { PRTrace, PRStatus, TraceEvent } from '../models/types';

export interface WrikeFetchOptions {
  maxTasks?: number;
  status?: 'Active' | 'Completed' | 'Deferred' | 'Cancelled' | 'all';
  folderId?: string;
  spaceId?: string;
}

export class WrikeFetcher {
  private token: string;
  private baseUrl = 'https://www.wrike.com/api/v4';

  constructor(token: string) {
    this.token = token;
  }

  private async apiGet(path: string): Promise<any> {
    const res = await fetch(`${this.baseUrl}${path}`, {
      headers: { Authorization: `Bearer ${this.token}` },
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(`Wrike API error ${res.status}: ${body.error || 'Unknown'}`);
    }
    return res.json();
  }

  async fetchTasks(options: WrikeFetchOptions = {}): Promise<PRTrace[]> {
    const { maxTasks = 100, status, folderId, spaceId } = options;

    // Build task query URL
    let taskUrl = folderId
      ? `/folders/${folderId}/tasks`
      : spaceId
        ? `/spaces/${spaceId}/tasks`
        : '/tasks';
    const params = new URLSearchParams({
      pageSize: String(Math.min(maxTasks, 100)),
      fields: '["parentIds","subTaskIds","authorIds","responsibleIds","description"]',
    });
    if (status && status !== 'all') params.set('status', status);
    taskUrl += `?${params}`;

    // Fetch tasks (with pagination)
    let allTasks: any[] = [];
    let nextPageToken: string | undefined;
    do {
      const url = nextPageToken ? `${taskUrl}&nextPageToken=${nextPageToken}` : taskUrl;
      const result = await this.apiGet(url.startsWith('/') ? url : `/${url}`);
      allTasks.push(...(result.data || []));
      nextPageToken = result.nextPageToken;
    } while (nextPageToken && allTasks.length < maxTasks);
    allTasks = allTasks.slice(0, maxTasks);

    if (allTasks.length === 0) return [];

    // Collect unique contact IDs and folder IDs
    const contactIds = new Set<string>();
    const folderIds = new Set<string>();
    for (const t of allTasks) {
      (t.authorIds || []).forEach((id: string) => contactIds.add(id));
      (t.responsibleIds || []).forEach((id: string) => contactIds.add(id));
      (t.parentIds || []).forEach((id: string) => folderIds.add(id));
    }

    // Batch resolve contacts and folders
    const [contacts, folders] = await Promise.all([
      this.resolveContacts([...contactIds]),
      this.resolveFolders([...folderIds]),
    ]);

    // Fetch comments in batches of 5
    const traces: PRTrace[] = [];
    for (let i = 0; i < allTasks.length; i += 5) {
      const batch = allTasks.slice(i, i + 5);
      const commentResults = await Promise.all(
        batch.map(t =>
          this.apiGet(`/tasks/${t.id}/comments`)
            .then(r => r.data || [])
            .catch(() => [])
        )
      );
      for (let j = 0; j < batch.length; j++) {
        traces.push(this.mapTaskToTrace(batch[j], commentResults[j], contacts, folders));
      }
    }

    return traces;
  }

  private async resolveContacts(ids: string[]): Promise<Map<string, string>> {
    const map = new Map<string, string>();
    if (ids.length === 0) return map;
    try {
      const result = await this.apiGet(`/contacts?ids=[${ids.map(id => `"${id}"`).join(',')}]`);
      for (const c of result.data || []) {
        map.set(c.id, [c.firstName, c.lastName].filter(Boolean).join(' '));
      }
    } catch {}
    return map;
  }

  private async resolveFolders(ids: string[]): Promise<Map<string, string>> {
    const map = new Map<string, string>();
    if (ids.length === 0) return map;
    try {
      const result = await this.apiGet(`/folders?ids=[${ids.map(id => `"${id}"`).join(',')}]`);
      for (const f of result.data || []) {
        map.set(f.id, f.title);
      }
    } catch {}
    return map;
  }

  mapStatus(wrikeStatus: string): PRStatus {
    switch (wrikeStatus) {
      case 'Active': return 'open';
      case 'Completed': return 'merged';
      case 'Deferred': return 'deferred';
      case 'Cancelled': return 'closed';
      default: return 'open';
    }
  }

  buildEvents(task: any, comments: any[], contacts: Map<string, string>): TraceEvent[] {
    const events: TraceEvent[] = [];

    // Created event
    events.push({
      id: `${task.createdDate}-created`,
      type: 'created',
      timestamp: task.createdDate,
      author: contacts.get(task.authorIds?.[0]) || 'Unknown',
      description: 'Task created',
    });

    // Comment events
    for (const c of comments) {
      events.push({
        id: c.id,
        type: 'comment',
        timestamp: c.createdDate,
        author: contacts.get(c.authorId) || 'Unknown',
        description: this.stripHtml(c.text || ''),
      });
    }

    // Completion event
    if (task.completedDate) {
      const type = task.status === 'Cancelled' ? 'closed' : 'merged';
      events.push({
        id: `${task.completedDate}-${type}`,
        type,
        timestamp: task.completedDate,
        author: contacts.get(task.authorIds?.[0]) || 'Unknown',
        description: `Task ${type}`,
      });
    }

    // Sort chronologically
    events.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

    return events;
  }

  mapTaskToTrace(
    task: any,
    comments: any[],
    contacts: Map<string, string>,
    folders: Map<string, string>,
  ): PRTrace {
    const status = this.mapStatus(task.status);
    const folderName = folders.get(task.parentIds?.[0]) || 'Unknown';
    const numericId = task.permalink?.match(/id=(\d+)/)?.[1] || task.id;

    return {
      id: `wrike-${task.id}`,
      provider: 'wrike',
      repoFullName: folderName,
      prNumber: parseInt(numericId, 10) || 0,
      title: task.title,
      description: this.stripHtml(task.description || ''),
      author: contacts.get(task.authorIds?.[0]) || 'Unknown',
      status,
      sourceBranch: task.importance || '',
      targetBranch: folderName,
      createdAt: task.createdDate,
      updatedAt: task.updatedDate,
      mergedAt: status === 'merged' ? task.completedDate : undefined,
      closedAt: task.completedDate || undefined,
      url: task.permalink || `https://www.wrike.com/open.htm?id=${numericId}`,
      events: this.buildEvents(task, comments, contacts),
      labels: [],
      reviewers: (task.responsibleIds || [])
        .map((id: string) => contacts.get(id))
        .filter(Boolean) as string[],
      additions: task.subTaskIds?.length || 0,
      deletions: 0,
      changedFiles: 0,
    };
  }

  stripHtml(html: string): string {
    return html.replace(/<[^>]*>/g, '').trim();
  }
}
