# Enhanced MCP Server v2.1

A powerful Model Context Protocol (MCP) server with advanced logging, server management, API testing, and performance monitoring capabilities.

## 🚀 Features

### **Core Capabilities**
- ✅ **Command Execution**: Secure sandboxed command execution with allow-list
- ✅ **Server Management**: Start/stop development servers with process group management
- ✅ **Enhanced Logging**: Structured JSON logging with operation tracking
- ✅ **Performance Monitoring**: Real-time memory usage and operation metrics
- ✅ **API Testing**: Built-in HTTP client for testing localhost APIs
- ✅ **Log Analysis**: Search, filter, and analyze logs with regex patterns

### **Enhanced Logging Features**
- 📊 **Structured JSON Logs**: Machine-readable log format with rich context
- 🔗 **Operation Tracking**: Unique operation IDs for tracing request flows
- 📈 **Performance Metrics**: Memory usage, timing, and system statistics
- 🎯 **Smart Categorization**: Automatic detection of errors, warnings, and info
- 📁 **Multiple Log Files**: Separate files for main, error, and debug logs
- 🔍 **Log Searching**: Regex-based search with filtering options
- ⚡ **Fast Access**: Recent logs stored in memory for quick retrieval

## 📋 API Endpoints

### **Quick Reference**

| Category | Endpoint | Method | Description |
|----------|----------|---------|-------------|
| **Core** | `/exec` | POST | Execute allowed commands |
| **Core** | `/logs/:file` | GET | Get raw log file content |
| **Core** | `/status` | GET | Server status and capabilities |
| **Server Management** | `/startDevServer` | POST | Start development server |
| **Server Management** | `/stopDevServer` | POST | Stop development server |
| **Server Management** | `/getServerStatus` | POST | Get server status |
| **Server Management** | `/stopAllServers` | POST | Stop all managed servers |
| **Server Management** | `/listManagedServers` | POST | List all managed servers |
| **Server Management** | `/forceKillPort` | POST | Force kill process on port |
| **API Testing** | `/testApiEndpoint` | POST | Test single API endpoint |
| **API Testing** | `/checkPortStatus` | POST | Check if port is available |
| **API Testing** | `/testApiWorkflow` | POST | Test multiple endpoints |
| **API Testing** | `/testCrudEndpoints` | POST | Test CRUD operations |
| **Enhanced Logging** | `/getRecentLogs` | POST | Get recent log entries |
| **Enhanced Logging** | `/searchLogs` | POST | Search logs with regex |
| **Enhanced Logging** | `/getPerformanceMetrics` | POST | Get performance metrics |
| **Enhanced Logging** | `/listLogFiles` | POST | List available log files |
| **Enhanced Logging** | `/getLogFile` | POST | Get specific log file content |
| **Enhanced Logging** | `/getServerLogs` | POST | Get server logs (legacy) |

### **Server Management**

#### Start Development Server
```http
POST /startDevServer
Content-Type: application/json

{
  "project": "backend|frontend",
  "options": {
    "timeout": 30000
  }
}
```

**Note:** The `timeout` option overrides the default project timeout. Default timeouts are 30 seconds for both backend and frontend projects.

**Response:**
```json
{
  "success": true,
  "project": "backend",
  "pid": 18,
  "port": 3001,
  "status": "running",
  "message": "backend server started successfully on port 3001",
  "startTime": "2025-07-10T07:35:59.887Z",
  "logFile": "/usr/src/app/logs/backend-2025-07-10-07-35-59.log",
  "errorLogFile": "/usr/src/app/logs/backend-2025-07-10-07-35-59-errors.log"
}
```

#### Stop Development Server
```http
POST /stopDevServer
Content-Type: application/json

{
  "project": "backend|frontend"
}
```

**Response:**
```json
{
  "success": true,
  "message": "backend server stopped successfully",
  "graceful": true,
  "uptime": 93456
}
```

