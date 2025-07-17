// server.js  — MCP v2 Enhanced
import express from 'express';
import cors from 'cors';
import fs from 'fs';
import path from 'path';
import { exec } from 'child_process';

// Import our enhanced functionality
import mcpFunctions from './lib/index.js';

const PORT = 9123;
const EXEC_TIMEOUT = 60_000;
const OUTPUT_DIR = '/workspace/.ai-outputs';

fs.mkdirSync(OUTPUT_DIR, { recursive: true });
const cdPrefix = String.raw`(?:cd\s+(?:\.?[\w\/\-]+(?:\/[\w\-]+)*)\s+&&\s+)?`;
const nodeScript = String.raw`${cdPrefix}node\s+\.?\/?(backend|scripts)\/[\w\-]+\.js$`;
const tsxScript  = String.raw`${cdPrefix}npx\s+tsx\s+\.?\/?(backend|scripts)\/[\w\-]+\.js$`;

/* ---------- allow-list ---------------------------------------------------- */
const allowList = [
  new RegExp(`^${cdPrefix}npx\\s+vitest\\b`, 'i'),
  new RegExp(`^${cdPrefix}npx\\s+tsc\\b.*--noEmit\\b`, 'i'),
  new RegExp(`^${cdPrefix}npm\\s+install\\b`, 'i'),
  new RegExp(`^${cdPrefix}npm\\s+run\\b`, 'i'),
  new RegExp(`^${cdPrefix}npm\\s+list\\b`, 'i'),
  new RegExp(`^${cdPrefix}node\\s+-v(?:ersion)?$`, 'i'),
  new RegExp(`^${cdPrefix}ls\\b`, 'i'),
  new RegExp(`^${cdPrefix}npx\\s+prisma\\s+(generate|format|validate|migrate\\s+(dev|status)|db\\s+pull)\\b`, 'i'),
  new RegExp(`^${cdPrefix}date\\b`, 'i'),
  new RegExp(`^${cdPrefix}grep\\b.*`, 'i'),
  new RegExp(`^${cdPrefix}cat\\b.*`, 'i'),
  new RegExp(`^${cdPrefix}pwd\\b`, 'i'),
  new RegExp(`^${cdPrefix}echo\\b.*`, 'i'),
  new RegExp(`^${cdPrefix}head\\b.*`, 'i'),
  new RegExp(`^${cdPrefix}tail\\b.*`, 'i'),
  new RegExp(`^${cdPrefix}which\\b.*`, 'i'),
  new RegExp(`^${cdPrefix}whoami\\b`, 'i'),
  new RegExp(nodeScript, 'i'),
  new RegExp(tsxScript, 'i')
];
const isAllowed = cmd => allowList.some(re => re.test(cmd.trim()));

/* ---------- express app --------------------------------------------------- */
const app = express();
app.use(express.json());
app.use(cors());

/* ---------- GET /logs/:file  ----------------------------------------------
 *  • Raw binary by default
 *  • Add ?b64=1  →  JSON  { base64: "<data>" }
 * ------------------------------------------------------------------------- */
app.get('/logs/:file', (req, res) => {
  const filePath = path.join(OUTPUT_DIR, req.params.file);
  if (!fs.existsSync(filePath)) return res.sendStatus(404);

  if (req.query.b64) {
    const data = fs.readFileSync(filePath);
    return res.json({ base64: data.toString('base64') });
  }
  res.sendFile(filePath);
});

/* ---------- POST /exec ---------------------------------------------------- */
app.post('/exec', (req, res) => {
  const { command = '' } = req.body || {};
  if (!command)             return res.status(400).json({ error: 'missing command' });
  if (!isAllowed(command))  return res.status(403).json({ error: 'command not permitted' });

  exec(
    command,
    { shell: true, cwd: '/workspace', timeout: EXEC_TIMEOUT, windowsHide: true, encoding: 'buffer' },
    (err, stdoutBuf, stderrBuf) => {
      const id   = Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8);
      const out  = `${id}.out`;
      const errF = `${id}.err`;
      fs.writeFileSync(path.join(OUTPUT_DIR, out),  stdoutBuf);
      fs.writeFileSync(path.join(OUTPUT_DIR, errF), stderrBuf);

      const preview = buf =>
        buf.toString('utf8').replace(/[^\x09\x0A\x0D\x20-\x7E]/g, '').slice(0, 1000);

      res.json({
        success: !err,
        exitCode: err?.code ?? 0,
        stdoutPreview: preview(stdoutBuf),
        stderrPreview: preview(stderrBuf),
        stdoutFile: `/logs/${out}`,
        stderrFile: `/logs/${errF}`
      });
    }
  );
});

/* ---------- Enhanced MCP Functions ------------------------------------ */

// Server Management
app.post('/startDevServer', async (req, res) => {
  try {
    const result = await mcpFunctions.startDevServer(req.body);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: 'INTERNAL_ERROR', message: error.message });
  }
});

app.post('/stopDevServer', async (req, res) => {
  try {
    const result = await mcpFunctions.stopDevServer(req.body);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: 'INTERNAL_ERROR', message: error.message });
  }
});

