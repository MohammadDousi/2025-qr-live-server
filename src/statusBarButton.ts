import * as vscode from "vscode";
// Make statusBarItem globally accessible
let statusBarItem: vscode.StatusBarItem;
export function statusBarButton(): vscode.StatusBarItem {
  statusBarItem = vscode.window.createStatusBarItem(
    vscode.StatusBarAlignment.Right,
    100
  );
  statusBarItem.command = "ip-qr-code.run";
  statusBarItem.text = "Generate IP Qr";
  statusBarItem.show();
  return statusBarItem;
}