#### Get Server Status
```http
POST /getServerStatus
Content-Type: application/json

{
  "project": "backend|frontend"
}
```

**Response:**
```json
{
  "running": true,
  "project": "backend",
  "pid": 18,
  "port": 3001,
  "status": "running",
  "uptime": 120,
  "health": "healthy",
  "logFile": "/usr/src/app/logs/backend-2025-07-10-07-35-59.log"
}
```

#### Stop All Servers
```http
POST /stopAllServers
Content-Type: application/json

{}
```

**Response:**
```json
{
  "stopped": ["backend", "frontend"],
  "errors": []
}
```

#### Force Kill Port
```http
POST /forceKillPort
Content-Type: application/json

{
  "port": 3001
}
```

**Response:**
```json
{
  "success": true,
  "pid": "12345",
  "message": "Killed process 12345 using port 3001"
}
```

#### List Managed Servers
```http
POST /listManagedServers
Content-Type: application/json

{}
```

**Response:**
```json
{
  "servers": {
    "backend": {
      "pid": 18,
      "port": 3001,
      "status": "running",
      "startTime": "2025-07-14T13:20:50.824Z",
      "running": true
    }
  },
  "count": 1
}
```

### **Enhanced Logging**

#### Get Recent Logs
```http
POST /getRecentLogs
Content-Type: application/json

{
  "project": "backend|frontend",
  "lines": 50,
  "level": "ERROR|WARN|INFO|DEBUG|TRACE"
}
```

**Response:**
```json
{
  "success": true,
  "project": "backend",
  "logs": "structured JSON log entries...",
  "sessionId": "140792c2-b943-401a-8c11-be1e17ee32af"
}
```

#### Search Logs
```http
POST /searchLogs
Content-Type: application/json

{
  "project": "backend|frontend",
  "query": "server.*running",
  "options": {
    "limit": 100,
    "caseSensitive": false
  }
}
```

**Response:**
```json
{
  "success": true,
  "query": "server.*running",
  "matches": ["matching log entries..."],
  "totalMatches": 5,
  "totalLines": 1250
}
```

#### Get Performance Metrics
```http
POST /getPerformanceMetrics
Content-Type: application/json

{
  "project": "backend|frontend"
}
```

**Response:**
```json
{
  "success": true,
  "project": "backend",
  "metrics": {
    "operationsInProgress": 0,
    "currentOperations": [],
    "memoryUsage": {
      "rss": 74838016,
      "heapTotal": 12804096,
      "heapUsed": 11222560,
      "external": 3648265
    },
    "uptime": 33.448720721
  }
}
```

#### List Log Files
```http
POST /listLogFiles
Content-Type: application/json

{
  "project": "backend|frontend"
}
```

**Response:**
```json
{
  "files": [
    {
      "name": "backend-2025-07-10-07-35-59.log",
      "type": "main",
      "size": 15420,
      "sizeFormatted": "15KB",
      "created": "2025-07-10T07:35:59.887Z",
      "project": "backend"
    }
  ],
  "count": 3,
  "totalSize": 45260
}
```

#### Get Log File
```http
POST /getLogFile
Content-Type: application/json

{
  "filename": "backend-2025-07-14-12-34-32.log",
  "level": "ERROR",
  "search": "optional search term"
}
```

**Response:**
```json
{
  "filename": "backend-2025-07-14-12-34-32.log",
  "path": "/usr/src/app/logs/backend-2025-07-14-12-34-32.log",
  "content": "log file content...",
  "size": 15735,
  "created": "2025-07-14T12:34:32.732Z",
  "modified": "2025-07-14T12:34:37.863Z",
  "lines": 68,
  "filtered": false
}
```

#### Get Server Logs (Legacy)
```http
POST /getServerLogs
Content-Type: application/json

{
  "project": "backend|frontend",
  "lines": 50
}
```

**Response:**
```json
{
  "success": true,
  "project": "backend",
  "logs": "log content...",
  "lines": 50
}
```

