// VS Code API mock for testing (works for both VS Code and Cursor)
export const window = {
  createWebviewPanel: vi.fn(() => ({
    webview: {
      html: '',
      onDidReceiveMessage: vi.fn(),
      postMessage: vi.fn(),
      asWebviewUri: vi.fn((uri: any) => uri),
      cspSource: 'https://test.vscode-cdn.net',
    },
    onDidDispose: vi.fn(),
    reveal: vi.fn(),
    dispose: vi.fn(),
  })),
  showInformationMessage: vi.fn(),
  showErrorMessage: vi.fn(),
  showWarningMessage: vi.fn(),
  withProgress: vi.fn((_opts: any, task: any) => task({ report: vi.fn() })),
  showQuickPick: vi.fn(),
  showInputBox: vi.fn(),
};

export const env = {
  openExternal: vi.fn(),
};

export const workspace = {
  getConfiguration: vi.fn(() => ({
    get: vi.fn((key: string, defaultVal?: any) => defaultVal),
  })),
  workspaceFolders: [{ uri: { fsPath: '/test/workspace' } }],
};

export const commands = {
  registerCommand: vi.fn(),
  executeCommand: vi.fn(),
};

export const Uri = {
  file: (path: string) => ({ fsPath: path, scheme: 'file', path }),
  parse: (url: string) => ({ fsPath: url, scheme: 'https', path: url }),
  joinPath: (base: any, ...parts: string[]) => ({
    fsPath: [base.fsPath, ...parts].join('/'),
    scheme: 'file',
    path: [base.path, ...parts].join('/'),
  }),
};

export const ViewColumn = { One: 1, Two: 2, Three: 3 };
export const ProgressLocation = { Notification: 15, Window: 10 };

export enum ExtensionMode {
  Production = 1,
  Development = 2,
  Test = 3,
}
