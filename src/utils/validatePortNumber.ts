export function validatePortNumber(value: string): string | null {
    const port = parseInt(value);
    return (!isNaN(port) && port >= 1 && port <= 65535) 
      ? null 
      : "Please enter a valid port number (1-65535)";
  }