### **API Testing**

#### Test API Endpoint
```http
POST /testApiEndpoint
Content-Type: application/json

{
  "method": "GET|POST|PUT|DELETE|PATCH",
  "url": "http://localhost:3001/api/v1/teams",
  "body": { "optional": "request body" },
  "headers": { "optional": "headers" }
}
```

**Response:**
```json
{
  "success": true,
  "status": 200,
  "statusText": "OK",
  "headers": { "content-type": "application/json" },
  "body": { "response": "data" },
  "responseTime": 45,
  "url": "http://localhost:3001/api/v1/teams",
  "method": "GET"
}
```

#### Check Port Status
```http
POST /checkPortStatus
Content-Type: application/json

{
  "port": 3001
}
```

**Response:**
```json
{
  "port": 3001,
  "available": false,
  "inUse": true
}
```

#### Test API Workflow
```http
POST /testApiWorkflow
Content-Type: application/json

{
  "baseUrl": "http://localhost:3001/api/v1",
  "endpoints": ["teams", "players"],
  "testData": { "optional": "test data" }
}
```

**Response:**
```json
{
  "success": true,
  "results": [
    {
      "endpoint": "teams",
      "tests": ["GET", "POST", "PUT", "DELETE"],
      "passed": 4,
      "failed": 0
    }
  ]
}
```

#### Test CRUD Endpoints
```http
POST /testCrudEndpoints
Content-Type: application/json

{
  "baseUrl": "http://localhost:3001/api/v1",
  "entity": "teams",
  "testData": { "name": "Test Team" }
}
```

**Response:**
```json
{
  "success": true,
  "entity": "teams",
  "operations": {
    "create": { "success": true, "responseTime": 45 },
    "read": { "success": true, "responseTime": 12 },
    "update": { "success": true, "responseTime": 23 },
    "delete": { "success": true, "responseTime": 18 }
  }
}
```

### **Command Execution**

#### Execute Command
```http
POST /exec
Content-Type: application/json

{
  "command": "npx tsc src/app.ts --noEmit"
}
```

**Response:**
```json
{
  "success": true,
  "exitCode": 0,
  "stdoutPreview": "compilation successful...",
  "stderrPreview": "",
  "stdoutFile": "/logs/abc123.out",
  "stderrFile": "/logs/abc123.err"
}
```

## 🔧 Configuration

### **Environment Variables**
- `DOCKER_CONTAINER`: Set to "true" when running in Docker
- `NODE_ENV`: Environment (development/production)
- `PORT`: Server port (default: 9123)

### **Log Levels**
- `TRACE`: Detailed debugging information
- `DEBUG`: General debugging information
- `INFO`: General information messages
- `WARN`: Warning messages
- `ERROR`: Error messages
- `FATAL`: Critical error messages

## 📊 Log Format

### **Structured JSON Format**
```json
{
  "timestamp": "2025-07-10T07:36:04.487Z",
  "level": "INFO",
  "category": "SERVER_MGMT",
  "message": "Server started successfully",
  "project": "backend",
  "sessionId": "140792c2-b943-401a-8c11-be1e17ee32af",
  "operationId": "49cb1bcc-b994-4d11-9091-8f154812f068",
  "operationName": "START_SERVER",
  "context": {
    "project": "backend",
    "pid": 18,
    "port": 3001,
    "readyTime": 4600
  }
}
```

### **Log Categories**
- `SERVER_MGMT`: Server management operations
- `PROCESS`: Process lifecycle events
- `SPAWN`: Process spawning operations
- `PROCESS_KILL`: Process termination operations
- `STDOUT/STDERR`: Process output
- `OPERATION`: Operation tracking
- `PERFORMANCE`: Performance monitoring
- `API_TEST`: API testing operations

## 🚀 Getting Started

### **1. Start the MCP Server**
```bash
cd mcp-server
node server.js
```

