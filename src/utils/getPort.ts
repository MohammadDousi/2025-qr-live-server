import * as cp from "child_process";
import * as utils from "util";
import vscode from "vscode";
import { AppNameTerminal, ProcessInfo, QuickPickItem } from "../types/type";
import { validatePortNumber } from "./validatePortNumber";
import { getAppNameFromPID } from "./getProjectName";

export const isWindows = process.platform === "win32";

export async function getPort(): Promise<string | undefined> {
  try {
    const command = (await isWindows)
      ? 'netstat -ano | findstr "LISTENING" && tasklist /FI "IMAGENAME eq node.exe"'
      : 'lsof -i -P -n | grep "node"';

    const execPromise = await utils.promisify(cp.exec);
    const { stdout, stderr } = await execPromise(command);

    if (stderr) {
      vscode.window.showErrorMessage(`Error: ${stderr}`);
      return undefined;
    }

    const lines = stdout.split("\n").filter((line) => line.trim());
    const appName: AppNameTerminal[] = [];
    const allowedPids = new Set<number>();

    // Process app names sequentially

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
                program: "name" in name ? name.name : "Unknown",
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
      ).filter((process): process is ProcessInfo => process !== null);

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
    } else {
      for (const line of lines) {
        const parts = line.split(/\s+/).filter((part) => part);
        const appNameInfo = await getAppNameFromPID(parseInt(parts[1]));
        if ("name" in appNameInfo) {
          appName.push(appNameInfo as AppNameTerminal);
        }
      }

      // vscode.window.showErrorMessage(`processes2: ${JSON.stringify(appName[0])}`);

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

      // vscode.window.showErrorMessage("ProcessInfo => " + processes);

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
          label: `App: ${proc.program}`,
          description: `| Port: ${proc.port}`,
          port: proc.port.toString(),
        };

        // return {
        //   label: `Port: ${proc.port}`,
        //   description: `PID: ${proc.pid} | Program: ${proc.program}`,
        //   detail: `Address: ${proc.address} | Protocol: ${proc.protocol}`,
        //   port: proc.port.toString(),
        // };
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
