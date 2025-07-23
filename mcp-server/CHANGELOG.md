# MCP Server Changelog

## v2.1.1 - UTF-8 Safe Logging & API Cleanup

### 🛡️ **Fixed UTF-8 Decoding Issues**
- **RESOLVED**: `'utf-8' codec can't decode byte 0x83 in position 128: invalid start byte` errors
- **Added**: Automatic base64 encoding for command execution logs (`.out` and `.err` files)
- **Enhanced**: Smart file type detection in `/getLogFile` endpoint

### 🧹 **API Simplification**
- **Removed**: Redundant `/getCommandLog` endpoint
- **Enhanced**: `/getLogFile` now handles ALL log file types intelligently
- **Improved**: Single endpoint with auto-detection for better user experience

### 🔧 **Technical Improvements**
- **Added**: Safe UTF-8 reading methods with latin1 fallback
- **Added**: Character sanitization for problematic control characters
- **Enhanced**: Binary content detection and handling
- **Fixed**: Cross-platform path handling for `.ai-outputs` directory

### 📚 **Documentation Updates**
- **Updated**: README.md with comprehensive examples
- **Added**: Troubleshooting section for UTF-8 issues
- **Enhanced**: Clear explanation of log file types and handling
- **Added**: Code examples for decoding base64 content

### 🎯 **Key Benefits**
- ✅ **No more UTF-8 errors** when accessing command execution logs
- ✅ **Simpler API** with intelligent auto-detection
- ✅ **Preserved functionality** - filtering and search still work
- ✅ **Better user experience** - one endpoint for all log files
- ✅ **Robust error handling** for both text and binary content

### 🔄 **Migration Guide**
**No breaking changes!** Existing code continues to work:

```powershell
# This still works exactly the same
Invoke-RestMethod -Uri "http://localhost:9123/getLogFile" -Method POST -ContentType "application/json" -Body '{"filename": "your-log-file.out"}'
```

**Response format changes:**
- Server logs: Still return `content` field with UTF-8 text
- Command execution logs: Now return `contentBase64` field with base64-encoded content

### 📋 **Files Modified**
- `mcp-server/server.js` - Removed `/getCommandLog` endpoint
- `mcp-server/lib/index.js` - Enhanced `/getLogFile` with inline command log handling
- `mcp-server/lib/enhancedLogger.js` - Added safe UTF-8 reading methods
- `mcp-server/lib/logger.js` - Added safe UTF-8 reading methods
- `mcp-server/README.md` - Comprehensive documentation updates

---

## v2.1.0 - Enhanced Logging System

### 🚀 **New Features**
- Structured JSON logging with operation tracking
- Performance monitoring and metrics
- Multiple log files (main, error, debug)
- Regex-based log searching
- Smart process output parsing

### 🔧 **Improvements**
- Better process group handling
- Graceful shutdown with timing
- Enhanced error context
- Docker environment detection

### 📋 **New Endpoints**
- `/getRecentLogs` - Fast access to recent log entries
- `/searchLogs` - Regex-based log searching
- `/getPerformanceMetrics` - Real-time performance data
- `/listLogFiles` - Browse available log files