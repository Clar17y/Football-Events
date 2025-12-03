import { spawn } from 'child_process';
import path from 'path';
import { promises as fs } from 'fs';
import net from 'net';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import EnhancedLogger from './enhancedLogger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

class ProcessManager {
  constructor() {
    this.servers = new Map();
    this.workspaceRoot = path.resolve(__dirname, '../../');
    this.pidFile = path.join(__dirname, '../pids.json');
    this.isRunningInDocker = this.detectDockerEnvironment();
    this.setupCleanup();
    this.loadPersistedPids();
  }

  detectDockerEnvironment() {
    try {
      return process.env.DOCKER_CONTAINER === 'true' || 
             process.env.container === 'docker';
    } catch (error) {
      return false;
    }
  }

  setupCleanup() {
    process.on('SIGINT', () => this.cleanup());
    process.on('SIGTERM', () => this.cleanup());
  }

  async loadPersistedPids() {
    try {
      const data = await fs.readFile(this.pidFile, 'utf8');
      const persistedPids = JSON.parse(data);
      
      for (const [project, pidInfo] of Object.entries(persistedPids)) {
        if (this.isProcessRunning(pidInfo.pid)) {
          console.error(`[ProcessManager] Found running ${project} server (PID: ${pidInfo.pid}) from previous session`);
          this.servers.set(project, {
            pid: pidInfo.pid,
            port: pidInfo.port,
            startTime: pidInfo.startTime,
            status: 'running',
            command: pidInfo.command || ['npm', 'run', 'dev'],
            cwd: pidInfo.cwd,
            process: null,
            logger: null
          });
        }
      }
      
      await this.persistPids();
    } catch (error) {
      // File doesn't exist or is invalid, start fresh
    }
  }

  async persistPids() {
    try {
      const pidsToSave = {};
      for (const [project, serverInfo] of this.servers.entries()) {
        if (this.isProcessRunning(serverInfo.pid)) {
          pidsToSave[project] = {
            pid: serverInfo.pid,
            port: serverInfo.port,
            startTime: serverInfo.startTime,
            command: serverInfo.command,
            cwd: serverInfo.cwd
          };
        }
      }
      await fs.writeFile(this.pidFile, JSON.stringify(pidsToSave, null, 2));
    } catch (error) {
      console.error('[ProcessManager] Failed to persist PIDs:', error.message);
    }
  }

