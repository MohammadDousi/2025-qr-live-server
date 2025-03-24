import * as vscode from "vscode";
import { statusBarButton } from "./ui/statusBarButton";
import { showQRCode } from "./ui/qr";
import { getLocalIpAddress } from "./utils/localIp";
import { getPort } from "./utils/getPort";

var qrcode = require("qrcode");

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

// declare module "vscode" {
//   export namespace workspace {
//     export const ports: {
//       forwarded: ReadonlyArray<{
//         localPort: number;
//         remotePort: number;
//         name?: string;
//         processId?: number;
//       }>;
//       onDidAddPort: vscode.Event<any>;
//       onDidRemovePort: vscode.Event<any>;
//       onDidChangePort: vscode.Event<any>;
//       forward(port: number, options?: any): Thenable<any>;
//       close(port: number): Thenable<void>;
//     };
//   }
// }

/// generate qr code
async function handleQRGeneration() {
  const ipAddress = await getLocalIpAddress();
  const port = await getPort();

  if (!port) {
    return undefined;
  }

  try {
    const url = `http://${ipAddress}:${port}`;
    const qrCode = await qrcode.toDataURL(url, {
      width: 400,
      margin: 2,
      scale: 4,
      errorCorrectionLevel: "H",
    });
    showQRCode(qrCode, url);
  } catch (error) {
    vscode.window.showErrorMessage("Failed to generate QR code");
  }
}
