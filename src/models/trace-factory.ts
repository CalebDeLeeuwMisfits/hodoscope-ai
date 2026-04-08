import type { PRTrace, SCMProvider } from './types';

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