app.post('/getServerStatus', async (req, res) => {
  try {
    const result = await mcpFunctions.getServerStatus(req.body);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: 'INTERNAL_ERROR', message: error.message });
  }
});

app.post('/stopAllServers', async (req, res) => {
  try {
    const result = await mcpFunctions.stopAllServers();
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: 'INTERNAL_ERROR', message: error.message });
  }
});

app.post('/forceKillPort', async (req, res) => {
  try {
    const { port } = req.body;
    if (!port) {
      return res.status(400).json({ error: 'PORT_REQUIRED', message: 'Port number is required' });
    }
    const result = await mcpFunctions.forceKillPort(port);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: 'INTERNAL_ERROR', message: error.message });
  }
});

app.post('/listManagedServers', async (req, res) => {
  try {
    const result = await mcpFunctions.listManagedServers();
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: 'INTERNAL_ERROR', message: error.message });
  }
});

// API Testing
app.post('/testApiEndpoint', async (req, res) => {
  try {
    const result = await mcpFunctions.testApiEndpoint(req.body);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: 'INTERNAL_ERROR', message: error.message });
  }
});

app.post('/checkPortStatus', async (req, res) => {
  try {
    const result = await mcpFunctions.checkPortStatus(req.body);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: 'INTERNAL_ERROR', message: error.message });
  }
});

app.post('/testApiWorkflow', async (req, res) => {
  try {
    const result = await mcpFunctions.testApiWorkflow(req.body);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: 'INTERNAL_ERROR', message: error.message });
  }
});

app.post('/testCrudEndpoints', async (req, res) => {
  try {
    const result = await mcpFunctions.testCrudEndpoints(req.body);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: 'INTERNAL_ERROR', message: error.message });
  }
});

// Logging
app.post('/getServerLogs', async (req, res) => {
  try {
    const result = await mcpFunctions.getServerLogs(req.body);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: 'INTERNAL_ERROR', message: error.message });
  }
});

app.post('/listLogFiles', async (req, res) => {
  try {
    const result = await mcpFunctions.listLogFiles(req.body);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: 'INTERNAL_ERROR', message: error.message });
  }
});

app.post('/getLogFile', async (req, res) => {
  try {
    const result = await mcpFunctions.getLogFile(req.body);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: 'INTERNAL_ERROR', message: error.message });
  }
});

// Enhanced logging endpoints
app.post('/searchLogs', async (req, res) => {
  try {
    const result = await mcpFunctions.searchLogs(req.body);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: 'INTERNAL_ERROR', message: error.message });
  }
});

app.post('/getPerformanceMetrics', async (req, res) => {
  try {
    const result = await mcpFunctions.getPerformanceMetrics(req.body);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: 'INTERNAL_ERROR', message: error.message });
  }
});

app.post('/getRecentLogs', async (req, res) => {
  try {
    const result = await mcpFunctions.getRecentLogs(req.body);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: 'INTERNAL_ERROR', message: error.message });
  }
});

// Enhanced status endpoint
app.get('/status', (req, res) => {
  res.json({
    status: 'running',
    version: '2.1.0',
    features: {
      originalExec: true,
      serverManagement: true,
      apiTesting: true,
      enhancedLogging: true,
      operationTracking: true,
      performanceMonitoring: true,
      structuredLogs: true
    },
    endpoints: {
      exec: '/exec',
      logs: '/logs/*',
      serverManagement: ['/startDevServer', '/stopDevServer', '/getServerStatus', '/stopAllServers', '/listManagedServers'],
      apiTesting: ['/testApiEndpoint', '/checkPortStatus', '/testApiWorkflow', '/testCrudEndpoints'],
      enhancedLogging: ['/getServerLogs', '/listLogFiles', '/getLogFile', '/searchLogs', '/getPerformanceMetrics', '/getRecentLogs']
    },
    loggingFeatures: {
      levels: ['TRACE', 'DEBUG', 'INFO', 'WARN', 'ERROR', 'FATAL'],
      structured: true,
      operationTracking: true,
      performanceMetrics: true,
      processMonitoring: true,
      searchAndFilter: true,
      multipleLogFiles: ['main', 'error', 'debug']
    }
  });
});

// Cleanup on shutdown
process.on('SIGINT', async () => {
  console.log('\nShutting down MCP server...');
  await mcpFunctions.cleanup();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('\nShutting down MCP server...');
  await mcpFunctions.cleanup();
  process.exit(0);
});

app.listen(PORT, () => {
  console.log(`🚀 Enhanced MCP Server v2.1 listening on http://localhost:${PORT}`);
  console.log(`📋 Original exec endpoint: /exec`);
  console.log(`🔧 Server management: /startDevServer, /stopDevServer, /getServerStatus`);
  console.log(`🧪 API testing: /testApiEndpoint, /testApiWorkflow`);
  console.log(`📝 Enhanced logging: /getServerLogs, /searchLogs, /getPerformanceMetrics`);
  console.log(`📊 Status: /status`);
  console.log(`📁 Logs: /logs/*`);
  console.log(`✨ New features: Operation tracking, structured logs, performance monitoring`);
});