  async startServer(project, options = {}) {
    const logger = new EnhancedLogger(project, {
      level: 'DEBUG',
      enableConsole: false, // Don't write to console in MCP mode
      enableStructured: true,
      enablePerformance: true,
      enableDebugFile: true
    });

    const operationId = logger.startOperation('START_SERVER', { project, options });

    try {
      logger.info('SERVER_MGMT', 'Starting server request', { project, options });

      if (this.servers.has(project)) {
        const existing = this.servers.get(project);

        if (this.isProcessRunning(existing.pid)) {
          logger.warn('SERVER_MGMT', 'Server already running', { 
            project, 
            pid: existing.pid, 
            port: existing.port 
          });
          logger.endOperation(operationId, { success: false, reason: 'already_running' });
          return {
            success: false,
            error: 'SERVER_ALREADY_RUNNING',
            message: `${project} server is already running`,
            pid: existing.pid,
            port: existing.port
          };
        } else {
          logger.info('SERVER_MGMT', 'Cleaning up dead server entry', { 
            project, 
            deadPid: existing.pid 
          });
          this.servers.delete(project);
        }
      }

      const config = this.getProjectConfig(project);
      if (!config) {
        logger.error('SERVER_MGMT', 'Invalid project configuration', { project });
        logger.endOperation(operationId, { success: false, reason: 'invalid_project' });
        return {
          success: false,
          error: 'INVALID_PROJECT',
          message: `Unknown project: ${project}. Supported: backend, frontend`
        };
      }

      const portAvailable = await this.checkPortAvailable(config.port);
      if (!portAvailable) {
        logger.error('SERVER_MGMT', 'Port conflict detected', { 
          project, 
          port: config.port
        });
        logger.endOperation(operationId, { success: false, reason: 'port_conflict' });
        return {
          success: false,
          error: 'PORT_CONFLICT',
          message: `Port ${config.port} is already in use`,
          port: config.port,
          suggestion: `Use force_kill_port to free the port`
        };
      }

      const serverProcess = await this.spawnServerProcess(project, config, logger);
      const processId = logger.pipe(serverProcess);

      const serverInfo = {
        pid: serverProcess.pid,
        port: config.port,
        startTime: new Date().toISOString(),
        status: 'starting',
        command: ['npm', 'run', 'dev'],
        cwd: path.join(this.workspaceRoot, project),
        logger: logger,
        process: serverProcess,
        processId: processId,
        operationId: operationId
      };

      this.servers.set(project, serverInfo);
      await this.persistPids();

      serverProcess.on('error', (error) => {
        logger.error('PROCESS_EVENT', 'Server process error', {
          project,
          pid: serverProcess.pid,
          error: error.message
        });
        serverInfo.status = 'error';
        serverInfo.error = error.message;
      });

      serverProcess.on('exit', (code, signal) => {
        logger.info('PROCESS_EVENT', 'Server process exited', {
          project,
          pid: serverProcess.pid,
          exitCode: code,
          signal: signal
        });
        serverInfo.status = 'stopped';
        serverInfo.exitCode = code;
        serverInfo.exitSignal = signal;
      });

      const effectiveTimeout = options.timeout || config.timeout || 30000;
      const readyResult = await this.waitForReady(project, effectiveTimeout);

      if (readyResult.success) {
        serverInfo.status = 'running';
        logger.info('SERVER_MGMT', 'Server started successfully', {
          project,
          pid: serverProcess.pid,
          port: config.port
        });
        logger.endOperation(operationId, { 
          success: true, 
          pid: serverProcess.pid, 
          port: config.port 
        });
        return {
          success: true,
          project: project,
          pid: serverProcess.pid,
          port: config.port,
          status: 'running',
          message: `${project} server started successfully on port ${config.port}`,
          startTime: serverInfo.startTime,
          logFile: logger.getLogFile()
        };
      } else {
        logger.error('SERVER_MGMT', 'Server failed to start properly', {
          project,
          readyResult
        });
        logger.endOperation(operationId, { success: false, reason: 'start_failed', details: readyResult });
        await this.stopServer(project);
        return {
          success: false,
          error: 'START_FAILED',
          message: `${project} server failed to start properly`,
          details: readyResult.error,
          logFile: logger.getLogFile()
        };
      }

    } catch (error) {
      logger.error('SERVER_MGMT', 'Failed to spawn server', {
        project,
        error: error.message
      });
      logger.endOperation(operationId, { success: false, reason: 'spawn_failed', error: error.message });
      return {
        success: false,
        error: 'SPAWN_FAILED',
        message: `Failed to spawn ${project} server`,
        details: error.message,
        logFile: logger.getLogFile()
      };
    }
  }

  async stopServer(project) {
    const serverInfo = this.servers.get(project);
    const logger = serverInfo?.logger;
    
    const tempLogger = logger || new EnhancedLogger(project, { level: 'INFO', enableConsole: false });
    const operationId = tempLogger.startOperation('STOP_SERVER', { project });

    try {
      if (!serverInfo) {
        tempLogger.endOperation(operationId, { success: false, reason: 'not_found' });
        return {
          success: false,
          error: 'SERVER_NOT_FOUND',
          message: `No managed ${project} server found`
        };
      }

      const { pid, process: serverProcess, startTime } = serverInfo;
      const uptime = Date.now() - new Date(startTime).getTime();

      if (!this.isProcessRunning(pid)) {
        this.servers.delete(project);
        tempLogger.endOperation(operationId, { success: true, reason: 'already_stopped' });
        return {
          success: true,
          message: `${project} server was already stopped`
        };
      }

      // Send SIGTERM to process group
      let sigtermSuccess = false;
      try {
        process.kill(-pid, 'SIGTERM');
        sigtermSuccess = true;
      } catch (error) {
        try {
          serverProcess?.kill('SIGTERM');
          sigtermSuccess = true;
        } catch (fallbackError) {
          // Continue
        }
      }

      const gracefulExit = await this.waitForProcessExit(pid, 3000);

      if (!gracefulExit && this.isProcessRunning(pid)) {
        try {
          process.kill(-pid, 'SIGKILL');
        } catch (error) {
          try {
            serverProcess?.kill('SIGKILL');
          } catch (fallbackError) {
            // Continue
          }
        }
        await this.waitForProcessExit(pid, 1000);
      }

      this.servers.delete(project);
      await this.persistPids();

      if (logger) {
        logger.cleanup();
      }

      tempLogger.endOperation(operationId, { 
        success: true, 
        graceful: gracefulExit, 
        uptime 
      });

      return {
        success: true,
        message: `${project} server stopped successfully`,
        graceful: gracefulExit,
        uptime: uptime
      };

    } catch (error) {
      tempLogger.endOperation(operationId, { success: false, error: error.message });
      return {
        success: false,
        error: 'STOP_FAILED',
        message: `Failed to stop ${project} server`,
        details: error.message
      };
    }
  }

