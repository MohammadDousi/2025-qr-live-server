import * as vscode from "vscode";
import { statusBarButton } from "./statusBarButton";
import * as os from "os";

var find = require("find-process");
var qrcode = require("qrcode");

interface Process {
  port: number;
  name: string;
  pid: number;
}

interface QuickPickItem extends vscode.QuickPickItem {
  port: string;
}

export function activate(context: vscode.ExtensionContext) {
  const statusBarItem = statusBarButton();
  context.subscriptions.push(statusBarItem);

  const disposable = vscode.commands.registerCommand(
    "ip-qr-code.run",
    handleQRGeneration
  );
  context.subscriptions.push(disposable);
}

export function deactivate() {}

/// generate qr code
async function handleQRGeneration() {
  const ipAddress = getLocalIpAddress();
  const port = await getPort();

  if (!port) {
    return;
  }

  try {
    const qrCode = await qrcode.toDataURL(`${ipAddress}:${port}`, {
      width: 400,
      margin: 2,
      scale: 4,
      errorCorrectionLevel: "H",
    });
    showQRCode(qrCode, `${ipAddress}:${port}`);
  } catch (error) {
    vscode.window.showErrorMessage("Failed to generate QR code");
  }
}

/// get running port or get manual port
async function getPort(): Promise<string | undefined> {
  try {
    const runningPort = await findRunningPort();
    if (runningPort) {
      return runningPort;
    }

    return await vscode.window.showInputBox({
      prompt: "Enter the port number",
      placeHolder: "e.g., 3000",
      validateInput: validatePortNumber,
    });
  } catch (error) {
    vscode.window.showErrorMessage(
      "Failed to detect ports. Please enter port manually."
    );
    return await vscode.window.showInputBox({
      prompt: "Enter the port number",
      placeHolder: "e.g., 3000",
      validateInput: validatePortNumber,
    });
  }
}
async function findRunningPort(): Promise<string | undefined> {
  const processes: Process[] = await find("port", /300[0-9]|8[0-9]{3}/);

  if (!processes || processes.length === 0) {
    vscode.window.showInformationMessage(
      "No active development ports found. Please enter port manually."
    );
    return undefined;
  }

  const items: QuickPickItem[] = processes.map((p: Process) => ({
    label: `Port ${p.port}`,
    description: `${p.name} (PID: ${p.pid})`,
    port: p.port.toString(),
  }));

  const selection = await vscode.window.showQuickPick(items, {
    placeHolder: "Select a running server port or press ESC to enter manually",
  });

  return selection?.port;
}
function validatePortNumber(value: string): string | null {
  const portNum = parseInt(value);
  if (isNaN(portNum) || portNum < 1 || portNum > 65535) {
    return "Please enter a valid port number (1-65535)";
  }
  return null;
}

/// get local ip
function getLocalIpAddress(): string {
  const interfaces = os.networkInterfaces();
  for (const devName in interfaces) {
    const iface = interfaces[devName];
    if (iface) {
      for (const alias of iface) {
        if (alias.family === "IPv4" && !alias.internal) {
          return alias.address;
        }
      }
    }
  }
  return "localhost";
}
/// show ui qr panel
function showQRCode(qrCodeDataUrl: string, urlWithPort: string) {
  const panel = vscode.window.createWebviewPanel(
    "ipQrCode",
    "IP QR Code",
    vscode.ViewColumn.One,
    {}
  );

  panel.webview.html = `
	<!DOCTYPE html>
	<html>
	  <body style="display: flex; justify-content: center; align-items: center; height: 100vh; margin: 0; background-color: #1e1e1e; color: #ffffff;">
		<div style="background-color: #2d2d2d; padding: 25px; border-radius: 12px; box-shadow: 0 4px 12px rgba(0, 0, 0, 0.5); border: 1px solid #3d3d3d;">
		  <img src="${qrCodeDataUrl}" alt="QR Code" style="width: 300px; height: 300px; filter: invert(1); border-radius: 8px;">
		  <p style="text-align: center; margin-top: 20px; font-size: 16px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; color: #cccccc;">${urlWithPort}</p>
		</div>
	  </body>
	</html>
  `;
}
