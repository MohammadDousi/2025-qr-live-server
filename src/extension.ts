import * as vscode from "vscode";
import { statusBarButton } from "./statusBarButton";
import * as os from "os";
import { getLocalIpAddress } from "./utils/localIp";
import { showQRCode } from "./ui/qr";

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
    const qrCode = await qrcode.toDataURL(`http://${ipAddress}:${port}`, {
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
    // First try to find port from active project
    const activeProjectPort = await getActiveProjectPort();
    if (activeProjectPort) {
      return activeProjectPort;
    }

    // If no active project port found, try to find from any running process
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

// New function to get port from active terminal or tasks
async function getActiveProjectPort(): Promise<string | undefined> {
  try {
    // Check active terminals first
    if (vscode.window.terminals.length > 0) {
      const terminalPortInfo = await checkTerminalsForPort();
      if (terminalPortInfo) {
        return terminalPortInfo;
      }
    }

    // Check active tasks
    const taskPortInfo = await checkTasksForPort();
    if (taskPortInfo) {
      return taskPortInfo;
    }

    return undefined;
  } catch (error) {
    console.error("Active project port detection error:", error);
    return undefined;
  }
}

async function checkTerminalsForPort(): Promise<string | undefined> {
  const activeTerminal = vscode.window.activeTerminal;

  if (!activeTerminal) {
    return undefined;
  }

  try {
    // Unfortunately we can't directly read terminal output with the current VSCode API
    // However, we can check if any common development servers are running by the terminal name
    const terminalName = activeTerminal.name.toLowerCase();

    // Common dev server patterns in terminal names
    const devServerPatterns = [
      { pattern: /dev\s*server/i, commonPort: "3000" },
      { pattern: /next/i, commonPort: "3000" },
      { pattern: /vite/i, commonPort: "5173" },
      { pattern: /react/i, commonPort: "3000" },
      { pattern: /angular/i, commonPort: "4200" },
      { pattern: /vue/i, commonPort: "8080" },
      { pattern: /webpack/i, commonPort: "8080" },
      { pattern: /serve/i, commonPort: "5000" },
    ];

    for (const { pattern, commonPort } of devServerPatterns) {
      if (pattern.test(terminalName)) {
        const confirmUse = await vscode.window.showQuickPick(["Yes", "No"], {
          placeHolder: `Detected possible dev server in terminal "${activeTerminal.name}". Use port ${commonPort}?`,
        });

        if (confirmUse === "Yes") {
          return commonPort;
        }
      }
    }

    return undefined;
  } catch (error) {
    console.error("Terminal check error:", error);
    return undefined;
  }
}

async function checkTasksForPort(): Promise<string | undefined> {
  try {
    const tasks = await vscode.tasks.fetchTasks();
    const runningTasks = tasks.filter(
      (task) =>
        task.execution !== undefined &&
        (task.name.toLowerCase().includes("serve") ||
          task.name.toLowerCase().includes("dev") ||
          task.name.toLowerCase().includes("start") ||
          task.name.toLowerCase().includes("run"))
    );

    if (runningTasks.length === 0) {
      return undefined;
    }

    // Extract task details for identifying common development servers
    const taskItems: QuickPickItem[] = runningTasks.map((task) => {
      let port = "3000"; // Default fallback

      // Try to determine port from task name/source
      if (task.name.includes("angular") || task.source === "ng") {
        port = "4200";
      } else if (task.name.includes("vue")) {
        port = "8080";
      } else if (task.name.includes("vite")) {
        port = "5173";
      }

      return {
        label: `Task: ${task.name}`,
        description: `Likely on port ${port}`,
        detail: `Source: ${task.source}`,
        port: port,
      };
    });

    if (taskItems.length === 1) {
      // If only one task, ask for confirmation
      const confirmUse = await vscode.window.showQuickPick(["Yes", "No"], {
        placeHolder: `Use ${taskItems[0].port} from task "${taskItems[0].label}"?`,
      });

      return confirmUse === "Yes" ? taskItems[0].port : undefined;
    } else {
      // If multiple tasks, let user choose
      const selection = await vscode.window.showQuickPick(taskItems, {
        placeHolder: "Select the port from a running task",
      });

      return selection?.port;
    }
  } catch (error) {
    console.error("Task check error:", error);
    return undefined;
  }
}

async function findRunningPort(): Promise<string | undefined> {
  try {
    // Expanded port range to include more common development ports
    const processes: Process[] = await find("port", /[1-9][0-9]{3}/);

    console.log("Found processes:", processes); // Debug log

    if (!processes || processes.length === 0) {
      vscode.window.showInformationMessage(
        "No active development ports found. Please enter port manually."
      );
      return undefined;
    }

    // Filter and sort the processes to prioritize common development servers
    const filteredProcesses = processes
      .filter((p) => {
        const name = p.name.toLowerCase();
        return (
          name.includes("node") ||
          name.includes("npm") ||
          name.includes("python") ||
          name.includes("php") ||
          name.includes("java") ||
          name.includes("ruby") ||
          p.port === 3000 || // React
          p.port === 8080 || // Various
          p.port === 4200 || // Angular
          p.port === 5173 || // Vite
          p.port === 5000 // Flask
        );
      })
      .sort((a, b) => {
        // Sort by priority (common development ports first)
        const getPriority = (port: number) => {
          switch (port) {
            case 3000:
              return 1; // React
            case 8080:
              return 2; // Various
            case 4200:
              return 3; // Angular
            case 5173:
              return 4; // Vite
            case 5000:
              return 5; // Flask
            default:
              return 99;
          }
        };
        return getPriority(a.port) - getPriority(b.port);
      });

    const items: QuickPickItem[] = filteredProcesses.map((p: Process) => ({
      label: `Port ${p.port}`,
      description: `${p.name} (PID: ${p.pid})`,
      port: p.port.toString(),
    }));

    const selection = await vscode.window.showQuickPick(items, {
      placeHolder:
        "Select a running server port or press ESC to enter manually",
    });

    return selection?.port;
  } catch (error) {
    console.error("Port detection error:", error); // Debug log
    vscode.window.showErrorMessage(`Failed to detect ports: ${error}`);
    return undefined;
  }
}

function validatePortNumber(value: string): string | null {
  const portNum = parseInt(value);
  if (isNaN(portNum) || portNum < 1 || portNum > 65535) {
    return "Please enter a valid port number (1-65535)";
  }
  return null;
}