  async getServerStatus(project) {
    const serverInfo = this.servers.get(project);
    
    if (!serverInfo) {
      return {
        running: false,
        message: `No managed ${project} server found`
      };
    }

    const isRunning = this.isProcessRunning(serverInfo.pid);
    
    if (!isRunning) {
      this.servers.delete(project);
      return {
        running: false,
        message: `${project} server process has stopped`
      };
    }

    const healthResult = await this.checkHealth(project, serverInfo.port);
    const uptime = Math.floor((Date.now() - new Date(serverInfo.startTime).getTime()) / 1000);

    return {
      running: true,
      project: project,
      pid: serverInfo.pid,
      port: serverInfo.port,
      status: serverInfo.status,
      uptime: uptime,
      startTime: serverInfo.startTime,
      health: healthResult.healthy ? 'healthy' : 'unhealthy',
      healthDetails: healthResult,
      logFile: serverInfo.logger?.getLogFile()
    };
  }

  async stopAllServers() {
    const results = {
      stopped: [],
      errors: []
    };

    for (const project of this.servers.keys()) {
      try {
        const result = await this.stopServer(project);
        if (result.success) {
          results.stopped.push(project);
        } else {
          results.errors.push({ project, error: result.error, message: result.message });
        }
      } catch (error) {
        results.errors.push({ project, error: 'STOP_FAILED', message: error.message });
      }
    }

    await this.persistPids();
    return results;
  }

  async forceKillPort(port) {
    try {
      const { spawn } = await import('child_process');
      return new Promise((resolve) => {
        const netstat = spawn('netstat', ['-tlnp']);
        let output = '';
        
        netstat.stdout.on('data', (data) => {
          output += data.toString();
        });
        
        netstat.on('close', (code) => {
          if (code !== 0) {
            resolve({ success: false, message: `netstat failed with code ${code}` });
            return;
          }
          
          const lines = output.split('\n');
          const portLine = lines.find(line => line.includes(`:${port} `));
          
          if (portLine) {
            const match = portLine.match(/(\d+)\/\w+\s*$/);
            
            if (match && match[1]) {
              const pid = match[1];
              
              const kill = spawn('kill', ['-9', pid]);
              kill.on('close', (killCode) => {
                resolve({
                  success: killCode === 0,
                  pid: pid,
                  message: killCode === 0 ? `Killed process ${pid} using port ${port}` : `Failed to kill process ${pid}`
                });
              });
            } else {
              resolve({ success: false, message: `Could not extract PID from netstat output for port ${port}` });
            }
          } else {
            resolve({ success: false, message: `No process found using port ${port}` });
          }
        });
        
        netstat.on('error', (error) => {
          resolve({ success: false, error: error.message, message: `Failed to run netstat` });
        });
      });
    } catch (error) {
      return {
        success: false,
        error: error.message,
        message: `Failed to kill process on port ${port}`
      };
    }
  }

  listManagedServers() {
    const servers = {};
    let count = 0;

    for (const [project, info] of this.servers.entries()) {
      servers[project] = {
        pid: info.pid,
        port: info.port,
        status: info.status,
        startTime: info.startTime,
        running: this.isProcessRunning(info.pid)
      };
      count++;
    }

    return { servers, count };
  }

  getProjectConfig(project) {
    const configs = {
      backend: {
        port: 3001,
        timeout: 30000,
        readyPattern: /Server running on port (\d+)/,
        healthPath: '/api/health',
        env: {}
      },
      frontend: {
        port: 5173,
        timeout: 30000,
        readyPattern: /Local:\s+http:\/\/localhost:(\d+)\//,
        healthPath: '/',
        env: {}
      }
    };

    return configs[project] || null;
  }

