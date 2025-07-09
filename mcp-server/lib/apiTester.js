class ApiTester {
  constructor() {
    this.defaultTimeout = 5000;
  }

  async testApiEndpoint(method, url, body = null, headers = {}) {
    try {
      // Validate URL is localhost only for security
      if (!this.isLocalhostUrl(url)) {
        return {
          success: false,
          error: 'INVALID_URL',
          message: 'Only localhost URLs are allowed for security',
          url: url
        };
      }

      const startTime = Date.now();
      
      // Prepare request options
      const requestOptions = {
        method: method.toUpperCase(),
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'MCP-Server-ApiTester/1.0',
          ...headers
        },
        signal: AbortSignal.timeout(this.defaultTimeout)
      };

      // Add body for POST/PUT/PATCH requests
      if (body && ['POST', 'PUT', 'PATCH'].includes(requestOptions.method)) {
        requestOptions.body = typeof body === 'string' ? body : JSON.stringify(body);
      }

      // Make the request
      const response = await fetch(url, requestOptions);
      const responseTime = Date.now() - startTime;

      // Parse response body
      let responseBody;
      const contentType = response.headers.get('content-type') || '';
      
      try {
        if (contentType.includes('application/json')) {
          responseBody = await response.json();
        } else {
          responseBody = await response.text();
        }
      } catch (parseError) {
        responseBody = `Failed to parse response: ${parseError.message}`;
      }

      // Extract response headers
      const responseHeaders = {};
      response.headers.forEach((value, key) => {
        responseHeaders[key] = value;
      });

      return {
        success: true,
        status: response.status,
        statusText: response.statusText,
        headers: responseHeaders,
        body: responseBody,
        responseTime: responseTime,
        url: url,
        method: requestOptions.method
      };

    } catch (error) {
      const responseTime = Date.now() - startTime;
      
      return {
        success: false,
        error: error.name || 'REQUEST_FAILED',
        message: error.message,
        responseTime: responseTime,
        url: url,
        method: method.toUpperCase()
      };
    }
  }

  async checkPortStatus(port) {
    try {
      const url = `http://localhost:${port}`;
      const response = await fetch(url, {
        method: 'GET',
        signal: AbortSignal.timeout(2000)
      });

      return {
        port: port,
        available: false,
        inUse: true,
        status: response.status,
        responding: true
      };
    } catch (error) {
      // If fetch fails, the port might be available or not responding
      return {
        port: port,
        available: true,
        inUse: false,
        responding: false,
        error: error.message
      };
    }
  }

  async testApiWorkflow(endpoints) {
    const results = [];
    let context = {}; // Store data between requests (e.g., created IDs)

    for (const endpoint of endpoints) {
      try {
        // Replace placeholders in URL and body with context values
        const processedEndpoint = this.processEndpointWithContext(endpoint, context);
        
        const result = await this.testApiEndpoint(
          processedEndpoint.method,
          processedEndpoint.url,
          processedEndpoint.body,
          processedEndpoint.headers
        );

        // Store result data in context for next requests
        if (result.success && result.body && typeof result.body === 'object') {
          if (result.body.id) {
            context[`${endpoint.name || 'last'}_id`] = result.body.id;
          }
          if (endpoint.storeAs) {
            context[endpoint.storeAs] = result.body;
          }
        }

        results.push({
          name: endpoint.name || `${processedEndpoint.method} ${processedEndpoint.url}`,
          ...result
        });

        // Stop on first failure if specified
        if (!result.success && endpoint.stopOnFailure) {
          break;
        }

        // Wait between requests if specified
        if (endpoint.delay) {
          await new Promise(resolve => setTimeout(resolve, endpoint.delay));
        }

      } catch (error) {
        results.push({
          name: endpoint.name || `${endpoint.method} ${endpoint.url}`,
          success: false,
          error: 'WORKFLOW_ERROR',
          message: error.message
        });

        if (endpoint.stopOnFailure) {
          break;
        }
      }
    }

    return {
      success: results.every(r => r.success),
      results: results,
      context: context,
      totalRequests: results.length,
      successfulRequests: results.filter(r => r.success).length
    };
  }

  processEndpointWithContext(endpoint, context) {
    const processed = { ...endpoint };

    // Replace placeholders in URL
    if (processed.url) {
      processed.url = this.replacePlaceholders(processed.url, context);
    }

    // Replace placeholders in body
    if (processed.body && typeof processed.body === 'object') {
      processed.body = JSON.parse(
        this.replacePlaceholders(JSON.stringify(processed.body), context)
      );
    }

    return processed;
  }

  replacePlaceholders(text, context) {
    return text.replace(/\{\{(\w+)\}\}/g, (match, key) => {
      return context[key] || match;
    });
  }

  isLocalhostUrl(url) {
    try {
      const urlObj = new URL(url);
      const hostname = urlObj.hostname.toLowerCase();
      
      return hostname === 'localhost' || 
             hostname === '127.0.0.1' || 
             hostname === '::1' ||
             hostname.endsWith('.localhost');
    } catch (error) {
      return false;
    }
  }

  formatResponse(response) {
    const formatted = {
      status: response.status,
      success: response.success,
      responseTime: `${response.responseTime}ms`
    };

    if (response.success) {
      formatted.statusText = response.statusText;
      formatted.headers = response.headers;
      formatted.body = response.body;
    } else {
      formatted.error = response.error;
      formatted.message = response.message;
    }

    return formatted;
  }

  // Utility method for common API testing patterns
  async testCrudEndpoints(baseUrl, entityName, testData) {
    const workflow = [
      {
        name: `List ${entityName}s`,
        method: 'GET',
        url: baseUrl
      },
      {
        name: `Create ${entityName}`,
        method: 'POST',
        url: baseUrl,
        body: testData.create,
        storeAs: 'created_entity'
      },
      {
        name: `Get ${entityName} by ID`,
        method: 'GET',
        url: `${baseUrl}/{{created_entity_id}}`
      },
      {
        name: `Update ${entityName}`,
        method: 'PUT',
        url: `${baseUrl}/{{created_entity_id}}`,
        body: testData.update
      },
      {
        name: `Delete ${entityName}`,
        method: 'DELETE',
        url: `${baseUrl}/{{created_entity_id}}`
      }
    ];

    return await this.testApiWorkflow(workflow);
  }
}

export default ApiTester;