### **2. Verify Server Status**
```bash
curl http://localhost:9123/status
```

### **3. Start a Development Server**
```bash
curl -X POST http://localhost:9123/startDevServer \
  -H "Content-Type: application/json" \
  -d '{"project": "backend"}'
```

### **4. Monitor Logs**
```bash
curl -X POST http://localhost:9123/getRecentLogs \
  -H "Content-Type: application/json" \
  -d '{"project": "backend", "lines": 10}'
```

## 🔍 Debugging Guide

### **Common Debugging Workflows**

#### **1. Server Won't Start**
```bash
# Check if port is in use
curl -X POST http://localhost:9123/checkPortStatus \
  -H "Content-Type: application/json" \
  -d '{"port": 3001}'

# Check recent error logs
curl -X POST http://localhost:9123/getRecentLogs \
  -H "Content-Type: application/json" \
  -d '{"project": "backend", "level": "ERROR"}'
```

#### **2. Performance Issues**
```bash
# Get performance metrics
curl -X POST http://localhost:9123/getPerformanceMetrics \
  -H "Content-Type: application/json" \
  -d '{"project": "backend"}'
```

#### **3. Search for Specific Issues**
```bash
# Search for error patterns
curl -X POST http://localhost:9123/searchLogs \
  -H "Content-Type: application/json" \
  -d '{"project": "backend", "query": "EADDRINUSE|ECONNREFUSED"}'
```

## 📁 File Structure

```
mcp-server/
├── server.js              # Main server entry point
├── lib/
│   ├── index.js           # Function exports
│   ├── processManager.js  # Server process management
│   ├── enhancedLogger.js  # Advanced logging system
│   ├── apiTester.js       # API testing utilities
│   └── logger.js          # Legacy logger (deprecated)
├── logs/                  # Log files directory
│   ├── backend-*.log      # Main log files
│   ├── backend-*-errors.log # Error-only log files
│   └── backend-*-debug.log  # Debug log files
├── test-enhanced-logging.js # Test script
└── README.md              # This file
```

## 🔒 Security

### **Command Allow-List**
Only specific commands are allowed for security:
- `npx vitest`
- `npx tsc --noEmit`
- `npm install/run/list`
- `npx prisma` (specific commands)
- `node` scripts in backend/scripts/
- Basic utilities (`ls`, `date`)

### **API Testing Restrictions**
- Only localhost URLs are allowed
- No external network access
- Request timeout limits enforced

## 🆕 What's New in v2.1

### **Enhanced Logging System**
- ✅ Structured JSON logging with rich context
- ✅ Operation tracking with unique IDs
- ✅ Performance monitoring and metrics
- ✅ Smart process output parsing
- ✅ Multiple log files (main, error, debug)
- ✅ Fast in-memory log access
- ✅ Regex-based log searching

### **Improved Process Management**
- ✅ Better process group handling
- ✅ Graceful shutdown with timing
- ✅ Enhanced error context
- ✅ Docker environment detection
- ✅ **NEW**: Configurable timeout support (default 30s for both projects)
- ✅ **NEW**: Timeout parameter override in startDevServer options

### **Advanced Debugging**
- ✅ Operation flow tracing
- ✅ Performance bottleneck detection
- ✅ Detailed error analysis
- ✅ Real-time monitoring

### **Complete API Coverage**
- ✅ **NEW**: All endpoints documented with examples
- ✅ **NEW**: Quick reference table for all 20+ endpoints
- ✅ **NEW**: Comprehensive parameter documentation
- ✅ **NEW**: Response format specifications

## 📞 Support

For issues or questions:
1. Check the logs using `/getRecentLogs` or `/searchLogs`
2. Review the performance metrics with `/getPerformanceMetrics`
3. Examine specific log files with `/listLogFiles` and `/getLogFile`
4. Use the test script: `node test-enhanced-logging.js`

## 📄 License

This MCP server is part of the Grassroots PWA project and follows the same licensing terms.