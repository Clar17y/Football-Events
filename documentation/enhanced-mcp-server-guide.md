# Enhanced MCP Server v2.0 - Complete Guide

**Created:** 2025-07-08  
**Status:** OPERATIONAL  
**Version:** 2.0.0  
**Impact:** Revolutionary development workflow enhancement

## 🎉 **Overview**

The Enhanced MCP Server v2.0 provides integrated development server management and API testing capabilities, eliminating the need for temporary test files and external tools. This represents a major leap forward in development workflow efficiency.

## 🚀 **Key Features**

### **✅ Server Management**
- **Programmatic Control** - Start/stop backend and frontend servers via API calls
- **Health Monitoring** - Real-time server status, uptime, and health checks
- **Process Safety** - Only manages processes it spawns, proper cleanup on exit
- **Docker Integration** - Works seamlessly in containerized environment

### **✅ API Testing**
- **Direct HTTP Requests** - GET, POST, PUT, DELETE without external tools
- **Response Parsing** - JSON and text response handling with timing metrics
- **Workflow Testing** - Multi-step API testing with context passing
- **CRUD Automation** - Complete entity lifecycle testing

### **✅ Logging & Debugging**
- **File-based Logs** - Persistent logs with timestamp and log levels
- **Real-time Capture** - Pipe server stdout/stderr to log files
- **Log Retrieval** - Access recent logs or full log files
- **Log Management** - List and browse historical log files

## 📋 **Available Endpoints**

### **Server Management**
```javascript
POST /startDevServer     - Start backend or frontend dev server
POST /stopDevServer      - Stop managed dev server
POST /getServerStatus    - Check server health and status
POST /stopAllServers     - Emergency cleanup - stop all servers
POST /listManagedServers - List all managed servers
```

### **API Testing**
```javascript
POST /testApiEndpoint    - Make HTTP requests to APIs
POST /checkPortStatus    - Check if port is available
POST /testApiWorkflow    - Test multiple endpoints in sequence
POST /testCrudEndpoints  - Test complete CRUD workflows
```

### **Logging & Debugging**
```javascript
POST /getServerLogs      - Get recent server logs
POST /listLogFiles       - List available log files
POST /getLogFile         - Get specific log file content
```

### **Utility**
```javascript
GET  /status            - Enhanced server status and capabilities
POST /exec              - Original command execution (legacy)
GET  /logs/*            - Original log file access (legacy)
```

## 🛠 **Usage Examples**

### **Start Backend Server**
```powershell
Invoke-RestMethod -Uri "http://localhost:9123/startDevServer" -Method POST -ContentType "application/json" -Body '{"project": "backend"}'

# Response:
{
  "success": true,
  "project": "backend",
  "pid": 18,
  "port": 3001,
  "status": "running",
  "message": "backend server started successfully on port 3001"
}
```

### **Test API Endpoint**
```powershell
Invoke-RestMethod -Uri "http://localhost:9123/testApiEndpoint" -Method POST -ContentType "application/json" -Body '{"method": "GET", "url": "http://localhost:3001/api/v1/teams"}'

# Response:
{
  "success": true,
  "status": 200,
  "body": {"data": [], "pagination": {...}},
  "responseTime": 44,
  "headers": {...}
}
```

### **Create Team via API**
```powershell
Invoke-RestMethod -Uri "http://localhost:9123/testApiEndpoint" -Method POST -ContentType "application/json" -Body '{"method": "POST", "url": "http://localhost:3001/api/v1/teams", "body": {"name": "Test FC", "homePrimary": "#FF0000"}}'

# Response:
{
  "success": true,
  "status": 201,
  "body": {"id": "e6f34f7b-47fd-4f11-909c-b275046fc347", "name": "Test FC", ...},
  "responseTime": 17
}
```

### **Test Complete CRUD Workflow**
```powershell
Invoke-RestMethod -Uri "http://localhost:9123/testCrudEndpoints" -Method POST -ContentType "application/json" -Body '{"baseUrl": "http://localhost:3001/api/v1/teams", "entityName": "team", "testData": {"create": {"name": "CRUD Test FC", "homePrimary": "#FF0000"}, "update": {"name": "Updated FC"}}}'

# Response:
{
  "success": true,
  "results": [
    {"name": "List teams", "success": true, "status": 200, "responseTime": 4},
    {"name": "Create team", "success": true, "status": 201, "responseTime": 5},
    {"name": "Get team by ID", "success": true, "status": 200, "responseTime": 3},
    {"name": "Update team", "success": true, "status": 200, "responseTime": 4},
    {"name": "Delete team", "success": true, "status": 204, "responseTime": 2}
  ],
  "totalRequests": 5,
  "successfulRequests": 5
}
```

