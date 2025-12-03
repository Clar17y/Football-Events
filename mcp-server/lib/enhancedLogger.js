import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { randomUUID } from 'crypto';
import os from 'os';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const LOG_LEVELS = {
  TRACE: 0,
  DEBUG: 1,
  INFO: 2,
  WARN: 3,
  ERROR: 4,
  FATAL: 5
};

class EnhancedLogger {
  constructor(project, options = {}) {
    this.project = project;
    this.sessionId = randomUUID();
    this.timestamp = new Date().toISOString().replace(/[:.]/g, '-').replace('T', '-').slice(0, 19);
    this.logDir = path.join(__dirname, '../logs');
    this.logFile = path.join(this.logDir, `${project}-${this.timestamp}.log`);
    this.errorLogFile = path.join(this.logDir, `${project}-${this.timestamp}-errors.log`);
    this.debugLogFile = path.join(this.logDir, `${project}-${this.timestamp}-debug.log`);
    
    this.config = {
      level: options.level || 'INFO',
      maxRecentLines: options.maxRecentLines || 200,
      enableConsole: options.enableConsole !== false,
      enableStructured: options.enableStructured !== false,
      enablePerformance: options.enablePerformance !== false,
      enableDebugFile: options.enableDebugFile !== false,
      ...options
    };
    
    this.recentLogs = [];
    this.performanceMetrics = new Map();
    this.operationStack = [];
    
    this.ensureLogDir();
    this.createLogFiles();
    this.startPerformanceMonitoring();
  }

  ensureLogDir() {
    if (!fs.existsSync(this.logDir)) {
      fs.mkdirSync(this.logDir, { recursive: true });
    }
  }

  createLogFiles() {
    const header = this.createLogHeader();
    fs.writeFileSync(this.logFile, header);
    fs.writeFileSync(this.errorLogFile, header);
    
    if (this.config.enableDebugFile) {
      fs.writeFileSync(this.debugLogFile, header);
    }
  }

  createLogHeader() {
    const systemInfo = this.getSystemInfo();
    return `${'='.repeat(80)}
MCP SERVER LOG
${'='.repeat(80)}
Project: ${this.project.toUpperCase()}
Session ID: ${this.sessionId}
Started: ${new Date().toISOString()}
Log Level: ${this.config.level}
Node Version: ${process.version}
Platform: ${process.platform}
Architecture: ${process.arch}
Working Directory: ${process.cwd()}
Environment: ${process.env.NODE_ENV || 'development'}
Docker: ${process.env.DOCKER_CONTAINER === 'true' ? 'Yes' : 'No'}
System Info: ${JSON.stringify(systemInfo, null, 2)}
${'='.repeat(80)}

`;
  }

  getSystemInfo() {
    try {
      return {
        hostname: os.hostname(),
        cpus: os.cpus().length,
        totalMemory: os.totalmem(),
        freeMemory: os.freemem(),
        uptime: os.uptime()
      };
    } catch (error) {
      return { error: 'Failed to get system info' };
    }
  }

  startPerformanceMonitoring() {
    if (!this.config.enablePerformance) return;
    
    this.performanceInterval = setInterval(() => {
      const memUsage = process.memoryUsage();
      this.debug('PERFORMANCE', 'Memory usage', {
        rss: `${Math.round(memUsage.rss / 1024 / 1024)}MB`,
        heapUsed: `${Math.round(memUsage.heapUsed / 1024 / 1024)}MB`
      });
    }, 30000);
  }

  pipe(serverProcess) {
    const processId = randomUUID();
    this.info('PROCESS', 'Process spawned', {
      processId,
      pid: serverProcess.pid,
      command: serverProcess.spawnargs?.join(' ') || 'unknown'
    });

    serverProcess.stdout.on('data', (data) => {
      const output = data.toString();
      this.parseAndLogProcessOutput('STDOUT', output, { processId, pid: serverProcess.pid });
    });

    serverProcess.stderr.on('data', (data) => {
      const output = data.toString();
      this.parseAndLogProcessOutput('STDERR', output, { processId, pid: serverProcess.pid });
    });

    serverProcess.on('spawn', () => {
      this.info('PROCESS', 'Process spawn event', { processId, pid: serverProcess.pid });
    });

    serverProcess.on('error', (error) => {
      this.error('PROCESS', 'Process error', {
        processId,
        pid: serverProcess.pid,
        error: error.message,
        code: error.code
      });
    });

    serverProcess.on('exit', (code, signal) => {
      this.info('PROCESS', 'Process exited', {
        processId,
        pid: serverProcess.pid,
        exitCode: code,
        signal: signal
      });
    });

    serverProcess.on('close', (code, signal) => {
      this.info('PROCESS', 'Process closed', {
        processId,
        pid: serverProcess.pid,
        exitCode: code,
        signal: signal
      });
    });

    return processId;
  }

