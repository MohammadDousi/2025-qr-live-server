import * as cp from "child_process";
import * as utils from "util";
import vscode from "vscode";

interface QuickPickItem extends vscode.QuickPickItem {
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

export async function getPort(): Promise<string | undefined> {
  try {
    const isWindows = (await process.platform) === "win32";
    const command = isWindows
      ? 'netstat -ano | findstr "node"'
      : 'lsof -i -P -n | grep "node"';

    const execPromise = await utils.promisify(cp.exec);

    const { stdout, stderr } = await execPromise(command);

    if (stderr) {
      vscode.window.showErrorMessage(`Error: ${stderr}`);
      return undefined;
    }

    // Extract port number from the output
    // Match all port numbers that are in LISTEN state

    // Parse output into ProcessInfo objects
    const processes: ProcessInfo[] = await stdout
      .split("\n")
      .filter((line) => line.trim())
      .map((line) => {
        const parts = line.split(/\s+/).filter((part) => part); // Filter out empty strings
        // For the format: node 68229 mohammad 20u IPv6 *:3000 (LISTEN)
        const addressPart = parts.find((part) => part.includes(":")) || "";
        const port = addressPart ? parseInt(addressPart.split(":")[1]) : 0;

        return {
          program: parts[0],
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

    vscode.window.showErrorMessage(
      "ProcessInfo => " + JSON.stringify(processes)
    );
    if (processes.length === 0) {
      vscode.window.showErrorMessage("No active listening ports found");
      return await vscode.window.showInputBox({
        prompt: "Enter the port number",
        placeHolder: "e.g., 3000",
        validateInput: validatePortNumber,
      });
    }

    // Create QuickPickItems from process information
    const taskItems: QuickPickItem[] = processes.map((proc) => {
      return {
        label: `Port: ${proc.port}`,
        description: `PID: ${proc.pid} | Program: ${proc.program}`,
        detail: `Address: ${proc.address} | Protocol: ${proc.protocol}`,
        port: proc.port.toString(),
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

function validatePortNumber(value: string): string | null {
  const portNum = parseInt(value);
  if (isNaN(portNum) || portNum < 1 || portNum > 65535) {
    return "Please enter a valid port number (1-65535)";
  }
  return null;
}
