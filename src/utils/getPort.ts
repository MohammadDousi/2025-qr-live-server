import * as cp from "child_process";
import * as utils from "util";
import vscode from "vscode";
import * as path from "path";

const isWindows = process.platform === "win32";

interface QuickPickItem extends vscode.QuickPickItem {
  label: string;
  description: string;
  detail?: string;
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
    const command = (await isWindows)
      ? 'netstat -ano | findstr "node"'
      : 'lsof -i -P -n | grep "node"';

    const execPromise = await utils.promisify(cp.exec);

    const { stdout, stderr } = await execPromise(command);

    if (stderr) {
      vscode.window.showErrorMessage(`Error: ${stderr}`);
      return undefined;
    }

    const lines = stdout.split("\n").filter((line) => line.trim());

    const appName: AppNameTerminal[] = [];

    // Process app names sequentially
    for (const line of lines) {
      const parts = line.split(/\s+/).filter((part) => part);
      const appNameInfo = await getAppNameFromPID(parseInt(parts[1]));
      if ("name" in appNameInfo) {
        appName.push(appNameInfo as AppNameTerminal);
      }
    }
    vscode.window.showErrorMessage(`processes2: ${JSON.stringify(appName[0])}`);

    // Parse output into ProcessInfo objects
    const processes: ProcessInfo[] = await lines
      .map((line) => {
        const parts = line.split(/\s+/).filter((part) => part); // Filter out empty strings
        const addressPart = parts.find((part) => part.includes(":")) || "";
        const port = addressPart ? parseInt(addressPart.split(":")[1]) : 0;

        return {
          program:
            appName.find((x) => x.pid === parseInt(parts[1]))?.name ||
            "Unknown",
          pid: parseInt(parts[1]),
          user: parts[2],
          type: parts[3],
          protocol: parts[4],
          address: addressPart,
          port: port,
          state: parts[parts.length - 1].replace(/[()]/g, ""), // Remove parentheses from state
        };
      })
      .filter((proc) => !isNaN(proc.port) && proc.port > 0); // Filter out invalid ports
    // .filter((proc) => proc.state === "LISTEN");

    vscode.window.showErrorMessage("ProcessInfo => " + processes);

    if (processes.length === 0) {
      vscode.window.showErrorMessage("No active listening ports found");
      return await vscode.window.showInputBox({
        prompt: "Enter the port number",
        placeHolder: "e.g., 3000",
        validateInput: validatePortNumber,
      });
    }

    // Create QuickPickItems from process information
    const QuickItem: QuickPickItem[] = processes.map((proc) => {
      return {
        label: `Port: ${proc.port}`,
        description: `PID: ${proc.pid} | Program: ${proc.program}`,
        detail: `Address: ${proc.address} | Protocol: ${proc.protocol}`,
        port: proc.port.toString(),
      };
    });
    if (QuickItem.length === 1) {
      // If only one task, ask for confirmation
      const confirmUse = await vscode.window.showQuickPick(["Yes", "No"], {
        placeHolder: `Use ${QuickItem[0].port} from task "${QuickItem[0].label}"?`,
      });
      return confirmUse === "Yes" ? QuickItem[0].port : undefined;
    } else {
      // If multiple tasks, let user choose
      const selection = await vscode.window.showQuickPick(QuickItem, {
        placeHolder: "Select the port from a running task",
      });

      return selection?.port;
    }
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

export async function getAppNameFromPID(
  pid: number
): Promise<AppNameTerminal | {}> {
  try {
    const execPromise = utils.promisify(cp.exec);
    const command = isWindows
      ? `wmic process where processid=${pid} get executablepath`
      : `lsof -p ${pid} | grep -i cwd`;

    const { stdout, stderr } = await execPromise(command);

    if (stderr) {
      console.log("Error executing command:", stderr);
      return {
        pid: pid,
        name: "Unknown",
      };
    }

    let appInfo: AppNameTerminal = {
      command: "",
      pid: pid,
      user: "",
      fd: "",
      type: "",
      device: "",
      sizeOff: "",
      node: "",
      name: "Unknown",
    };
    let fullPath = "Unknown";

    if (isWindows) {
      const lines = stdout.trim().split("\n");
      if (lines.length > 1) {
        const exePath = lines[1].trim();
        // Extract project name from executable path
        const pathParts = exePath.split("\\");

        // Try to find meaningful project name from path
        if (pathParts.length > 2) {
          for (let i = pathParts.length - 2; i >= 0; i--) {
            if (
              pathParts[i] !== "" &&
              !pathParts[i].startsWith("Windows") &&
              !pathParts[i].startsWith("System32")
            ) {
              fullPath = pathParts[i];
              break;
            }
          }
        }

        appInfo.name = fullPath;

        // Fallback to process command if name is still unknown
        if (appInfo.name === "Unknown") {
          const { stdout: cmdOutput } = await execPromise(
            `tasklist /FI "PID eq ${pid}" /FO CSV /NH`
          );
          const cmdParts = cmdOutput.trim().split(",");
          if (cmdParts.length > 0) {
            appInfo.name = cmdParts[0].replace(/"/g, "");
          }
        }
      }
    } else {
      const lines = stdout.trim().split("\n");
      const parts = lines[0].trim().split(/\s+/);
      // Extract just the project name from the full path
      if (parts.length >= 9) {
        const pathParts = parts.slice(8).join(" ").trim().split("/");
        fullPath = pathParts[pathParts.length - 1];
      }

      appInfo = {
        command: parts[0] || "",
        pid: pid,
        user: parts[2] || "",
        fd: parts[3] || "",
        type: parts[4] || "",
        device: parts[5] || "",
        sizeOff: parts[6] || "",
        node: parts[7] || "",
        name: fullPath,
      };

      // Fallback to executable path if name is still unknown
      if (appInfo.name === "Unknown") {
        const { stdout: psOutput } = await execPromise(
          `ps -p ${pid} -o command=`
        );
        const commandStr = psOutput.trim();
        const match = commandStr.match(/\/([^\/]+)\/([^\/]+)(\/|$)/);

        if (match && match[2]) {
          appInfo.name = match[2];
        }
      }
    }

    return appInfo;
  } catch (error) {
    console.log("Error in getAppNameFromPID:", error);
    return {
      pid: pid,
      name: "Unknown",
    };
  }
}

function validatePortNumber(value: string): string | null {
  const portNum = parseInt(value);
  if (isNaN(portNum) || portNum < 1 || portNum > 65535) {
    return "Please enter a valid port number (1-65535)";
  }
  return null;
}
