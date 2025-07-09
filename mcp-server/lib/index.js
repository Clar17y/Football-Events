import ProcessManager from './processManager.js';
import ApiTester from './apiTester.js';
import ServerLogger from './logger.js';

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

  // Logging Functions
  async getServerLogs(args) {
    const { project, lines = 50 } = args;
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
      ...serverInfo.logger.tail(lines)
    };
  },

  async listLogFiles(args) {
    const { project } = args;
    return ServerLogger.listLogFiles(project);
  },

  async getLogFile(args) {
    const { filename } = args;
    return ServerLogger.getLogFileContent(filename);
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