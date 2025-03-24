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
    // Find running project ports
    const activeProjectPorts = await getActiveProjectPorts();

    if (activeProjectPorts && activeProjectPorts.length > 0) {
      // If only one port is found, use it directly
      if (activeProjectPorts.length === 1) {
        return activeProjectPorts[0].port;
      }

      // If multiple ports, let user choose
      const selection = await vscode.window.showQuickPick(activeProjectPorts, {
        placeHolder: "Select the port for your active project",
      });

      if (selection) {
        return selection.port;
      }
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

// This function gets actual running ports from terminals and processes
async function getActiveProjectPorts(): Promise<QuickPickItem[] | undefined> {
  try {
    // First, collect any information from terminals
    const terminalPorts = await detectTerminalPorts();

    // Next, get information from processes
    const processPorts = await detectRunningPortsFromProcesses();

    // Combine and deduplicate results
    const allPorts: QuickPickItem[] = [];

    // Add terminal ports first (they have more context)
    if (terminalPorts && terminalPorts.length > 0) {
      allPorts.push(...terminalPorts);
    }

    // Add process ports if they're not already in the list
    if (processPorts && processPorts.length > 0) {
      for (const processPort of processPorts) {
        // Check if this port is already in our list
        if (!allPorts.some((item) => item.port === processPort.port)) {
          allPorts.push(processPort);
        }
      }
    }

    return allPorts.length > 0 ? allPorts : undefined;
  } catch (error) {
    console.error("Error detecting project ports:", error);
    return undefined;
  }
}

// Detect ports from terminal output
async function detectTerminalPorts(): Promise<QuickPickItem[]> {
  const terminalPorts: QuickPickItem[] = [];

  // We can't directly access terminal output with VSCode API
  // But we can check terminal names and make educated guesses
  if (!vscode.window.terminals || vscode.window.terminals.length === 0) {
    return terminalPorts;
  }

  // Inspect each terminal
  for (const terminal of vscode.window.terminals) {
    const terminalName = terminal.name.toLowerCase();

    // Look for common server running messages in terminal name
    // For example, many npm terminals show "npm start" or project name

    // Method 1: Check for direct port numbers in terminal name
    const portMatches = terminalName.match(/(?:port|:)[ :]*(\d{4})/i);
    if (portMatches && portMatches[1]) {
      terminalPorts.push({
        label: `Port ${portMatches[1]}`,
        description: `From terminal: ${terminal.name}`,
        detail: "Port explicitly mentioned in terminal",
        port: portMatches[1],
      });
      continue;
    }

    // Method 2: If terminal appears to be a dev server, prompt with pid
    if (terminal.processId) {
      const pid = await terminal.processId;

      // If terminal seems to be running a dev server
      if (
        terminalName.includes("npm") ||
        terminalName.includes("yarn") ||
        terminalName.includes("start") ||
        terminalName.includes("dev") ||
        terminalName.includes("serve") ||
        terminalName.includes("vite") ||
        terminalName.includes("react") ||
        terminalName.includes("next")
      ) {
        // We'll handle this by checking actual processes below
        // We just take note of the PIDs to correlate them later
      }
    }
  }

  return terminalPorts;
}

// Detect ports from actual running processes
async function detectRunningPortsFromProcesses(): Promise<QuickPickItem[]> {
  try {
    // This will find all processes bound to ports
    const processes: Process[] = await find("port");

    if (!processes || processes.length === 0) {
      return [];
    }

    console.log("Found processes:", processes); // Debug log

    // Filter to likely development servers
    // We're looking for actual web servers, not just any process
    const devProcesses = processes.filter((p) => {
      const name = p.name.toLowerCase();
      const port = p.port;

      // Filter out very low ports (usually system services)
      if (port < 1024) {
        return false;
      }

      // Include common dev server processes
      return (
        name.includes("node") ||
        name.includes("npm") ||
        name.includes("yarn") ||
        name.includes("python") ||
        name.includes("php") ||
        name.includes("ruby") ||
        name.includes("java") ||
        name.includes("http") ||
        // Also include processes on typical dev ports
        (port >= 3000 && port <= 3999) ||
        (port >= 8000 && port <= 8999) ||
        (port >= 4200 && port <= 4299) ||
        (port >= 5000 && port <= 5999) ||
        port === 1234 || // Parcel
        port === 5173 // Vite
      );
    });

    // Group processes by port to detect what's running on each port
    const portGroups = new Map<number, Process[]>();

    for (const process of devProcesses) {
      if (!portGroups.has(process.port)) {
        portGroups.set(process.port, []);
      }
      portGroups.get(process.port)?.push(process);
    }

    // Convert to QuickPick items with context
    const items: QuickPickItem[] = [];

    for (const [port, processes] of portGroups.entries()) {
      // Try to detect what's running on this port
      let projectType = "Unknown";
      let projectName = "";

      // Sort processes to get most relevant ones first
      // (node processes are usually more informative than npm)
      const sortedProcesses = [...processes].sort((a, b) => {
        const aName = a.name.toLowerCase();
        const bName = b.name.toLowerCase();

        // node processes get priority
        if (aName.includes("node") && !bName.includes("node")) {
          return -1;
        }
        if (!aName.includes("node") && bName.includes("node")) {
          return 1;
        }

        return 0;
      });

      // Look for clues about what type of server is running
      for (const process of sortedProcesses) {
        const processName = process.name.toLowerCase();

        // Check for framework-specific clues in the command
        if (processName.includes("react") || processName.includes("cra")) {
          projectType = "React";
        } else if (processName.includes("next")) {
          projectType = "Next.js";
        } else if (processName.includes("vue")) {
          projectType = "Vue";
        } else if (processName.includes("angular")) {
          projectType = "Angular";
        } else if (processName.includes("vite")) {
          projectType = "Vite";
        } else if (processName.includes("express")) {
          projectType = "Express";
        } else if (processName.includes("webpack")) {
          projectType = "Webpack";
        }

        // Try to extract project name from the command
        // Usually it's in the path to the project
        const nameParts = processName.split("/");
        if (nameParts.length > 1) {
          // The directory name is often the project name
          for (let i = nameParts.length - 2; i >= 0; i--) {
            if (nameParts[i] && !nameParts[i].includes("node_modules")) {
              projectName = nameParts[i];
              break;
            }
          }
        }

        // If we found good info, break the loop
        if (projectType !== "Unknown" && projectName) {
          break;
        }
      }

      // Create the QuickPick item
      items.push({
        label: `Port ${port}`,
        description:
          projectType !== "Unknown"
            ? `${projectType}${projectName ? ` (${projectName})` : ""}`
            : `PID: ${sortedProcesses[0].pid}`,
        detail: `${sortedProcesses.length} process${
          sortedProcesses.length > 1 ? "es" : ""
        } running on this port`,
        port: port.toString(),
      });
    }

    return items;
  } catch (error) {
    console.error("Error detecting ports from processes:", error);
    return [];
  }
}

function validatePortNumber(value: string): string | null {
  const portNum = parseInt(value);
  if (isNaN(portNum) || portNum < 1 || portNum > 65535) {
    return "Please enter a valid port number (1-65535)";
  }
  return null;
}
