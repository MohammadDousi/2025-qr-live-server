import * as cp from "child_process";
import * as utils from "util";
import vscode from "vscode";

const isWindows = process.platform === "win32" || "win64";

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
    const command = isWindows
      ? 'netstat -ano | findstr "node"'
      : 'lsof -i -P -n | grep "node"';

    const execPromise = await utils.promisify(cp.exec);

    const { stdout, stderr } = await execPromise(command);

    if (stderr) {
      vscode.window.showErrorMessage(`Error: ${stderr}`);
      return undefined;
    }

    // Parse output into ProcessInfo objects
    const processes: ProcessInfo[] = await stdout
      .split("\n")
      .filter((line) => line.trim())
      .map((line) => {
        const parts = line.split(/\s+/).filter((part) => part); // Filter out empty strings
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
      });
    // .filter((proc) => !isNaN(proc.port) && proc.port > 0); // Filter out invalid ports
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

// async function getNameProject(params: type) {
//   const command = isWindows
//     ? `wmic process where processid=${pid} get executablepath`
//     : `lsof -p ${pid} | grep -i cwd`;
// }

function validatePortNumber(value: string): string | null {
  const portNum = parseInt(value);
  if (isNaN(portNum) || portNum < 1 || portNum > 65535) {
    return "Please enter a valid port number (1-65535)";
  }
  return null;
}
