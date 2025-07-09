// Test script for enhanced MCP server functionality
const http = require('http');

function makeRequest(path, method = 'POST', data = null) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'localhost',
      port: 9123,
      path: path,
      method: method,
      headers: {
        'Content-Type': 'application/json',
      }
    };

    const req = http.request(options, (res) => {
      let body = '';
      res.on('data', (chunk) => {
        body += chunk;
      });
      res.on('end', () => {
        try {
          const jsonBody = JSON.parse(body);
          resolve({
            status: res.statusCode,
            body: jsonBody
          });
        } catch (e) {
          resolve({
            status: res.statusCode,
            body: body
          });
        }
      });
    });

    req.on('error', (err) => {
      reject(err);
    });

    if (data) {
      req.write(JSON.stringify(data));
    }

    req.end();
  });
}

async function testEnhancedMCP() {
  console.log('🧪 Testing Enhanced MCP Server...\n');

  try {
    // Test status endpoint
    console.log('1. Testing status endpoint...');
    const status = await makeRequest('/status', 'GET');
    console.log(`   Status: ${status.status}`);
    console.log(`   Features:`, status.body.features);
    console.log('');

    // Test port checking
    console.log('2. Testing port status check...');
    const portCheck = await makeRequest('/checkPortStatus', 'POST', { port: 3001 });
    console.log(`   Status: ${portCheck.status}`);
    console.log(`   Port 3001:`, portCheck.body);
    console.log('');

    // Test server management
    console.log('3. Testing server management...');
    const serverList = await makeRequest('/listManagedServers', 'POST');
    console.log(`   Status: ${serverList.status}`);
    console.log(`   Managed servers:`, serverList.body);
    console.log('');

    // Test starting backend server
    console.log('4. Testing backend server start...');
    const startResult = await makeRequest('/startDevServer', 'POST', { 
      project: 'backend',
      options: {}
    });
    console.log(`   Status: ${startResult.status}`);
    console.log(`   Result:`, startResult.body);
    console.log('');

    if (startResult.body.success) {
      // Wait a moment for server to start
      console.log('5. Waiting for server to be ready...');
      await new Promise(resolve => setTimeout(resolve, 3000));

      // Test server status
      console.log('6. Testing server status...');
      const statusResult = await makeRequest('/getServerStatus', 'POST', { 
        project: 'backend'
      });
      console.log(`   Status: ${statusResult.status}`);
      console.log(`   Server status:`, statusResult.body);
      console.log('');

      // Test API endpoint
      console.log('7. Testing API endpoint...');
      const apiTest = await makeRequest('/testApiEndpoint', 'POST', {
        method: 'GET',
        url: 'http://localhost:3001/api/v1/teams'
      });
      console.log(`   Status: ${apiTest.status}`);
      console.log(`   API response:`, apiTest.body);
      console.log('');

      // Test getting logs
      console.log('8. Testing log retrieval...');
      const logsResult = await makeRequest('/getServerLogs', 'POST', { 
        project: 'backend',
        lines: 10
      });
      console.log(`   Status: ${logsResult.status}`);
      console.log(`   Log info:`, {
        project: logsResult.body.project,
        logFile: logsResult.body.logFile,
        totalLines: logsResult.body.totalLines,
        logCount: logsResult.body.logs?.length
      });
      console.log('');

      // Stop the server
      console.log('9. Testing server stop...');
      const stopResult = await makeRequest('/stopDevServer', 'POST', { 
        project: 'backend'
      });
      console.log(`   Status: ${stopResult.status}`);
      console.log(`   Result:`, stopResult.body);
      console.log('');
    }

    console.log('✅ Enhanced MCP Server testing complete!');

  } catch (error) {
    console.error('❌ Test failed:', error.message);
  }
}

testEnhancedMCP();