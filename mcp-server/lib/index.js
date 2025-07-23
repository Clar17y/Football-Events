import ProcessManager from './processManager.js';
import ApiTester from './apiTester.js';
import EnhancedLogger from './enhancedLogger.js';
import path from 'path';
import fs from 'fs';

// Create singleton instances
const processManager = new ProcessManager();
const apiTester = new ApiTester();

// Export MCP function implementations
export default {
  // Server Management Functions
  async startDevServer(args) {
    const { project, options = {} } = args;
    return await processManager.startServer(project, options);
  },

  async stopDevServer(args) {
    const { project } = args;
    return await processManager.stopServer(project);
  },

  async getServerStatus(args) {
    const { project } = args;
    return await processManager.getServerStatus(project);
  },

  async stopAllServers() {
    return await processManager.stopAllServers();
  },

  async listManagedServers() {
    return processManager.listManagedServers();
  },

  async forceKillPort(port) {
    return await processManager.forceKillPort(port);
  },

  // API Testing Functions
  async testApiEndpoint(args) {
    const { method, url, body, headers } = args;
    return await apiTester.testApiEndpoint(method, url, body, headers);
  },

  async checkPortStatus(args) {
    const { port } = args;
    return await apiTester.checkPortStatus(port);
  },

  async testApiWorkflow(args) {
    const { endpoints } = args;
    return await apiTester.testApiWorkflow(endpoints);
  },

  async testCrudEndpoints(args) {
    const { baseUrl, entityName, testData } = args;
    return await apiTester.testCrudEndpoints(baseUrl, entityName, testData);
  },

  // Enhanced Logging Functions
  async getServerLogs(args) {
    const { project, lines = 50, level = null } = args;
    const serverInfo = processManager.servers.get(project);
    
    if (!serverInfo || !serverInfo.logger) {
      return {
        success: false,
        error: 'SERVER_NOT_FOUND',
        message: `No managed ${project} server found`
      };
    }

    return {
      success: true,
      ...serverInfo.logger.tail(lines, level)
    };
  },

  async listLogFiles(args) {
    const { project } = args;
    return EnhancedLogger.listLogFiles(project);
  },

  async getLogFile(args) {
    const { filename, level = null, search = null } = args;
    
    // Check if this is a command execution log file (from .ai-outputs)
    if (filename && (filename.includes('.out') || filename.includes('.err'))) {
      // Handle command execution logs directly with base64 encoding
      const outputDir = path.join(process.cwd(), '.ai-outputs');
      const filePath = path.join(outputDir, filename);
      
      try {
        if (!fs.existsSync(filePath)) {
          return {
            filename: filename,
            error: 'Command execution log file not found',
            exists: false
          };
        }

        const stats = fs.statSync(filePath);
        
        // Always read as buffer and return as base64 to avoid UTF-8 issues
        const buffer = fs.readFileSync(filePath);
        let contentBase64 = buffer.toString('base64');
        
        // For filtering, we need to decode safely
        if (level || search) {
          try {
            // Try UTF-8 first, fallback to latin1
            let content;
            try {
              content = buffer.toString('utf8');
            } catch {
              content = buffer.toString('latin1');
            }
            
            // Apply filters
            if (level) {
              const lines = content.split('\n');
              const filteredLines = lines.filter(line => line.includes(`[${level}]`));
              content = filteredLines.join('\n');
            }
            
            if (search) {
              const lines = content.split('\n');
              const regex = new RegExp(search, 'gi');
              const filteredLines = lines.filter(line => regex.test(line));
              content = filteredLines.join('\n');
            }
            
            contentBase64 = Buffer.from(content, 'utf8').toString('base64');
          } catch (filterError) {
            // If filtering fails, return original base64
            console.log(`Warning: Filtering failed for ${filename}, returning original content`);
          }
        }
        
        return {
          filename: filename,
          path: filePath,
          contentBase64: contentBase64,
          contentType: 'base64',
          size: stats.size,
          created: stats.birthtime,
          modified: stats.mtime,
          lines: Math.max(1, buffer.toString('binary').split('\n').length),
          filtered: !!(level || search),
          type: 'command_execution'
        };
      } catch (error) {
        return {
          filename: filename,
          error: error.message,
          exists: false,
          type: 'command_execution'
        };
      }
    }
    
    return EnhancedLogger.getLogFileContent(filename, { level, search });
  },


  async searchLogs(args) {
    const { project, query, options = {} } = args;
    const serverInfo = processManager.servers.get(project);
    
    if (!serverInfo || !serverInfo.logger) {
      return {
        success: false,
        error: 'SERVER_NOT_FOUND',
        message: `No managed ${project} server found`
      };
    }

    return {
      success: true,
      ...serverInfo.logger.searchLogs(query, options)
    };
  },

  async getPerformanceMetrics(args) {
    const { project } = args;
    const serverInfo = processManager.servers.get(project);
    
    if (!serverInfo || !serverInfo.logger) {
      return {
        success: false,
        error: 'SERVER_NOT_FOUND',
        message: `No managed ${project} server found`
      };
    }

    return {
      success: true,
      project: project,
      metrics: serverInfo.logger.getPerformanceMetrics()
    };
  },

  async getRecentLogs(args) {
    const { project, lines = 50, level = null } = args;
    const serverInfo = processManager.servers.get(project);
    
    if (!serverInfo || !serverInfo.logger) {
      return {
        success: false,
        error: 'SERVER_NOT_FOUND',
        message: `No managed ${project} server found`
      };
    }

    return {
      success: true,
      project: project,
      logs: serverInfo.logger.getRecentLogs(lines, level),
      sessionId: serverInfo.logger.sessionId
    };
  },

  // Utility Functions
  formatApiResponse(response) {
    return apiTester.formatResponse(response);
  },

  // Cleanup function
  async cleanup() {
    return await processManager.cleanup();
  }
};