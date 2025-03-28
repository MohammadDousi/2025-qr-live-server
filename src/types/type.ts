import vscode from "vscode";

export interface QuickPickItem extends vscode.QuickPickItem {
  label: string;
  description: string;
  // detail?: string;
  port: string;
}
export interface ProcessInfo {
  program: string;
  pid: number;
  user: string;
  type: string;
  protocol: string;
  address: string;
  port: number;
  state: string;
}

export interface AppNameTerminal {
  command: string;
  pid: number;
  user: string;
  fd: string;
  type: string;
  device: string;
  sizeOff: string;
  node: string;
  name: string;
}
