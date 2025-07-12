#!/usr/bin/env node

/**
 * Test script for Enhanced MCP Server Logging
 * 
 * This script demonstrates the new logging capabilities:
 * - Operation tracking
 * - Structured logging
 * - Performance monitoring
 * - Log searching and filtering
 * - Multiple log files (main, error, debug)
 */

const BASE_URL = 'http://localhost:9123';

async function makeRequest(endpoint, data = {}) {
  try {
    const response = await fetch(`${BASE_URL}${endpoint}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    return await response.json();
  } catch (error) {
    console.error(`Request to ${endpoint} failed:`, error.message);
    return { success: false, error: error.message };
  }
}

async function testEnhancedLogging() {
  console.log('🧪 Testing Enhanced MCP Server Logging\n');

  // 1. Check server status
  console.log('1️⃣ Checking server status...');
  try {
    const statusResponse = await fetch(`${BASE_URL}/status`);
    const status = await statusResponse.json();
    console.log(`✅ Server v${status.version} is running`);
    console.log(`📋 Enhanced logging features:`, status.loggingFeatures);
    console.log();
  } catch (error) {
    console.error('❌ Server not accessible:', error.message);
    return;
  }

  // 2. Start a backend server to generate logs
  console.log('2️⃣ Starting backend server to generate logs...');
  const startResult = await makeRequest('/startDevServer', { 
    project: 'backend',
    options: { timeout: 10000 }
  });
  
  if (startResult.success) {
    console.log(`✅ Backend server started (PID: ${startResult.pid})`);
    console.log(`📝 Log file: ${startResult.logFile}`);
  } else {
    console.log(`ℹ️ Backend server start result:`, startResult.message);
  }
  console.log();

  // Wait a moment for logs to generate
  console.log('⏳ Waiting for logs to generate...');
  await new Promise(resolve => setTimeout(resolve, 3000));

  // 3. Test recent logs retrieval
  console.log('3️⃣ Getting recent logs...');
  const recentLogs = await makeRequest('/getRecentLogs', { 
    project: 'backend', 
    lines: 10 
  });
  
  if (recentLogs.success) {
    console.log(`✅ Retrieved recent logs (Session: ${recentLogs.sessionId})`);
    console.log('📄 Recent log entries:');
    console.log(recentLogs.logs.substring(0, 500) + '...');
  } else {
    console.log('❌ Failed to get recent logs:', recentLogs.message);
  }
  console.log();

  // 4. Test performance metrics
  console.log('4️⃣ Getting performance metrics...');
  const metrics = await makeRequest('/getPerformanceMetrics', { 
    project: 'backend' 
  });
  
  if (metrics.success) {
    console.log('✅ Performance metrics retrieved:');
    console.log(`📊 Operations in progress: ${metrics.metrics.operationsInProgress}`);
    console.log(`💾 Memory usage: ${JSON.stringify(metrics.metrics.memoryUsage, null, 2)}`);
    console.log(`⏱️ Uptime: ${metrics.metrics.uptime}s`);
  } else {
    console.log('❌ Failed to get performance metrics:', metrics.message);
  }
  console.log();

  // 5. Test log searching
  console.log('5️⃣ Searching logs for "server" keyword...');
  const searchResult = await makeRequest('/searchLogs', { 
    project: 'backend',
    query: 'server',
    options: { limit: 5 }
  });
  
  if (searchResult.success) {
    console.log(`✅ Found ${searchResult.totalMatches} matches:`);
    searchResult.matches.slice(0, 3).forEach((match, i) => {
      console.log(`   ${i + 1}. ${match.substring(0, 100)}...`);
    });
  } else {
    console.log('❌ Failed to search logs:', searchResult.message);
  }
  console.log();

  // 6. Test filtered logs (ERROR level only)
  console.log('6️⃣ Getting ERROR level logs only...');
  const errorLogs = await makeRequest('/getServerLogs', { 
    project: 'backend',
    lines: 20,
    level: 'ERROR'
  });
  
  if (errorLogs.success) {
    console.log(`✅ Retrieved ${errorLogs.logs.length} ERROR level log entries`);
    if (errorLogs.logs.length > 0) {
      console.log('🔴 Error logs:');
      errorLogs.logs.slice(0, 2).forEach((log, i) => {
        console.log(`   ${i + 1}. ${log.substring(0, 100)}...`);
      });
    } else {
      console.log('✨ No error logs found - that\'s good!');
    }
  } else {
    console.log('❌ Failed to get error logs:', errorLogs.message);
  }
  console.log();

  // 7. List all log files
  console.log('7️⃣ Listing all log files...');
  const logFiles = await makeRequest('/listLogFiles', { project: 'backend' });
  
  if (logFiles.files && logFiles.files.length > 0) {
    console.log(`✅ Found ${logFiles.count} log files (Total size: ${Math.round(logFiles.totalSize / 1024)}KB):`);
    logFiles.files.forEach(file => {
      console.log(`   📄 ${file.name} (${file.type}, ${file.sizeFormatted})`);
    });
  } else {
    console.log('❌ No log files found');
  }
  console.log();

  // 8. Test server status with enhanced info
  console.log('8️⃣ Getting detailed server status...');
  const serverStatus = await makeRequest('/getServerStatus', { project: 'backend' });
  
  if (serverStatus.running) {
    console.log('✅ Server status:');
    console.log(`   🟢 Status: ${serverStatus.status}`);
    console.log(`   ⏱️ Uptime: ${serverStatus.uptime}s`);
    console.log(`   🏥 Health: ${serverStatus.health}`);
    console.log(`   📝 Log file: ${serverStatus.logFile}`);
  } else {
    console.log('❌ Server not running:', serverStatus.message);
  }
  console.log();

  // 9. Stop the server (this will generate stop logs)
  console.log('9️⃣ Stopping backend server...');
  const stopResult = await makeRequest('/stopDevServer', { project: 'backend' });
  
  if (stopResult.success) {
    console.log(`✅ Server stopped successfully`);
    console.log(`   ⏱️ Uptime was: ${stopResult.uptime}ms`);
    console.log(`   🛑 Graceful shutdown: ${stopResult.graceful}`);
  } else {
    console.log('❌ Failed to stop server:', stopResult.message);
  }
  console.log();

  console.log('🎉 Enhanced logging test completed!');
  console.log('\n📋 Summary of new logging features tested:');
  console.log('   ✅ Operation tracking with unique IDs');
  console.log('   ✅ Structured JSON logging');
  console.log('   ✅ Performance monitoring');
  console.log('   ✅ Log searching and filtering');
  console.log('   ✅ Multiple log files (main, error, debug)');
  console.log('   ✅ Enhanced process monitoring');
  console.log('   ✅ Detailed error context');
  console.log('\n💡 Check the log files in mcp-server/logs/ for detailed output!');
}

// Run the test
testEnhancedLogging().catch(console.error);