import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

class ServerLogger {
  constructor(project) {
    this.project = project;
    this.timestamp = new Date().toISOString().replace(/[:.]/g, '-').replace('T', '-').slice(0, 19);
    this.logDir = path.join(__dirname, '../logs');
    this.logFile = path.join(this.logDir, `${project}-${this.timestamp}.log`);
    this.recentLogs = [];
    this.maxRecentLines = 100;
    
    this.ensureLogDir();
    this.createLogFile();
  }

  ensureLogDir() {
    if (!fs.existsSync(this.logDir)) {
      fs.mkdirSync(this.logDir, { recursive: true });
    }
  }

  createLogFile() {
    const header = `=== ${this.project.toUpperCase()} SERVER LOG ===\n` +
                  `Started: ${new Date().toISOString()}\n` +
                  `Project: ${this.project}\n` +
                  `Log File: ${this.logFile}\n` +
                  `${'='.repeat(50)}\n\n`;
    
    fs.writeFileSync(this.logFile, header);
  }

  pipe(serverProcess) {
    // Pipe stdout
    serverProcess.stdout.on('data', (data) => {
      this.writeLog('INFO', data.toString());
    });

    // Pipe stderr
    serverProcess.stderr.on('data', (data) => {
      this.writeLog('ERROR', data.toString());
    });

    // Log process events
    serverProcess.on('spawn', () => {
      this.writeLog('INFO', `Process spawned with PID: ${serverProcess.pid}`);
    });

    serverProcess.on('error', (error) => {
      this.writeLog('ERROR', `Process error: ${error.message}`);
    });

    serverProcess.on('exit', (code, signal) => {
      this.writeLog('INFO', `Process exited with code: ${code}, signal: ${signal}`);
    });
  }

  writeLog(level, message) {
    const timestamp = new Date().toISOString();
    const logLine = `${timestamp} [${level}] [${this.project.toUpperCase()}] ${message.trim()}\n`;
    
    // Write to file
    fs.appendFileSync(this.logFile, logLine);
    
    // Keep recent logs in memory
    this.recentLogs.push(logLine);
    if (this.recentLogs.length > this.maxRecentLines) {
      this.recentLogs.shift();
    }
  }

  getLogFile() {
    return this.logFile;
  }

  getRecentLogs(lines = 50) {
    const recentLines = this.recentLogs.slice(-lines);
    return recentLines.join('');
  }

  tail(lines = 50) {
    try {
      const content = fs.readFileSync(this.logFile, 'utf8');
      const allLines = content.split('\n');
      const tailLines = allLines.slice(-lines).filter(line => line.trim());
      
      return {
        project: this.project,
        logFile: this.logFile,
        logs: tailLines,
        totalLines: allLines.length,
        requestedLines: lines
      };
    } catch (error) {
      return {
        project: this.project,
        logFile: this.logFile,
        error: error.message,
        logs: []
      };
    }
  }

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
      
      // Get file stats
      const fileDetails = files.map(file => {
        const filePath = path.join(logDir, file);
        const stats = fs.statSync(filePath);
        return {
          name: file,
          path: filePath,
          size: stats.size,
          created: stats.birthtime,
          modified: stats.mtime
        };
      });

      // Sort by creation time (newest first)
      fileDetails.sort((a, b) => b.created - a.created);

      return {
        files: fileDetails,
        directory: logDir,
        count: fileDetails.length
      };
    } catch (error) {
      return {
        files: [],
        directory: logDir,
        error: error.message
      };
    }
  }

  static getLogFileContent(filename) {
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
      const content = fs.readFileSync(filePath, 'utf8');
      
      return {
        filename: filename,
        path: filePath,
        content: content,
        size: stats.size,
        created: stats.birthtime,
        modified: stats.mtime,
        lines: content.split('\n').length
      };
    } catch (error) {
      return {
        filename: filename,
        error: error.message,
        exists: false
      };
    }
  }
}

export default ServerLogger;