### **Check Server Status**
```powershell
Invoke-RestMethod -Uri "http://localhost:9123/getServerStatus" -Method POST -ContentType "application/json" -Body '{"project": "backend"}'

# Response:
{
  "running": true,
  "project": "backend",
  "pid": 18,
  "port": 3001,
  "status": "running",
  "uptime": 156,
  "health": "healthy",
  "healthDetails": {"healthy": true, "status": 200, "responseTime": 5}
}
```

### **Get Server Logs**
```powershell
Invoke-RestMethod -Uri "http://localhost:9123/getServerLogs" -Method POST -ContentType "application/json" -Body '{"project": "backend", "lines": 10}'

# Response:
{
  "success": true,
  "project": "backend",
  "logFile": "/usr/src/app/logs/backend-2025-07-08-22-20-45.log",
  "logs": [
    "2025-07-08T22:20:45.123Z [INFO] [BACKEND] Server starting on port 3001",
    "2025-07-08T22:20:46.456Z [INFO] [BACKEND] Database connected successfully",
    "2025-07-08T22:20:47.789Z [INFO] [BACKEND] Server running on port 3001"
  ],
  "totalLines": 13
}
```

## 🎯 **Development Workflow**

### **Typical API Development Session:**
1. **Start Server**: `POST /startDevServer` with `{"project": "backend"}`
2. **Test Endpoints**: Use `POST /testApiEndpoint` for individual API calls
3. **Run Workflows**: Use `POST /testCrudEndpoints` for complete testing
4. **Monitor Health**: Use `POST /getServerStatus` for health checks
5. **Debug Issues**: Use `POST /getServerLogs` for troubleshooting
6. **Stop Server**: `POST /stopDevServer` when done (or leave running)

### **Benefits Over Traditional Approach:**
- ✅ **No Temporary Files** - No need to create test scripts
- ✅ **Integrated Testing** - API testing built into development workflow
- ✅ **Real-time Feedback** - Immediate response times and health status
- ✅ **Persistent Logging** - All server output captured and retrievable
- ✅ **Process Safety** - Proper cleanup and conflict detection

## 📊 **Performance Metrics**

### **Demonstrated Performance:**
- **Server Startup**: ~20-30 seconds (includes npm install)
- **Health Checks**: 5ms average response time
- **API Requests**: 4-17ms average response time
- **CRUD Workflows**: 5 operations in ~20ms total

### **Resource Usage:**
- **Memory**: Minimal overhead (runs in existing MCP container)
- **CPU**: Low impact (only during active operations)
- **Storage**: Log files grow over time (manual cleanup available)

## 🔧 **Technical Implementation**

### **Architecture:**
- **ProcessManager**: Handles server lifecycle and process management
- **ApiTester**: HTTP request handling with security constraints
- **ServerLogger**: File-based logging with real-time capture
- **Docker Integration**: Works seamlessly in containerized environment

### **Security Features:**
- **Localhost Only**: API testing restricted to localhost URLs
- **Process Isolation**: Only manages processes it spawns
- **Workspace Restriction**: Operations limited to workspace directory
- **Graceful Cleanup**: Proper shutdown handling

### **File Structure:**
```
mcp-server/
├── server.js              # Enhanced main server
├── lib/
│   ├── processManager.js  # Server lifecycle management
│   ├── apiTester.js       # HTTP request handling
│   ├── logger.js          # File-based logging
│   └── index.js           # Function exports
├── logs/                  # Server log files
│   ├── backend-*.log
│   └── frontend-*.log
└── Dockerfile             # Enhanced with Docker CLI
```

## 🚀 **Future Enhancements**

### **Planned Features:**
- **Frontend Server Support** - Start/manage Vite development server
- **WebSocket Support** - Real-time event streaming
- **Performance Monitoring** - Advanced metrics and alerting
- **Test Automation** - Scheduled API testing and validation

### **Integration Opportunities:**
- **CI/CD Pipeline** - Automated testing in deployment pipeline
- **Monitoring Dashboard** - Real-time server and API status
- **Load Testing** - Performance testing capabilities
- **API Documentation** - Auto-generated docs from test results

## 📋 **Troubleshooting**

### **Common Issues:**
1. **Server Won't Start**: Check logs with `POST /getServerLogs`
2. **API Tests Fail**: Verify server is running with `POST /getServerStatus`
3. **Port Conflicts**: Use `POST /checkPortStatus` to verify availability
4. **Process Cleanup**: Use `POST /stopAllServers` for emergency cleanup

### **Debug Commands:**
```powershell
# Check MCP server status
Invoke-RestMethod -Uri "http://localhost:9123/status" -Method GET

# List all managed servers
Invoke-RestMethod -Uri "http://localhost:9123/listManagedServers" -Method POST -ContentType "application/json" -Body '{}'

# Check specific port
Invoke-RestMethod -Uri "http://localhost:9123/checkPortStatus" -Method POST -ContentType "application/json" -Body '{"port": 3001}'
```

---

**Status:** Fully Operational  
**Next Steps:** Continue API development with enhanced workflow  
**Impact:** Revolutionary improvement to development efficiency