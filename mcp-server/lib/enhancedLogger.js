import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { randomUUID } from 'crypto';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Log levels with numeric values for filtering
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
    
    // Configuration
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
    
    // Main log file
    fs.writeFileSync(this.logFile, header);
    
    // Error-only log file
    fs.writeFileSync(this.errorLogFile, header);
    
    // Debug log file (if enabled)
    if (this.config.enableDebugFile) {
      fs.writeFileSync(this.debugLogFile, header);
    }
  }

  createLogHeader() {
    const systemInfo = this.getSystemInfo();
    return `${'='.repeat(80)}
MCP SERVER ENHANCED LOG
${'='.repeat(80)}
Project: ${this.project.toUpperCase()}
Session ID: ${this.sessionId}
Started: ${new Date().toISOString()}
Log Level: ${this.config.level}
Node Version: ${process.version}
Platform: ${process.platform}
Architecture: ${process.arch}
Working Directory: ${process.cwd()}
Memory Usage: ${JSON.stringify(process.memoryUsage(), null, 2)}
Environment: ${process.env.NODE_ENV || 'development'}
Docker: ${process.env.DOCKER_CONTAINER === 'true' ? 'Yes' : 'No'}
System Info: ${JSON.stringify(systemInfo, null, 2)}
${'='.repeat(80)}

`;
  }

  getSystemInfo() {
    try {
      return {
        hostname: require('os').hostname(),
        cpus: require('os').cpus().length,
        totalMemory: require('os').totalmem(),
        freeMemory: require('os').freemem(),
        uptime: require('os').uptime(),
        loadAverage: require('os').loadavg()
      };
    } catch (error) {
      return { error: 'Failed to get system info' };
    }
  }

  startPerformanceMonitoring() {
    if (!this.config.enablePerformance) return;
    
    // Monitor memory usage every 30 seconds
    this.performanceInterval = setInterval(() => {
      const memUsage = process.memoryUsage();
      this.debug('PERFORMANCE', 'Memory usage', {
        rss: `${Math.round(memUsage.rss / 1024 / 1024)}MB`,
        heapUsed: `${Math.round(memUsage.heapUsed / 1024 / 1024)}MB`,
        heapTotal: `${Math.round(memUsage.heapTotal / 1024 / 1024)}MB`,
        external: `${Math.round(memUsage.external / 1024 / 1024)}MB`
      });
    }, 30000);
  }

  // Enhanced pipe method with better process monitoring
  pipe(serverProcess) {
    const processId = randomUUID();
    this.info('PROCESS', 'Process spawned', {
      processId,
      pid: serverProcess.pid,
      command: serverProcess.spawnargs?.join(' ') || 'unknown',
      cwd: serverProcess.spawnfile || 'unknown'
    });

    // Enhanced stdout monitoring
    serverProcess.stdout.on('data', (data) => {
      const output = data.toString();
      this.parseAndLogProcessOutput('STDOUT', output, { processId, pid: serverProcess.pid });
    });

    // Enhanced stderr monitoring
    serverProcess.stderr.on('data', (data) => {
      const output = data.toString();
      this.parseAndLogProcessOutput('STDERR', output, { processId, pid: serverProcess.pid });
    });

    // Process lifecycle events
    serverProcess.on('spawn', () => {
      this.info('PROCESS', 'Process spawn event', { processId, pid: serverProcess.pid });
    });

    serverProcess.on('error', (error) => {
      this.error('PROCESS', 'Process error', {
        processId,
        pid: serverProcess.pid,
        error: error.message,
        stack: error.stack,
        code: error.code,
        errno: error.errno,
        syscall: error.syscall,
        path: error.path
      });
    });

    serverProcess.on('exit', (code, signal) => {
      this.info('PROCESS', 'Process exited', {
        processId,
        pid: serverProcess.pid,
        exitCode: code,
        signal: signal,
        expected: code === 0 || signal === 'SIGTERM'
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

    serverProcess.on('disconnect', () => {
      this.warn('PROCESS', 'Process disconnected', { processId, pid: serverProcess.pid });
    });

    return processId;
  }

  // Parse process output and extract meaningful information
  parseAndLogProcessOutput(source, output, context) {
    const lines = output.split('\n').filter(line => line.trim());
    
    for (const line of lines) {
      const trimmedLine = line.trim();
      if (!trimmedLine) continue;

      // Detect different types of output and log appropriately
      if (this.isErrorLine(trimmedLine)) {
        this.error(source, 'Process error output', {
          ...context,
          message: trimmedLine,
          parsed: this.parseErrorLine(trimmedLine)
        });
      } else if (this.isWarningLine(trimmedLine)) {
        this.warn(source, 'Process warning output', {
          ...context,
          message: trimmedLine,
          parsed: this.parseWarningLine(trimmedLine)
        });
      } else if (this.isInfoLine(trimmedLine)) {
        this.info(source, 'Process info output', {
          ...context,
          message: trimmedLine,
          parsed: this.parseInfoLine(trimmedLine)
        });
      } else {
        this.debug(source, 'Process output', {
          ...context,
          message: trimmedLine
        });
      }
    }
  }

  isErrorLine(line) {
    const errorPatterns = [
      /error/i,
      /exception/i,
      /failed/i,
      /cannot/i,
      /unable to/i,
      /\[ERROR\]/i,
      /ERR!/i,
      /✗/,
      /❌/,
      /ENOENT/,
      /EADDRINUSE/,
      /ECONNREFUSED/
    ];
    return errorPatterns.some(pattern => pattern.test(line));
  }

  isWarningLine(line) {
    const warningPatterns = [
      /warn/i,
      /warning/i,
      /deprecated/i,
      /\[WARN\]/i,
      /⚠/,
      /!!/
    ];
    return warningPatterns.some(pattern => pattern.test(line));
  }

  isInfoLine(line) {
    const infoPatterns = [
      /server.*running/i,
      /listening.*port/i,
      /ready/i,
      /started/i,
      /local:/i,
      /network:/i,
      /✓/,
      /✅/,
      /➜/
    ];
    return infoPatterns.some(pattern => pattern.test(line));
  }

  parseErrorLine(line) {
    // Extract useful information from error lines
    const parsed = {};
    
    // Extract port numbers
    const portMatch = line.match(/port\s+(\d+)/i);
    if (portMatch) parsed.port = parseInt(portMatch[1]);
    
    // Extract file paths
    const pathMatch = line.match(/([\/\\][\w\/\\.-]+\.\w+)/);
    if (pathMatch) parsed.file = pathMatch[1];
    
    // Extract error codes
    const codeMatch = line.match(/(E[A-Z]+)/);
    if (codeMatch) parsed.errorCode = codeMatch[1];
    
    return parsed;
  }

  parseWarningLine(line) {
    const parsed = {};
    
    // Extract deprecated features
    const deprecatedMatch = line.match(/deprecated[:\s]+(.+)/i);
    if (deprecatedMatch) parsed.deprecated = deprecatedMatch[1];
    
    return parsed;
  }

  parseInfoLine(line) {
    const parsed = {};
    
    // Extract server URLs
    const urlMatch = line.match(/(https?:\/\/[^\s]+)/);
    if (urlMatch) parsed.url = urlMatch[1];
    
    // Extract port numbers
    const portMatch = line.match(/port\s+(\d+)/i);
    if (portMatch) parsed.port = parseInt(portMatch[1]);
    
    return parsed;
  }

  // Core logging methods
  trace(category, message, context = {}) {
    this.log('TRACE', category, message, context);
  }

  debug(category, message, context = {}) {
    this.log('DEBUG', category, message, context);
  }

  info(category, message, context = {}) {
    this.log('INFO', category, message, context);
  }

  warn(category, message, context = {}) {
    this.log('WARN', category, message, context);
  }

  error(category, message, context = {}) {
    this.log('ERROR', category, message, context);
  }

  fatal(category, message, context = {}) {
    this.log('FATAL', category, message, context);
  }

  // Operation tracking
  startOperation(operationName, context = {}) {
    const operationId = randomUUID();
    const operation = {
      id: operationId,
      name: operationName,
      startTime: Date.now(),
      context: { ...context }
    };
    
    this.operationStack.push(operation);
    this.info('OPERATION', `Started: ${operationName}`, {
      operationId,
      ...context
    });
    
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

  // Main logging method
  log(level, category, message, context = {}) {
    const levelNum = LOG_LEVELS[level];
    const configLevelNum = LOG_LEVELS[this.config.level];
    
    // Skip if below configured level
    if (levelNum < configLevelNum) return;
    
    const logEntry = this.createLogEntry(level, category, message, context);
    
    // Write to appropriate files
    this.writeToFile(this.logFile, logEntry);
    
    // Write errors to error file
    if (levelNum >= LOG_LEVELS.ERROR) {
      this.writeToFile(this.errorLogFile, logEntry);
    }
    
    // Write debug info to debug file
    if (this.config.enableDebugFile && levelNum <= LOG_LEVELS.DEBUG) {
      this.writeToFile(this.debugLogFile, logEntry);
    }
    
    // Console output
    if (this.config.enableConsole) {
      this.writeToConsole(level, logEntry);
    }
    
    // Keep in memory for recent logs
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
      console.error(`Failed to write to log file ${filePath}:`, error.message);
    }
  }

  writeToConsole(level, logEntry) {
    const colorMap = {
      TRACE: '\x1b[90m', // Gray
      DEBUG: '\x1b[36m', // Cyan
      INFO: '\x1b[32m',  // Green
      WARN: '\x1b[33m',  // Yellow
      ERROR: '\x1b[31m', // Red
      FATAL: '\x1b[35m'  // Magenta
    };
    
    const color = colorMap[level] || '';
    const reset = '\x1b[0m';
    
    console.log(`${color}${logEntry.trim()}${reset}`);
  }

  addToRecentLogs(logEntry) {
    this.recentLogs.push(logEntry);
    if (this.recentLogs.length > this.config.maxRecentLines) {
      this.recentLogs.shift();
    }
  }

  // Enhanced retrieval methods
  getLogFile() {
    return this.logFile;
  }

  getErrorLogFile() {
    return this.errorLogFile;
  }

  getDebugLogFile() {
    return this.debugLogFile;
  }

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

  // Performance and metrics
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

  // Search and filter logs
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

  // Cleanup
  cleanup() {
    if (this.performanceInterval) {
      clearInterval(this.performanceInterval);
    }
    
    this.info('LOGGER', 'Logger cleanup completed', {
      totalOperations: this.operationStack.length,
      logFile: this.logFile
    });
  }

  // Static methods for log file management
  static listLogFiles(project = null) {
    const logDir = path.join(__dirname, '../logs');
    
    try {
      if (!fs.existsSync(logDir)) {
        return { files: [], directory: logDir };
      }

      let files = fs.readdirSync(logDir);
      
      // Filter by project if specified
      if (project) {
        files = files.filter(file => file.startsWith(`${project}-`));
      }
      
      // Get file stats and categorize
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

      // Sort by creation time (newest first)
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
      
      // Apply filters if specified
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

  // Safe file reading method that handles both UTF-8 and binary content
  static safeReadFileContent(filePath) {
    try {
      // First, read as buffer
      const buffer = fs.readFileSync(filePath);
      
      // Try to decode as UTF-8
      const content = buffer.toString('utf8');
      
      // Check if the content contains replacement characters (indicates invalid UTF-8)
      if (content.includes('\uFFFD')) {
        // Fallback to latin1 for binary data, which preserves all bytes
        console.log(`Warning: File ${filePath} contains binary data, using latin1 encoding`);
        return buffer.toString('latin1');
      }
      
      // Clean up problematic characters that cause JSON serialization issues
      // Replace non-printable characters except common whitespace and ANSI escape sequences
      // Also handle problematic high-bit characters that cause UTF-8 issues
      return content
        .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '') // Remove control characters
        .replace(/[\x80-\x9F]/g, '') // Remove problematic high-bit characters
        .replace(/\uFFFD/g, ''); // Remove replacement characters
    } catch (error) {
      throw new Error(`Failed to read file: ${error.message}`);
    }
  }
}

export default EnhancedLogger;