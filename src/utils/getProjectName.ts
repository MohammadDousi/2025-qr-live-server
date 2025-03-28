import * as utils from "util";
import * as cp from "child_process";
import { isWindows } from "./getPort";
import { AppNameTerminal } from "../types/type";

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
      console.log("Error executing command:", stderr);
      return {
        pid: pid,
        name: "Unknown",
      };
    }

    return isWindows
      ? appNameWindowsOS(stdout, pid)
      : appNameLinuxOS(stdout, pid);
  } catch (error) {
    console.log("Error in getAppNameFromPID:", error);
    return {
      pid: pid,
      name: "Unknown",
    };
  }
}

function appNameWindowsOS(stdout: string, pid: number): AppNameTerminal {
  try {
    const commandLine = stdout.trim().split("\n")[1] || "";

    const appInfo: AppNameTerminal = {
      command: commandLine,
      pid,
      user: "",
      fd: "",
      type: "",
      device: "",
      sizeOff: "",
      node: "",
      name: "Unknown",
    };

    // Try to find project path using regex patterns
    const patterns = [
      // Match path before node_modules
      /([A-Za-z]:\\(?:[^\\]+\\){2}[^\\]+)\\node_modules/,
      // Match path after node.exe
      /node\.exe"\s+([A-Za-z]:\\(?:[^\\]+\\){2}[^\\]+)\\node_modules/i,
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
  } catch (error) {
    console.log("Error in appNameWindowsOS:", error);
    return {
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
  }
}

function appNameLinuxOS(stdout: string, pid: number): AppNameTerminal {
  try {
    const lines = stdout.trim().split("\n");
    const parts = lines[0].trim().split(/\s+/);
    let name = "Unknown";
    // Extract just the project name from the full path
    if (parts.length >= 9) {
      const pathParts = parts.slice(8).join(" ").trim().split("/");
      name = pathParts[pathParts.length - 1];
    }

    return {
      command: parts[0] || "",
      pid,
      user: parts[2] || "",
      fd: parts[3] || "",
      type: parts[4] || "",
      device: parts[5] || "",
      sizeOff: parts[6] || "",
      node: parts[7] || "",
      name,
    };
  } catch (error) {
    console.log("Error in appNameLinuxOS:", error);
    return {
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
  }
}