  parseAndLogProcessOutput(source, output, context) {
    const lines = output.split('\n').filter(line => line.trim());
    
    for (const line of lines) {
      const trimmedLine = line.trim();
      if (!trimmedLine) continue;

      if (this.isErrorLine(trimmedLine)) {
        this.error(source, 'Process error output', { ...context, message: trimmedLine });
      } else if (this.isWarningLine(trimmedLine)) {
        this.warn(source, 'Process warning output', { ...context, message: trimmedLine });
      } else if (this.isInfoLine(trimmedLine)) {
        this.info(source, 'Process info output', { ...context, message: trimmedLine });
      } else {
        this.debug(source, 'Process output', { ...context, message: trimmedLine });
      }
    }
  }

  isErrorLine(line) {
    const errorPatterns = [/error/i, /exception/i, /failed/i, /cannot/i, /ENOENT/, /EADDRINUSE/, /ECONNREFUSED/];
    return errorPatterns.some(pattern => pattern.test(line));
  }

  isWarningLine(line) {
    const warningPatterns = [/warn/i, /warning/i, /deprecated/i];
    return warningPatterns.some(pattern => pattern.test(line));
  }

  isInfoLine(line) {
    const infoPatterns = [/server.*running/i, /listening.*port/i, /ready/i, /started/i, /local:/i, /network:/i];
    return infoPatterns.some(pattern => pattern.test(line));
  }

  trace(category, message, context = {}) { this.log('TRACE', category, message, context); }
  debug(category, message, context = {}) { this.log('DEBUG', category, message, context); }
  info(category, message, context = {}) { this.log('INFO', category, message, context); }
  warn(category, message, context = {}) { this.log('WARN', category, message, context); }
  error(category, message, context = {}) { this.log('ERROR', category, message, context); }
  fatal(category, message, context = {}) { this.log('FATAL', category, message, context); }

  startOperation(operationName, context = {}) {
    const operationId = randomUUID();
    const operation = {
      id: operationId,
      name: operationName,
      startTime: Date.now(),
      context: { ...context }
    };
    
    this.operationStack.push(operation);
    this.info('OPERATION', `Started: ${operationName}`, { operationId, ...context });
    
    return operationId;
  }

  endOperation(operationId, result = {}) {
    const operationIndex = this.operationStack.findIndex(op => op.id === operationId);
    if (operationIndex === -1) {
      this.warn('OPERATION', 'Attempted to end unknown operation', { operationId });
      return;
    }
    
    const operation = this.operationStack.splice(operationIndex, 1)[0];
    const duration = Date.now() - operation.startTime;
    
    this.info('OPERATION', `Completed: ${operation.name}`, {
      operationId,
      duration: `${duration}ms`,
      success: result.success !== false,
      ...operation.context,
      ...result
    });
    
    return { duration, operation };
  }

  log(level, category, message, context = {}) {
    const levelNum = LOG_LEVELS[level];
    const configLevelNum = LOG_LEVELS[this.config.level];
    
    if (levelNum < configLevelNum) return;
    
    const logEntry = this.createLogEntry(level, category, message, context);
    
    this.writeToFile(this.logFile, logEntry);
    
    if (levelNum >= LOG_LEVELS.ERROR) {
      this.writeToFile(this.errorLogFile, logEntry);
    }
    
    if (this.config.enableDebugFile && levelNum <= LOG_LEVELS.DEBUG) {
      this.writeToFile(this.debugLogFile, logEntry);
    }
    
    if (this.config.enableConsole) {
      this.writeToConsole(level, logEntry);
    }
    
    this.addToRecentLogs(logEntry);
  }

  createLogEntry(level, category, message, context) {
    const timestamp = new Date().toISOString();
    const currentOperation = this.operationStack[this.operationStack.length - 1];
    
    const entry = {
      timestamp,
      level,
      category,
      message,
      project: this.project,
      sessionId: this.sessionId,
      operationId: currentOperation?.id,
      operationName: currentOperation?.name,
      context: { ...context }
    };
    
    if (this.config.enableStructured) {
      return JSON.stringify(entry) + '\n';
    } else {
      const contextStr = Object.keys(context).length > 0 ? ` | ${JSON.stringify(context)}` : '';
      const operationStr = currentOperation ? ` [${currentOperation.name}:${currentOperation.id.slice(0, 8)}]` : '';
      return `${timestamp} [${level}] [${category}] [${this.project.toUpperCase()}]${operationStr} ${message}${contextStr}\n`;
    }
  }

  writeToFile(filePath, logEntry) {
    try {
      fs.appendFileSync(filePath, logEntry);
    } catch (error) {
      // Silently fail in MCP mode
    }
  }

  writeToConsole(level, logEntry) {
    // In MCP mode with stdio, we shouldn't write to console
    // as it interferes with the protocol
    if (this.config.enableConsole) {
      console.error(logEntry.trim()); // Use stderr to avoid interfering with stdout
    }
  }

  addToRecentLogs(logEntry) {
    this.recentLogs.push(logEntry);
    if (this.recentLogs.length > this.config.maxRecentLines) {
      this.recentLogs.shift();
    }
  }

  getLogFile() { return this.logFile; }
  getErrorLogFile() { return this.errorLogFile; }
  getDebugLogFile() { return this.debugLogFile; }

