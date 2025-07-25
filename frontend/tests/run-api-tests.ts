/**
 * API Test Runner
 * Runs all frontend API integration tests with proper setup and reporting
 */

import { execSync } from 'child_process';
import { existsSync } from 'fs';

const API_TESTS = [
  'tests/integration/api-services.test.ts',
  'tests/integration/teams-api-integration.test.ts', 
  'tests/integration/seasons-api-integration.test.ts',
  'tests/integration/players-api-integration.test.ts',
  'tests/integration/matches-api-integration.test.ts',
  'tests/integration/all-apis-integration.test.ts'
];

const COLORS = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m'
};

function colorize(text: string, color: keyof typeof COLORS): string {
  return `${COLORS[color]}${text}${COLORS.reset}`;
}

function printHeader() {
  console.log(colorize('\n🧪 Frontend API Integration Tests', 'cyan'));
  console.log(colorize('=====================================', 'cyan'));
  console.log('');
}

function printTestInfo() {
  console.log(colorize('📋 Test Coverage:', 'blue'));
  console.log('  ✅ Authentication API (login, logout, profile)');
  console.log('  ✅ Teams API (CRUD, search, validation)');
  console.log('  ✅ Seasons API (CRUD, search, date validation)');
  console.log('  ✅ Players API (CRUD, search, filtering)');
  console.log('  ✅ Matches API (retrieval, filtering, relationships)');
  console.log('  ✅ Cross-API workflows and consistency');
  console.log('');
}

function checkPrerequisites(): boolean {
  console.log(colorize('🔍 Checking prerequisites...', 'yellow'));
  
  // Check if backend is running
  try {
    execSync('curl -f http://localhost:3001/api/v1/health', { stdio: 'pipe' });
    console.log('  ✅ Backend server is running');
  } catch (error) {
    console.log('  ❌ Backend server is not running');
    console.log('     Please start the backend server: npm run dev (in backend folder)');
    return false;
  }

  // Check if test files exist
  const missingFiles = API_TESTS.filter(test => !existsSync(test));
  if (missingFiles.length > 0) {
    console.log('  ❌ Missing test files:');
    missingFiles.forEach(file => console.log(`     - ${file}`));
    return false;
  }
  console.log('  ✅ All test files found');

  console.log('');
  return true;
}

function runTests(): boolean {
  console.log(colorize('🚀 Running API tests...', 'green'));
  console.log('');

  try {
    // Run all API tests
    const testPattern = API_TESTS.join(' ');
    execSync(`npx vitest run ${testPattern} --reporter=verbose`, { 
      stdio: 'inherit',
      cwd: process.cwd()
    });
    
    console.log('');
    console.log(colorize('✅ All API tests completed successfully!', 'green'));
    return true;
  } catch (error) {
    console.log('');
    console.log(colorize('❌ Some API tests failed', 'red'));
    return false;
  }
}

function printSummary(success: boolean) {
  console.log('');
  console.log(colorize('📊 Test Summary', 'magenta'));
  console.log(colorize('===============', 'magenta'));
  
  if (success) {
    console.log(colorize('🎉 All frontend API tests passed!', 'green'));
    console.log('');
    console.log('Your frontend API services are working correctly:');
    console.log('  • Authentication flows properly');
    console.log('  • CRUD operations work for all entities');
    console.log('  • Error handling is consistent');
    console.log('  • Search and pagination function correctly');
    console.log('  • Cross-API workflows are validated');
  } else {
    console.log(colorize('⚠️  Some tests failed', 'red'));
    console.log('');
    console.log('Common issues to check:');
    console.log('  • Backend server is running and accessible');
    console.log('  • Database is properly seeded with test data');
    console.log('  • Test user credentials are correct');
    console.log('  • Network connectivity to backend');
  }
  console.log('');
}

// Main execution
async function main() {
  printHeader();
  printTestInfo();
  
  if (!checkPrerequisites()) {
    process.exit(1);
  }
  
  const success = runTests();
  printSummary(success);
  
  process.exit(success ? 0 : 1);
}

main().catch(error => {
  console.error(colorize('💥 Test runner failed:', 'red'), error);
  process.exit(1);
});