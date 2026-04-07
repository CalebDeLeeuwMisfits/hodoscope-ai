import { describe, it, expect } from 'vitest';
import type { SCMProvider, PRStatus, TraceEventType } from './types';

describe('Type widening for Wrike support', () => {
  it('SCMProvider accepts wrike', () => {
    const provider: SCMProvider = 'wrike';
    expect(provider).toBe('wrike');
  });

  it('PRStatus accepts deferred', () => {
    const status: PRStatus = 'deferred';
    expect(status).toBe('deferred');
  });

  it('TraceEventType accepts status_changed', () => {
    const event: TraceEventType = 'status_changed';
    expect(event).toBe('status_changed');
  });

  it('PRStatus accepts repo_created', () => {
    const status: PRStatus = 'repo_created';
    expect(status).toBe('repo_created');
  });
});
