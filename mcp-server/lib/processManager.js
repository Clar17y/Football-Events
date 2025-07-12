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
    // Check if we're running inside a Docker container
    try {
      // Check for Docker-specific files/environment
      return process.env.DOCKER_CONTAINER === 'true' || 
             fs.existsSync('/.dockerenv') ||
             process.env.container === 'docker';
    } catch (error) {
      return false;
    }
  }

  setupCleanup() {
    // Ensure cleanup on process exit
    process.on('SIGINT', () => this.cleanup());
    process.on('SIGTERM', () => this.cleanup());
    process.on('exit', () => this.cleanup());
  }

  async loadPersistedPids() {
    try {
      const data = await fs.readFile(this.pidFile, 'utf8');
      const persistedPids = JSON.parse(data);
      
      // Check which processes are still running and clean up dead ones
      for (const [project, pidInfo] of Object.entries(persistedPids)) {
        if (this.isProcessRunning(pidInfo.pid)) {
          console.log(`[ProcessManager] Found running ${project} server (PID: ${pidInfo.pid}) from previous session`);
          // Recreate server info (without logger for now)
          this.servers.set(project, {
            pid: pidInfo.pid,
            port: pidInfo.port,
            startTime: pidInfo.startTime,
            status: 'running',
            command: pidInfo.command || ['npm', 'run', 'dev'],
            cwd: pidInfo.cwd,
            process: null, // We don't have the process object, but we have the PID
            logger: null // Will be recreated if needed
          });
        } else {
          console.log(`[ProcessManager] Cleaning up dead ${project} server (PID: ${pidInfo.pid}) from previous session`);
        }
      }
      
      // Save cleaned up state
      await this.persistPids();
    } catch (error) {
      // File doesn't exist or is invalid, start fresh
      console.log('[ProcessManager] No previous PID file found, starting fresh');
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
    // Create enhanced logger first for operation tracking
    const logger = new EnhancedLogger(project, {
      level: 'DEBUG',
      enableConsole: true,
      enableStructured: true,
      enablePerformance: true,
      enableDebugFile: true
    });

    const operationId = logger.startOperation('START_SERVER', { project, options });

    try {
      logger.info('SERVER_MGMT', 'Starting server request', { project, options });

      // Check if server is already running
      if (this.servers.has(project)) {
        const existing = this.servers.get(project);
        logger.debug('SERVER_MGMT', 'Found existing server entry', { 
          project, 
          existingPid: existing.pid, 
          existingPort: existing.port 
        });

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
          // Clean up dead process
          logger.info('SERVER_MGMT', 'Cleaning up dead server entry', { 
            project, 
            deadPid: existing.pid 
          });
          this.servers.delete(project);
        }
      }

      // Get project configuration
      logger.debug('SERVER_MGMT', 'Getting project configuration', { project });
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
      logger.debug('SERVER_MGMT', 'Project configuration loaded', { project, config });

      // Check port availability
      logger.debug('SERVER_MGMT', 'Checking port availability', { project, port: config.port });
      const portAvailable = await this.checkPortAvailable(config.port);
      if (!portAvailable) {
        logger.error('SERVER_MGMT', 'Port conflict detected', { 
          project, 
          port: config.port,
          suggestion: `Stop the existing server or check 'lsof -i :${config.port}'`
        });
        logger.endOperation(operationId, { success: false, reason: 'port_conflict' });
        return {
          success: false,
          error: 'PORT_CONFLICT',
          message: `Port ${config.port} is already in use by an external process`,
          port: config.port,
          suggestion: `Stop the existing server or check 'lsof -i :${config.port}'`
        };
      }
      logger.info('SERVER_MGMT', 'Port is available', { project, port: config.port });

      // Spawn the process (either directly or via Docker host execution)
      logger.info('SERVER_MGMT', 'Spawning server process', { project, config });
      const serverProcess = await this.spawnServerProcess(project, config, logger);

      // Set up enhanced logging with process monitoring
      logger.info('SERVER_MGMT', 'Setting up process monitoring', { 
        project, 
        pid: serverProcess.pid 
      });
      const processId = logger.pipe(serverProcess);

      // Store server info
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
      logger.info('SERVER_MGMT', 'Server info stored', { 
        project, 
        pid: serverProcess.pid, 
        port: config.port,
        processId 
      });

      // Persist PID to file
      logger.debug('SERVER_MGMT', 'Persisting PID to file', { project });
      await this.persistPids();

      // Handle process events with enhanced logging
      serverProcess.on('error', (error) => {
        logger.error('PROCESS_EVENT', 'Server process error', {
          project,
          pid: serverProcess.pid,
          processId,
          error: error.message,
          stack: error.stack,
          code: error.code,
          errno: error.errno,
          syscall: error.syscall
        });
        serverInfo.status = 'error';
        serverInfo.error = error.message;
      });

      serverProcess.on('exit', (code, signal) => {
        logger.info('PROCESS_EVENT', 'Server process exited', {
          project,
          pid: serverProcess.pid,
          processId,
          exitCode: code,
          signal: signal,
          expected: code === 0 || signal === 'SIGTERM',
          uptime: Date.now() - new Date(serverInfo.startTime).getTime()
        });
        serverInfo.status = 'stopped';
        serverInfo.exitCode = code;
        serverInfo.exitSignal = signal;
      });

      // Wait for server to be ready
      logger.info('SERVER_MGMT', 'Waiting for server to be ready', { 
        project, 
        timeout: config.timeout || 5000 
      });
      const readyResult = await this.waitForReady(project, config.timeout || 5000);

      if (readyResult.success) {
        serverInfo.status = 'running';
        logger.info('SERVER_MGMT', 'Server started successfully', {
          project,
          pid: serverProcess.pid,
          port: config.port,
          startTime: serverInfo.startTime,
          readyTime: Date.now() - new Date(serverInfo.startTime).getTime()
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
        // Server failed to start properly
        logger.error('SERVER_MGMT', 'Server failed to start properly', {
          project,
          readyResult,
          logFile: logger.getLogFile()
        });
        logger.endOperation(operationId, { success: false, reason: 'start_failed', details: readyResult });
        await this.stopServer(project);
        return {
          success: false,
          error: 'START_FAILED',
          message: `${project} server failed to start properly`,
          details: readyResult.error,
          logFile: logger.getLogFile(),
          errorLogFile: logger.getErrorLogFile()
        };
      }

    } catch (error) {
      logger.error('SERVER_MGMT', 'Failed to spawn server', {
        project,
        error: error.message,
        stack: error.stack
      });
      logger.endOperation(operationId, { success: false, reason: 'spawn_failed', error: error.message });
      return {
        success: false,
        error: 'SPAWN_FAILED',
        message: `Failed to spawn ${project} server`,
        details: error.message,
        logFile: logger.getLogFile(),
        errorLogFile: logger.getErrorLogFile()
      };
    }
  }

  async stopServer(project) {
    const serverInfo = this.servers.get(project);
    const logger = serverInfo?.logger;
    
    // If no logger available, create a temporary one
    const tempLogger = logger || new EnhancedLogger(project, { level: 'INFO' });
    const operationId = tempLogger.startOperation('STOP_SERVER', { project });

    try {
      tempLogger.info('SERVER_MGMT', 'Stop server request', { project });

      if (!serverInfo) {
        tempLogger.warn('SERVER_MGMT', 'No managed server found', { project });
        tempLogger.endOperation(operationId, { success: false, reason: 'not_found' });
        return {
          success: false,
          error: 'SERVER_NOT_FOUND',
          message: `No managed ${project} server found`
        };
      }

      const { pid, process: serverProcess, processId, startTime } = serverInfo;
      const uptime = Date.now() - new Date(startTime).getTime();

      tempLogger.info('SERVER_MGMT', 'Found server to stop', { 
        project, 
        pid, 
        processId, 
        uptime: `${uptime}ms`,
        status: serverInfo.status
      });

      if (!this.isProcessRunning(pid)) {
        tempLogger.info('SERVER_MGMT', 'Server already stopped', { project, pid });
        this.servers.delete(project);
        tempLogger.endOperation(operationId, { success: true, reason: 'already_stopped' });
        return {
          success: true,
          message: `${project} server was already stopped`
        };
      }

      // Process group kill - works for both Docker and host since we use detached: true
      tempLogger.info('PROCESS_KILL', 'Starting graceful shutdown', { 
        project, 
        pid, 
        processGroup: `-${pid}` 
      });

      // Send SIGTERM to entire process group (negative PID)
      // This kills npm and all child processes (Vite, etc.)
      tempLogger.debug('PROCESS_KILL', 'Sending SIGTERM to process group', { 
        project, 
        pid, 
        target: `-${pid}` 
      });
      
      let sigtermSuccess = false;
      try {
        process.kill(-pid, 'SIGTERM');
        sigtermSuccess = true;
        tempLogger.info('PROCESS_KILL', 'SIGTERM sent to process group', { project, pid });
      } catch (error) {
        tempLogger.warn('PROCESS_KILL', 'SIGTERM to group failed, trying main process', { 
          project, 
          pid, 
          error: error.message 
        });
        // Fallback to killing just the main process
        try {
          serverProcess.kill('SIGTERM');
          sigtermSuccess = true;
          tempLogger.info('PROCESS_KILL', 'SIGTERM sent to main process', { project, pid });
        } catch (fallbackError) {
          tempLogger.error('PROCESS_KILL', 'SIGTERM fallback also failed', { 
            project, 
            pid, 
            error: fallbackError.message 
          });
        }
      }

      // Wait up to 3 seconds for graceful shutdown
      tempLogger.debug('PROCESS_KILL', 'Waiting for graceful shutdown', { 
        project, 
        pid, 
        timeout: 3000 
      });
      const gracefulExit = await this.waitForProcessExit(pid, 3000);

      if (gracefulExit) {
        tempLogger.info('PROCESS_KILL', 'Graceful shutdown successful', { 
          project, 
          pid, 
          sigtermSuccess 
        });
      } else {
        // Force kill entire process group if still running
        tempLogger.warn('PROCESS_KILL', 'Graceful shutdown failed, force killing', { 
          project, 
          pid 
        });
        
        if (this.isProcessRunning(pid)) {
          tempLogger.debug('PROCESS_KILL', 'Sending SIGKILL to process group', { 
            project, 
            pid, 
            target: `-${pid}` 
          });
          
          try {
            process.kill(-pid, 'SIGKILL');
            tempLogger.info('PROCESS_KILL', 'SIGKILL sent to process group', { project, pid });
          } catch (error) {
            tempLogger.warn('PROCESS_KILL', 'SIGKILL to group failed, trying main process', { 
              project, 
              pid, 
              error: error.message 
            });
            // Fallback to killing just the main process
            try {
              serverProcess.kill('SIGKILL');
              tempLogger.info('PROCESS_KILL', 'SIGKILL sent to main process', { project, pid });
            } catch (fallbackError) {
              tempLogger.error('PROCESS_KILL', 'SIGKILL fallback also failed', { 
                project, 
                pid, 
                error: fallbackError.message 
              });
            }
          }
          await this.waitForProcessExit(pid, 1000);
        }
      }

      // Final check
      const finallyRunning = this.isProcessRunning(pid);
      if (finallyRunning) {
        tempLogger.error('PROCESS_KILL', 'Failed to stop process completely', { 
          project, 
          pid, 
          stillRunning: true 
        });
      } else {
        tempLogger.info('PROCESS_KILL', 'Process stopped successfully', { 
          project, 
          pid, 
          graceful: gracefulExit 
        });
      }

      // Clean up
      tempLogger.debug('SERVER_MGMT', 'Cleaning up server info', { project });
      this.servers.delete(project);
      
      // Update persisted PIDs
      tempLogger.debug('SERVER_MGMT', 'Updating persisted PIDs', { project });
      await this.persistPids();

      // Cleanup logger if it was the server's logger
      if (logger) {
        logger.cleanup();
      }

      tempLogger.info('SERVER_MGMT', 'Server stop completed', { 
        project, 
        pid, 
        graceful: gracefulExit,
        uptime: `${uptime}ms`
      });
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
      tempLogger.error('SERVER_MGMT', 'Failed to stop server', {
        project,
        error: error.message,
        stack: error.stack
      });
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

    // Perform health check
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
      logFile: serverInfo.logger.getLogFile()
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

    // Update persisted PIDs after stopping all
    await this.persistPids();

    return results;
  }

  async forceKillPort(port) {
    try {
      // Since we're running in Docker, find processes inside the container
      const { spawn } = await import('child_process');
      return new Promise((resolve) => {
        // Use netstat to find process using the port inside the container
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
            // Extract PID from netstat output (format: tcp 0 0 :::3001 :::* LISTEN 123/node)
            const match = portLine.match(/(\d+)\/\w+\s*$/);
            
            if (match && match[1]) {
              const pid = match[1];
              console.log(`[ProcessManager] Found process ${pid} using port ${port}, killing it`);
              
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
        timeout: 5000,
        readyPattern: /Server running on port (\d+)/,
        healthPath: '/api/health',
        env: {}
      },
      frontend: {
        port: 5173,
        timeout: 5000,
        readyPattern: /Local:\s+http:\/\/localhost:(\d+)\//,
        healthPath: '/',
        env: {}
      }
    };

    return configs[project] || null;
  }

  async waitForReady(project, timeout = 5000) {
    const config = this.getProjectConfig(project);
    const serverInfo = this.servers.get(project);
    
    if (!config || !serverInfo) {
      return { success: false, error: 'Invalid project or server info' };
    }

    return new Promise((resolve) => {
      const startTime = Date.now();
      let logBuffer = '';

      const checkReady = () => {
        if (Date.now() - startTime > timeout) {
          resolve({ success: false, error: 'Timeout waiting for server to start' });
          return;
        }

        // Check if process is still running
        if (!this.isProcessRunning(serverInfo.pid)) {
          resolve({ success: false, error: 'Server process exited unexpectedly' });
          return;
        }

        // Check logs for ready pattern
        const recentLogs = serverInfo.logger.getRecentLogs();
        if (config.readyPattern.test(recentLogs)) {
          // Found ready pattern, now check health
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
        timeout: 2000,
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
    // Skip negative PIDs (process groups) - only check individual process PIDs
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
        // Running in Docker - execute npm commands directly in the mounted workspace
        logger.info('SPAWN', 'Running in Docker environment', { 
          project,
          workspace: `/workspace/${project}`,
          dockerContainer: process.env.DOCKER_CONTAINER
        });
        
        const cwd = `/workspace/${project}`;
        const env = { 
          ...process.env, 
          ...config.env,
          // Ensure npm can find node_modules
          PATH: `/workspace/${project}/node_modules/.bin:${process.env.PATH}`
        };
        
        logger.debug('SPAWN', 'Docker spawn configuration', {
          project,
          command: ['npm', 'run', 'dev'],
          cwd,
          detached: true,
          envOverrides: config.env
        });
        
        // Use detached: true to create a new process group for proper cleanup
        const childProcess = spawn('npm', ['run', 'dev'], {
          cwd,
          stdio: 'pipe',
          detached: true,
          env
        });
        
        logger.info('SPAWN', 'Docker process spawned successfully', {
          project,
          pid: childProcess.pid,
          cwd
        });
        
        logger.endOperation(spawnOperation, { success: true, pid: childProcess.pid, environment: 'docker' });
        return childProcess;
        
      } else {
        // Running on host - execute directly
        logger.info('SPAWN', 'Running on host environment', { project });
        
        const cwd = path.join(this.workspaceRoot, project);
        const env = { ...process.env, ...config.env };
        
        logger.debug('SPAWN', 'Host spawn configuration', {
          project,
          command: ['npm', 'run', 'dev'],
          cwd,
          detached: true,
          workspaceRoot: this.workspaceRoot,
          envOverrides: config.env
        });
        
        // Use detached: true to create a new process group for proper cleanup
        const childProcess = spawn('npm', ['run', 'dev'], {
          cwd,
          stdio: 'pipe',
          detached: true,
          env
        });
        
        logger.info('SPAWN', 'Host process spawned successfully', {
          project,
          pid: childProcess.pid,
          cwd
        });
        
        logger.endOperation(spawnOperation, { success: true, pid: childProcess.pid, environment: 'host' });
        return childProcess;
      }
    } catch (error) {
      logger.error('SPAWN', 'Failed to spawn process', {
        project,
        error: error.message,
        stack: error.stack,
        code: error.code
      });
      logger.endOperation(spawnOperation, { success: false, error: error.message });
      throw error;
    }
  }

  async cleanup() {
    console.log('Cleaning up managed servers...');
    
    // Cleanup is now the same for Docker and host since we run npm directly
    
    const results = await this.stopAllServers();
    
    if (results.stopped.length > 0) {
      console.log(`Stopped servers: ${results.stopped.join(', ')}`);
    }
    
    if (results.errors.length > 0) {
      console.log('Cleanup errors:', results.errors);
    }
  }
}

export default ProcessManager;