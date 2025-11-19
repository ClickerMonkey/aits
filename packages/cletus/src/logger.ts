import fs from 'fs';

const logFile = './cletus.log';
let logStream: fs.WriteStream | null = null;
let logLastPromise: Promise<void> = Promise.resolve();
let lastLogTime = 0;
let debugEnabled = true;

function prepareLog() {
  if (logStream) {
    return;
  }
  logStream = fs.createWriteStream(logFile, { flags: 'a' });
  logStream.setMaxListeners(100);
}

async function logQueue(text: string) {
  prepareLog();
  await logLastPromise;
  logLastPromise = new Promise<void>((resolve) => {
    if (!logStream?.write(text)) {
      logStream?.once('drain', resolve);
    } else {
      resolve();
    }
  });
}

function formatDateTime(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  const hours = String(now.getHours()).padStart(2, '0');
  const minutes = String(now.getMinutes()).padStart(2, '0');
  const seconds = String(now.getSeconds()).padStart(2, '0');
  const ms = String(now.getMilliseconds()).padStart(3, '0');

  return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}.${ms}`;
}

/**
 * Global logger instance
 */
export const logger = {
  /**
   * Log a message to the log file
   */
  log(msg: any): void {
    if (!debugEnabled) {
      return;
    }

    const now = performance.now();
    const elapsed = now - (lastLogTime || now);
    lastLogTime = now;

    const text = typeof msg === 'string' ? msg : JSON.stringify(msg);
    const dateTime = formatDateTime();
    const elapsedText = elapsed >= 1000
      ? elapsed >= 100000
        ? `+${(elapsed / 60000).toFixed(1).padStart(5, ' ')}m `
        : `+${(elapsed / 1000).toFixed(1).padStart(5, ' ')}s `
      : `+${(elapsed).toFixed(1).padStart(5, ' ')}ms`;
    
    const fullText = `[${dateTime}] (${elapsedText}) ${text}\n`;

    logQueue(fullText);
  },

  /**
   * Enable or disable debug logging
   */
  setDebug(enabled: boolean): void {
    debugEnabled = enabled;
  },

  /**
   * Check if debug logging is enabled
   */
  isDebugEnabled(): boolean {
    return debugEnabled;
  },
};

// Override console methods to use the logger
console.log = (...args: any[]) => logger.log(args);
console.error = (...args: any[]) => logger.log(args);
console.debug = (...args: any[]) => logger.log(args);
console.warn = (...args: any[]) => logger.log(args);
console.info = (...args: any[]) => logger.log(args);
