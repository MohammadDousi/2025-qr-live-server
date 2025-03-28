import * as cp from "child_process";
import * as utils from "util";
import * as vscode from "vscode";

// Constants and Interfaces
const isWindows = process.platform === "win32";

interface QuickPickItem extends vscode.QuickPickItem {
  port: string;
}

interface ProcessInfo {
  program: string;
  pid: number;
  port: number;
}

interface AppNameTerminal {
  pid: number;
  name: string;
}

// Main Functions
export async function getPort(): Promise<string | undefined> {
  try {
    const processes = await getNodeProcesses();
    
    if (processes.length === 0) {
      return showManualPortInput();
    }

    const quickItems = createQuickPickItems(processes);
    return await showPortPicker(quickItems);
  } catch (error) {
    console.error("Port detection error:", error);
    return showManualPortInput();
  }
}

// Helper Functions
async function getNodeProcesses(): Promise<ProcessInfo[]> {
  const command = isWindows
    ? 'netstat -ano | findstr "LISTENING" && tasklist /FI "IMAGENAME eq node.exe"'
    : 'lsof -i -P -n | grep "node.*LISTEN"';

  const { stdout, stderr } = await utils.promisify(cp.exec)(command);

  if (stderr) {
    console.error(`Command error: ${stderr}`);
    return [];
  }

  const lines = stdout.split("\n").filter(line => line.trim());
  const nodePids = await getNodePids(lines);
  
  return await processLines(lines, nodePids);
}

async function getNodePids(lines: string[]): Promise<Set<number>> {
  const pids = new Set<number>();
  
  if (isWindows) {
    lines.forEach(line => {
      if (line.toLowerCase().includes("node.exe")) {
        const parts = line.split(/\s+/);
        const pid = parseInt(parts[1]);
        if (!isNaN(pid)) pids.add(pid);
      }
    });
  }
  
  return pids;
}

async function processLines(lines: string[], allowedPids: Set<number>): Promise<ProcessInfo[]> {
  const processes = await Promise.all(
    lines.map(async line => {
      const parts = line.split(/\s+/).filter(part => part);
      
      if (isWindows && parts.length >= 5) {
        const pid = parseInt(parts[4]);
        if (!allowedPids.has(pid)) return null;

        const port = extractPort(parts[1]);
        if (!port) return null;

        const appInfo = await getAppNameFromPID(pid);
        return {
          program: 'name' in appInfo ? appInfo.name : 'Unknown',
          pid,
          port
        };
      }
      return null;
    })
  );

  return processes.filter((p): p is ProcessInfo => p !== null);
}

function extractPort(addressPart: string): number | null {
  if (!addressPart?.includes(":")) return null;
  const port = parseInt(addressPart.split(":").pop() || "");
  return !isNaN(port) && port > 0 ? port : null;
}

async function getAppNameFromPID(pid: number): Promise<AppNameTerminal> {
  try {
    const { stdout } = await utils.promisify(cp.exec)(
      `wmic process where processid=${pid} get commandline`
    );

    const commandLine = stdout.trim().split("\n")[1] || "";
    return extractAppInfo(commandLine, pid);
  } catch (error) {
    console.error(`Error getting app name for PID ${pid}:`, error);
    return { pid, name: "Unknown" };
  }
}

function extractAppInfo(commandLine: string, pid: number): AppNameTerminal {
  const nodeModulesMatch = commandLine.match(/([A-Za-z]:\\(?:[^\\]+\\){2}[^\\]+)\\node_modules/);
  
  if (nodeModulesMatch?.[1]) {
    const pathParts = nodeModulesMatch[1].split("\\");
    return {
      pid,
      name: pathParts.slice(-2).join("\\")
    };
  }

  return { pid, name: "Unknown" };
}

function createQuickPickItems(processes: ProcessInfo[]): QuickPickItem[] {
  return processes.map(proc => ({
    label: `${proc.program}`,
    description: `Port: ${proc.port}`,
    port: proc.port.toString()
  }));
}

async function showPortPicker(items: QuickPickItem[]): Promise<string | undefined> {
  if (items.length === 1) {
    const confirm = await vscode.window.showQuickPick(["Yes", "No"], {
      placeHolder: `Use port ${items[0].port} from ${items[0].label}?`
    });
    return confirm === "Yes" ? items[0].port : undefined;
  }

  const selection = await vscode.window.showQuickPick(items, {
    placeHolder: "Select a port from running Node.js processes"
  });
  return selection?.port;
}

async function showManualPortInput(): Promise<string | undefined> {
  return vscode.window.showInputBox({
    prompt: "Enter the port number",
    placeHolder: "e.g., 3000",
    validateInput: validatePortNumber
  });
}

function validatePortNumber(value: string): string | null {
  const port = parseInt(value);
  return (!isNaN(port) && port >= 1 && port <= 65535) 
    ? null 
    : "Please enter a valid port number (1-65535)";
}