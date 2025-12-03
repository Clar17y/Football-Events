#!/usr/bin/env node

/**
 * Grassroots PWA MCP Server v3.0
 * 
 * A proper MCP server for Claude Code that manages development servers,
 * handles logging, and provides utilities that Claude Code can't do natively.
 * 
 * Uses stdio transport for direct integration with Claude Code.
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';

// Import our existing functionality
import ProcessManager from './lib/processManager.js';
import EnhancedLogger from './lib/enhancedLogger.js';

// Create singleton instance
const processManager = new ProcessManager();

// Create the MCP server
const server = new McpServer({
  name: 'grassroots-dev-server',
  version: '3.0.0',
});

// ============================================================================
// SERVER MANAGEMENT TOOLS
// ============================================================================

server.tool(
  'start_dev_server',
  {
    project: z.enum(['backend', 'frontend']).describe('Which project to start'),
    timeout: z.number().optional().describe('Startup timeout in milliseconds (default: 30000)'),
  },
  async ({ project, timeout }) => {
    try {
      const result = await processManager.startServer(project, { timeout });
      return {
        content: [{
          type: 'text',
          text: JSON.stringify(result, null, 2),
        }],
      };
    } catch (error) {
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({ success: false, error: error.message }, null, 2),
        }],
        isError: true,
      };
    }
  }
);

server.tool(
  'stop_dev_server',
  {
    project: z.enum(['backend', 'frontend']).describe('Which project to stop'),
  },
  async ({ project }) => {
    try {
      const result = await processManager.stopServer(project);
      return {
        content: [{
          type: 'text',
          text: JSON.stringify(result, null, 2),
        }],
      };
    } catch (error) {
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({ success: false, error: error.message }, null, 2),
        }],
        isError: true,
      };
    }
  }
);

server.tool(
  'get_server_status',
  {
    project: z.enum(['backend', 'frontend']).describe('Which project to check'),
  },
  async ({ project }) => {
    try {
      const result = await processManager.getServerStatus(project);
      return {
        content: [{
          type: 'text',
          text: JSON.stringify(result, null, 2),
        }],
      };
    } catch (error) {
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({ success: false, error: error.message }, null, 2),
        }],
        isError: true,
      };
    }
  }
);

server.tool(
  'list_managed_servers',
  {},
  async () => {
    try {
      const result = processManager.listManagedServers();
      return {
        content: [{
          type: 'text',
          text: JSON.stringify(result, null, 2),
        }],
      };
    } catch (error) {
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({ success: false, error: error.message }, null, 2),
        }],
        isError: true,
      };
    }
  }
);

server.tool(
  'stop_all_servers',
  {},
  async () => {
    try {
      const result = await processManager.stopAllServers();
      return {
        content: [{
          type: 'text',
          text: JSON.stringify(result, null, 2),
        }],
      };
    } catch (error) {
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({ success: false, error: error.message }, null, 2),
        }],
        isError: true,
      };
    }
  }
);

// ============================================================================
// PORT MANAGEMENT TOOLS
// ============================================================================

server.tool(
  'check_port_status',
  {
    port: z.number().describe('Port number to check'),
  },
  async ({ port }) => {
    try {
      const available = await processManager.checkPortAvailable(port);
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            port,
            available,
            inUse: !available,
            message: available ? `Port ${port} is available` : `Port ${port} is in use`,
          }, null, 2),
        }],
      };
    } catch (error) {
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({ success: false, error: error.message }, null, 2),
        }],
        isError: true,
      };
    }
  }
);

server.tool(
  'force_kill_port',
  {
    port: z.number().describe('Port number to force kill'),
  },
  async ({ port }) => {
    try {
      const result = await processManager.forceKillPort(port);
      return {
        content: [{
          type: 'text',
          text: JSON.stringify(result, null, 2),
        }],
      };
    } catch (error) {
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({ success: false, error: error.message }, null, 2),
        }],
        isError: true,
      };
    }
  }
);

// ============================================================================
// LOGGING TOOLS
// ============================================================================

server.tool(
  'get_recent_logs',
  {
    project: z.enum(['backend', 'frontend']).describe('Which project to get logs for'),
    lines: z.number().optional().describe('Number of recent lines (default: 50)'),
    level: z.enum(['TRACE', 'DEBUG', 'INFO', 'WARN', 'ERROR', 'FATAL']).optional().describe('Filter by log level'),
  },
  async ({ project, lines = 50, level }) => {
    try {
      const serverInfo = processManager.servers.get(project);
      
      if (!serverInfo || !serverInfo.logger) {
        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              success: false,
              error: 'SERVER_NOT_FOUND',
              message: `No managed ${project} server found. Start the server first with start_dev_server.`,
            }, null, 2),
          }],
        };
      }

      const logs = serverInfo.logger.getRecentLogs(lines, level);
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            success: true,
            project,
            sessionId: serverInfo.logger.sessionId,
            logs,
          }, null, 2),
        }],
      };
    } catch (error) {
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({ success: false, error: error.message }, null, 2),
        }],
        isError: true,
      };
    }
  }
);

server.tool(
  'search_logs',
  {
    project: z.enum(['backend', 'frontend']).describe('Which project to search logs for'),
    query: z.string().describe('Regex pattern to search for'),
    limit: z.number().optional().describe('Maximum matches to return (default: 100)'),
    caseSensitive: z.boolean().optional().describe('Case sensitive search (default: false)'),
  },
  async ({ project, query, limit = 100, caseSensitive = false }) => {
    try {
      const serverInfo = processManager.servers.get(project);
      
      if (!serverInfo || !serverInfo.logger) {
        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              success: false,
              error: 'SERVER_NOT_FOUND',
              message: `No managed ${project} server found. Start the server first with start_dev_server.`,
            }, null, 2),
          }],
        };
      }

      const result = serverInfo.logger.searchLogs(query, { limit, caseSensitive });
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({ success: true, ...result }, null, 2),
        }],
      };
    } catch (error) {
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({ success: false, error: error.message }, null, 2),
        }],
        isError: true,
      };
    }
  }
);

server.tool(
  'list_log_files',
  {
    project: z.enum(['backend', 'frontend']).optional().describe('Filter by project (optional)'),
  },
  async ({ project }) => {
    try {
      const result = EnhancedLogger.listLogFiles(project);
      return {
        content: [{
          type: 'text',
          text: JSON.stringify(result, null, 2),
        }],
      };
    } catch (error) {
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({ success: false, error: error.message }, null, 2),
        }],
        isError: true,
      };
    }
  }
);

server.tool(
  'get_log_file',
  {
    filename: z.string().describe('Log file name to retrieve'),
    level: z.enum(['TRACE', 'DEBUG', 'INFO', 'WARN', 'ERROR', 'FATAL']).optional().describe('Filter by log level'),
    search: z.string().optional().describe('Search term to filter entries'),
  },
  async ({ filename, level, search }) => {
    try {
      const result = EnhancedLogger.getLogFileContent(filename, { level, search });
      return {
        content: [{
          type: 'text',
          text: JSON.stringify(result, null, 2),
        }],
      };
    } catch (error) {
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({ success: false, error: error.message }, null, 2),
        }],
        isError: true,
      };
    }
  }
);

server.tool(
  'get_server_logs',
  {
    project: z.enum(['backend', 'frontend']).describe('Which project to get logs for'),
    lines: z.number().optional().describe('Number of lines to retrieve (default: 50)'),
    level: z.enum(['TRACE', 'DEBUG', 'INFO', 'WARN', 'ERROR', 'FATAL']).optional().describe('Filter by log level'),
  },
  async ({ project, lines = 50, level }) => {
    try {
      const serverInfo = processManager.servers.get(project);
      
      if (!serverInfo || !serverInfo.logger) {
        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              success: false,
              error: 'SERVER_NOT_FOUND',
              message: `No managed ${project} server found`,
            }, null, 2),
          }],
        };
      }

      const result = serverInfo.logger.tail(lines, level);
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({ success: true, ...result }, null, 2),
        }],
      };
    } catch (error) {
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({ success: false, error: error.message }, null, 2),
        }],
        isError: true,
      };
    }
  }
);

// ============================================================================
// CLEANUP HANDLERS
// ============================================================================

process.on('SIGINT', async () => {
  await processManager.cleanup();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  await processManager.cleanup();
  process.exit(0);
});

// ============================================================================
// START THE SERVER
// ============================================================================

const transport = new StdioServerTransport();
await server.connect(transport);