  async waitForReady(project, timeout = 30000) {
    const config = this.getProjectConfig(project);
    const serverInfo = this.servers.get(project);
    
    if (!config || !serverInfo) {
      return { success: false, error: 'Invalid project or server info' };
    }

    return new Promise((resolve) => {
      const startTime = Date.now();

      const checkReady = () => {
        if (Date.now() - startTime > timeout) {
          resolve({ success: false, error: 'Timeout waiting for server to start' });
          return;
        }

        if (!this.isProcessRunning(serverInfo.pid)) {
          resolve({ success: false, error: 'Server process exited unexpectedly' });
          return;
        }

        const recentLogs = serverInfo.logger?.getRecentLogs() || '';
        if (config.readyPattern.test(recentLogs)) {
          this.checkHealth(project, config.port)
            .then(healthResult => {
              if (healthResult.healthy) {
                resolve({ success: true });
              } else {
                setTimeout(checkReady, 500);
              }
            })
            .catch(() => {
              setTimeout(checkReady, 500);
            });
        } else {
          setTimeout(checkReady, 500);
        }
      };

      checkReady();
    });
  }

  async checkHealth(project, port) {
    const config = this.getProjectConfig(project);
    if (!config) {
      return { healthy: false, error: 'Unknown project' };
    }

    const url = `http://localhost:${port}${config.healthPath}`;
    
    try {
      const startTime = Date.now();
      const response = await fetch(url, { 
        signal: AbortSignal.timeout(2000)
      });
      const responseTime = Date.now() - startTime;

      return {
        healthy: response.ok,
        status: response.status,
        responseTime: responseTime,
        url: url
      };
    } catch (error) {
      return {
        healthy: false,
        error: error.message,
        url: url
      };
    }
  }

  async checkPortAvailable(port) {
    return new Promise((resolve) => {
      const server = net.createServer();
      
      server.listen(port, () => {
        server.once('close', () => {
          resolve(true);
        });
        server.close();
      });
      
      server.on('error', () => {
        resolve(false);
      });
    });
  }

  isProcessRunning(pid) {
    if (pid < 0) {
      return false;
    }
    
    try {
      process.kill(pid, 0);
      return true;
    } catch (error) {
      return false;
    }
  }

  async waitForProcessExit(pid, timeout) {
    return new Promise((resolve) => {
      const startTime = Date.now();
      
      const checkExit = () => {
        if (!this.isProcessRunning(pid)) {
          resolve(true);
          return;
        }
        
        if (Date.now() - startTime > timeout) {
          resolve(false);
          return;
        }
        
        setTimeout(checkExit, 100);
      };
      
      checkExit();
    });
  }

  async spawnServerProcess(project, config, logger) {
    const spawnOperation = logger.startOperation('SPAWN_PROCESS', { project });
    
    try {
      if (this.isRunningInDocker) {
        const cwd = `/workspace/${project}`;
        const env = { 
          ...process.env, 
          ...config.env,
          PATH: `/workspace/${project}/node_modules/.bin:${process.env.PATH}`
        };
        
        const childProcess = spawn('npm', ['run', 'dev'], {
          cwd,
          stdio: 'pipe',
          detached: true,
          env
        });
        
        logger.endOperation(spawnOperation, { success: true, pid: childProcess.pid, environment: 'docker' });
        return childProcess;
        
      } else {
        const cwd = path.join(this.workspaceRoot, project);
        const env = { ...process.env, ...config.env };
        
        const childProcess = spawn('npm', ['run', 'dev'], {
          cwd,
          stdio: 'pipe',
          detached: true,
          env
        });
        
        logger.endOperation(spawnOperation, { success: true, pid: childProcess.pid, environment: 'host' });
        return childProcess;
      }
    } catch (error) {
      logger.error('SPAWN', 'Failed to spawn process', {
        project,
        error: error.message
      });
      logger.endOperation(spawnOperation, { success: false, error: error.message });
      throw error;
    }
  }

  async cleanup() {
    const results = await this.stopAllServers();
    return results;
  }
}

export default ProcessManager;
