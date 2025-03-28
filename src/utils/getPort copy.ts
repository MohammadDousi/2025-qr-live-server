import * as cp from "child_process";
import * as utils from "util";
import vscode from "vscode";

const isWindows = process.platform === "win32";

interface QuickPickItem extends vscode.QuickPickItem {
  label: string;
  description: string;
  // detail?: string;
  port: string;
}
interface ProcessInfo {
  program: string;
  pid: number;
  user: string;
  type: string;
  protocol: string;
  address: string;
  port: number;
  state: string;
}

interface AppNameTerminal {
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

export async function getPort(): Promise<string | undefined> {
  try {
    // Modified command to show Node.js and VS Code processes
    const command = isWindows
      ? 'netstat -ano | findstr "LISTENING" && tasklist /FI "IMAGENAME eq node.exe"'
      : 'lsof -i -P -n | grep -E "(node|code).*LISTEN"';

    const execPromise = utils.promisify(cp.exec);
    const { stdout, stderr } = await execPromise(command);

    if (stderr) {
      console.error(`Error: ${stderr}`);
      return undefined;
    }

    const lines = stdout.split("\n").filter((line) => line.trim());
    const allowedPids = new Set<number>();

    // First, collect Node.js and VS Code PIDs
    if (isWindows) {
      lines.forEach((line) => {
        if (
          line.toLowerCase().includes("node.exe") ||
          line.toLowerCase().includes("code.exe")
        ) {
          const parts = line.split(/\s+/).filter((part) => part);
          if (parts.length >= 2) {
            allowedPids.add(parseInt(parts[1]));
          }
        }
      });
    }

    // Parse output into ProcessInfo objects
    const processes: ProcessInfo[] = (
      await Promise.all(
        lines.map(async (line) => {
          const parts = line.split(/\s+/).filter((part) => part);

          if (isWindows && parts.length >= 5) {
            const pid = parseInt(parts[4]);
            // Only include if it's a Node.js or VS Code process
            if (!allowedPids.has(pid)) {
              return null;
            }

            const addressPart = parts[1];
            const port = addressPart
              ? parseInt(addressPart.split(":").pop() || "0")
              : 0;
            const name = await getAppNameFromPID(pid);
            return {
              program: 'name' in name ? name.name : 'Unknown',
              pid: pid,
              user: "N/A",
              type: "TCP",
              protocol: parts[0],
              address: addressPart,
              port: port,
              state: "LISTENING",
            };
          }
        })
      )
    ).filter((process): process is ProcessInfo => process != null);

    if (processes.length === 0) {
      vscode.window.showInformationMessage("No active listening ports found");
      return await vscode.window.showInputBox({
        prompt: "Enter the port number",
        placeHolder: "e.g., 3000",
        validateInput: validatePortNumber,
      });
    }

    // Create QuickPickItems from process information
    const QuickItem: QuickPickItem[] = processes.map((proc) => ({
      label: `Port: ${proc.port}`,
      description: `| App: ${proc.program}`,
      port: proc.port.toString(),
    }));

    if (QuickItem.length === 1) {
      const confirmUse = await vscode.window.showQuickPick(["Yes", "No"], {
        placeHolder: `Use port ${QuickItem[0].port}?`,
      });
      return confirmUse === "Yes" ? QuickItem[0].port : undefined;
    } else {
      const selection = await vscode.window.showQuickPick(QuickItem, {
        placeHolder: "Select a port",
      });
      return selection?.port;
    }
  } catch (error) {
    console.error("Port detection error:", error);
    vscode.window.showErrorMessage(
      "Failed to detect ports. Please enter manually."
    );
    return await vscode.window.showInputBox({
      prompt: "Enter the port number",
      placeHolder: "e.g., 3000",
      validateInput: validatePortNumber,
    });
  }
}

export async function getAppNameFromPID(
  pid: number
): Promise<AppNameTerminal | {}> {
  try {
    const execPromise = utils.promisify(cp.exec);
    const command = isWindows
      ? `wmic process where processid=${pid} get commandline`
      : `lsof -p ${pid} | grep -i cwd`;

    const { stdout, stderr } = await execPromise(command);

    if (stderr) {
      console.error("Error executing command:", stderr);
      return { pid, name: "Unknown" };
    }

  
      const commandLine = stdout.trim().split("\n")[1] || "";
      return getWindowsAppInfo(commandLine, pid);
    

  } catch (error) {
    console.error("Error in getAppNameFromPID:", error);
    return { pid, name: "Unknown" };
  }
}

function getWindowsAppInfo(commandLine: string, pid: number): AppNameTerminal {
  const appInfo: AppNameTerminal = {
    command: commandLine,
    pid,
    user: "",
    fd: "",
    type: "",
    device: "",
    sizeOff: "",
    node: "",
    name: "Unknown"
  };

  // Try to find project path using regex patterns
  const patterns = [
    // Match path before node_modules
    /([A-Za-z]:\\(?:[^\\]+\\){2}[^\\]+)\\node_modules/,
    // Match path after node.exe
    /node\.exe"\s+([A-Za-z]:\\(?:[^\\]+\\){2}[^\\]+)\\node_modules/i
  ];

  for (const pattern of patterns) {
    const match = commandLine.match(pattern);
    if (match?.[1]) {
      const pathParts = match[1].split("\\");
      appInfo.name = pathParts.slice(-2).join("\\");
      return appInfo;
    }
  }

  // If no patterns match, try to extract from the full path
  const fullPath = commandLine.split("\\node_modules")[0];
  if (fullPath) {
    const pathParts = fullPath.split("\\");
    if (pathParts.length >= 2) {
      appInfo.name = pathParts.slice(-2).join("\\");
    }
  }

  return appInfo;
}


function validatePortNumber(value: string): string | null {
  const portNum = parseInt(value);
  if (isNaN(portNum) || portNum < 1 || portNum > 65535) {
    return "Please enter a valid port number (1-65535)";
  }
  return null;
}



