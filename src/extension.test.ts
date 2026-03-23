import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as vscode from 'vscode';

// Mock the fetchers to avoid real API calls
vi.mock('./fetchers/github', () => ({
  GitHubFetcher: vi.fn(() => ({
    fetchPRs: vi.fn().mockResolvedValue([]),
  })),
}));
vi.mock('./fetchers/azure-devops', () => ({
  AzureDevOpsFetcher: vi.fn(() => ({
    fetchPRs: vi.fn().mockResolvedValue([]),
  })),
}));

import { activate, deactivate } from './extension';

describe('Extension', () => {
  let mockContext: any;

  beforeEach(() => {
    vi.clearAllMocks();
    mockContext = {
      subscriptions: [],
      extensionUri: { fsPath: '/test/extension', scheme: 'file', path: '/test/extension' },
      extensionMode: 2,
    };
  });

  it('registers hodoscope.open command on activation', () => {
    activate(mockContext);
    expect(vscode.commands.registerCommand).toHaveBeenCalledWith(
      'hodoscope.open',
      expect.any(Function)
    );
  });

  it('registers hodoscope.refresh command on activation', () => {
    activate(mockContext);
    expect(vscode.commands.registerCommand).toHaveBeenCalledWith(
      'hodoscope.refresh',
      expect.any(Function)
    );
  });

  it('registers hodoscope.selectRepo command on activation', () => {
    activate(mockContext);
    expect(vscode.commands.registerCommand).toHaveBeenCalledWith(
      'hodoscope.selectRepo',
      expect.any(Function)
    );
  });

  it('adds all disposables to context.subscriptions', () => {
    activate(mockContext);
    expect(mockContext.subscriptions.length).toBeGreaterThanOrEqual(3);
  });

  it('deactivate is a no-op', () => {
    expect(() => deactivate()).not.toThrow();
  });
});