  getRecentLogs(lines = 50, level = null) {
    let logs = this.recentLogs.slice(-lines);
    
    if (level) {
      logs = logs.filter(log => {
        if (this.config.enableStructured) {
          try {
            const parsed = JSON.parse(log);
            return parsed.level === level;
          } catch {
            return false;
          }
        } else {
          return log.includes(`[${level}]`);
        }
      });
    }
    
    return logs.join('');
  }

  tail(lines = 50, level = null) {
    try {
      const content = fs.readFileSync(this.logFile, 'utf8');
      let allLines = content.split('\n').filter(line => line.trim());
      
      if (level) {
        allLines = allLines.filter(line => line.includes(`[${level}]`));
      }
      
      const tailLines = allLines.slice(-lines);
      
      return {
        project: this.project,
        sessionId: this.sessionId,
        logFile: this.logFile,
        logs: tailLines,
        totalLines: allLines.length,
        requestedLines: lines,
        level: level || 'ALL'
      };
    } catch (error) {
      return {
        project: this.project,
        sessionId: this.sessionId,
        logFile: this.logFile,
        error: error.message,
        logs: []
      };
    }
  }

  getPerformanceMetrics() {
    return {
      operationsInProgress: this.operationStack.length,
      currentOperations: this.operationStack.map(op => ({
        id: op.id,
        name: op.name,
        duration: Date.now() - op.startTime
      })),
      memoryUsage: process.memoryUsage(),
      uptime: process.uptime()
    };
  }

  searchLogs(query, options = {}) {
    try {
      const content = fs.readFileSync(this.logFile, 'utf8');
      const lines = content.split('\n').filter(line => line.trim());
      
      const regex = new RegExp(query, options.caseSensitive ? 'g' : 'gi');
      const matches = lines.filter(line => regex.test(line));
      
      return {
        query,
        matches: matches.slice(0, options.limit || 100),
        totalMatches: matches.length,
        totalLines: lines.length
      };
    } catch (error) {
      return {
        query,
        error: error.message,
        matches: [],
        totalMatches: 0
      };
    }
  }

  cleanup() {
    if (this.performanceInterval) {
      clearInterval(this.performanceInterval);
    }
    
    this.info('LOGGER', 'Logger cleanup completed', {
      totalOperations: this.operationStack.length,
      logFile: this.logFile
    });
  }

  static listLogFiles(project = null) {
    const logDir = path.join(__dirname, '../logs');
    
    try {
      if (!fs.existsSync(logDir)) {
        return { files: [], directory: logDir };
      }

      let files = fs.readdirSync(logDir);
      
      if (project) {
        files = files.filter(file => file.startsWith(`${project}-`));
      }
      
      const fileDetails = files.map(file => {
        const filePath = path.join(logDir, file);
        const stats = fs.statSync(filePath);
        
        const type = file.includes('-errors.') ? 'error' : 
                    file.includes('-debug.') ? 'debug' : 'main';
        
        return {
          name: file,
          path: filePath,
          type: type,
          size: stats.size,
          sizeFormatted: `${Math.round(stats.size / 1024)}KB`,
          created: stats.birthtime,
          modified: stats.mtime,
          project: file.split('-')[0]
        };
      });

      fileDetails.sort((a, b) => b.created - a.created);

      return {
        files: fileDetails,
        directory: logDir,
        count: fileDetails.length,
        totalSize: fileDetails.reduce((sum, file) => sum + file.size, 0)
      };
    } catch (error) {
      return {
        files: [],
        directory: logDir,
        error: error.message
      };
    }
  }

  static getLogFileContent(filename, options = {}) {
    const logDir = path.join(__dirname, '../logs');
    const filePath = path.join(logDir, filename);
    
    try {
      if (!fs.existsSync(filePath)) {
        return {
          filename: filename,
          error: 'File not found',
          exists: false
        };
      }

      const stats = fs.statSync(filePath);
      let content = this.safeReadFileContent(filePath);
      
      if (options.level) {
        const lines = content.split('\n');
        const filteredLines = lines.filter(line => line.includes(`[${options.level}]`));
        content = filteredLines.join('\n');
      }
      
      if (options.search) {
        const lines = content.split('\n');
        const regex = new RegExp(options.search, 'gi');
        const filteredLines = lines.filter(line => regex.test(line));
        content = filteredLines.join('\n');
      }
      
      return {
        filename: filename,
        path: filePath,
        content: content,
        size: stats.size,
        created: stats.birthtime,
        modified: stats.mtime,
        lines: content.split('\n').length,
        filtered: !!(options.level || options.search)
      };
    } catch (error) {
      return {
        filename: filename,
        error: error.message,
        exists: false
      };
    }
  }

  static safeReadFileContent(filePath) {
    try {
      const buffer = fs.readFileSync(filePath);
      const content = buffer.toString('utf8');
      
      if (content.includes('\uFFFD')) {
        return buffer.toString('latin1');
      }
      
      return content
        .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '')
        .replace(/[\x80-\x9F]/g, '')
        .replace(/\uFFFD/g, '');
    } catch (error) {
      throw new Error(`Failed to read file: ${error.message}`);
    }
  }
}

export default EnhancedLogger;
