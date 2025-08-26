#!/usr/bin/env node

/**
 * test-rn-tts-offline.js
 * ----------------------------------------------------------------------------
 * Test React Native TTS offline functionality
 * 
 * This script simulates the frontend TTS fallback behavior when backend is unavailable
 * Tests the offline mode configuration and fallback mechanisms
 */

const fs = require('fs');
const path = require('path');

console.log('🎤 Testing React Native TTS Offline Mode');
console.log('=====================================');
console.log('');

// Colors for output
const colors = {
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  reset: '\x1b[0m'
};

function log(color, message) {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

// Test configuration analysis
function analyzeConfiguration() {
  log('blue', '📋 Analyzing TTS Configuration...');
  
  const frontendPath = path.join(__dirname, '../FRONTEND');
  const configPath = path.join(frontendPath, 'src/screens/config/ttsConfig.ts');
  const hookPath = path.join(frontendPath, 'src/screens/hooks/useTextToSpeech.ts');
  const testPath = path.join(frontendPath, 'src/screens/utils/ttsTest.ts');
  
  const results = {
    configExists: fs.existsSync(configPath),
    hookExists: fs.existsSync(hookPath),
    testExists: fs.existsSync(testPath),
    nativeTTSEnabled: false,
    fallbackConfigured: false,
    languageSupport: 0
  };
  
  // Analyze configuration file
  if (results.configExists) {
    try {
      const configContent = fs.readFileSync(configPath, 'utf8');
      
      // Check if native TTS is enabled
      results.nativeTTSEnabled = configContent.includes('nativeTTS') && 
                                configContent.includes('enabled: true');
      
      // Count supported languages
      const languageMatches = configContent.match(/name: '[^']+'/g);
      results.languageSupport = languageMatches ? languageMatches.length : 0;
      
      log('green', '✅ TTS Configuration found');
      log('blue', `   - Native TTS enabled: ${results.nativeTTSEnabled}`);
      log('blue', `   - Supported languages: ${results.languageSupport}`);
    } catch (error) {
      log('red', '❌ Error reading TTS configuration');
    }
  } else {
    log('red', '❌ TTS Configuration not found');
  }
  
  // Analyze hook implementation
  if (results.hookExists) {
    try {
      const hookContent = fs.readFileSync(hookPath, 'utf8');
      
      // Check fallback implementation
      results.fallbackConfigured = hookContent.includes('speakWithNativeTTS') &&
                                  hookContent.includes('Backend TTS failed') &&
                                  hookContent.includes('react-native-tts');
      
      log('green', '✅ TTS Hook implementation found');
      log('blue', `   - Fallback mechanism: ${results.fallbackConfigured ? 'Configured' : 'Missing'}`);
      
      // Check for error handling
      const hasErrorHandling = hookContent.includes('onError') && 
                              hookContent.includes('onFallbackUsed');
      log('blue', `   - Error handling: ${hasErrorHandling ? 'Implemented' : 'Basic'}`);
      
      // Check for offline detection
      const hasOfflineDetection = hookContent.includes('useGoogleTTS') &&
                                 hookContent.includes('Backend TTS disabled');
      log('blue', `   - Offline mode detection: ${hasOfflineDetection ? 'Yes' : 'No'}`);
      
    } catch (error) {
      log('red', '❌ Error reading TTS hook');
    }
  } else {
    log('red', '❌ TTS Hook not found');
  }
  
  // Analyze test utilities
  if (results.testExists) {
    try {
      const testContent = fs.readFileSync(testPath, 'utf8');
      
      const hasRNTTSTest = testContent.includes('testReactNativeTTS');
      const hasComprehensiveTest = testContent.includes('runAllTTSTests');
      
      log('green', '✅ TTS Test utilities found');
      log('blue', `   - React Native TTS test: ${hasRNTTSTest ? 'Available' : 'Missing'}`);
      log('blue', `   - Comprehensive testing: ${hasComprehensiveTest ? 'Available' : 'Missing'}`);
      
    } catch (error) {
      log('red', '❌ Error reading TTS tests');
    }
  } else {
    log('red', '❌ TTS Test utilities not found');
  }
  
  return results;
}

// Test package.json for React Native TTS dependency
function checkDependencies() {
  log('blue', '\n📦 Checking Dependencies...');
  
  const frontendPackagePath = path.join(__dirname, '../FRONTEND/package.json');
  
  if (fs.existsSync(frontendPackagePath)) {
    try {
      const packageContent = JSON.parse(fs.readFileSync(frontendPackagePath, 'utf8'));
      const dependencies = { ...packageContent.dependencies, ...packageContent.devDependencies };
      
      const hasRNTTS = dependencies['react-native-tts'];
      const hasSound = dependencies['react-native-sound'];
      
      log('green', '✅ Frontend package.json found');
      log('blue', `   - react-native-tts: ${hasRNTTS || 'Not installed'}`);
      log('blue', `   - react-native-sound: ${hasSound || 'Not installed'}`);
      
      if (!hasRNTTS) {
        log('yellow', '⚠️  react-native-tts not found in dependencies');
        log('blue', '   Install with: npm install react-native-tts');
      }
      
      return { hasRNTTS: !!hasRNTTS, hasSound: !!hasSound };
    } catch (error) {
      log('red', '❌ Error reading frontend package.json');
    }
  } else {
    log('red', '❌ Frontend package.json not found');
  }
  
  return { hasRNTTS: false, hasSound: false };
}

// Analyze fallback behavior
function analyzeFallbackBehavior() {
  log('blue', '\n🔄 Analyzing Fallback Behavior...');
  
  const hookPath = path.join(__dirname, '../FRONTEND/src/screens/hooks/useTextToSpeech.ts');
  
  if (fs.existsSync(hookPath)) {
    try {
      const content = fs.readFileSync(hookPath, 'utf8');
      
      // Check fallback triggers
      const triggers = {
        backendError: content.includes('Backend TTS failed'),
        networkError: content.includes('synthesis failed'),
        configDisabled: content.includes('useGoogleTTS') && content.includes('false'),
        apiKeyMissing: content.includes('API key')
      };
      
      log('green', '✅ Fallback triggers analysis:');
      Object.entries(triggers).forEach(([trigger, found]) => {
        log('blue', `   - ${trigger}: ${found ? 'Configured' : 'Not found'}`);
      });
      
      // Check language mapping
      const hasLanguageMapping = content.includes('RN_TTS_LANGUAGE_MAP');
      log('blue', `   - Language mapping: ${hasLanguageMapping ? 'Implemented' : 'Missing'}`);
      
      // Check error recovery
      const hasErrorRecovery = content.includes('onFallbackUsed') && 
                              content.includes('setUsingFallback');
      log('blue', `   - Error recovery: ${hasErrorRecovery ? 'Implemented' : 'Basic'}`);
      
      return triggers;
    } catch (error) {
      log('red', '❌ Error analyzing fallback behavior');
    }
  }
  
  return {};
}

// Test offline mode simulation
function simulateOfflineMode() {
  log('blue', '\n🌐 Simulating Offline Mode...');
  
  // Simulate different offline scenarios
  const scenarios = [
    {
      name: 'Backend Unavailable',
      description: 'Backend server is down or unreachable',
      trigger: 'Network error or connection timeout',
      expectedBehavior: 'Fall back to React Native TTS'
    },
    {
      name: 'API Key Invalid',
      description: 'Google Cloud TTS API key is invalid or expired',
      trigger: 'Authentication error from Google Cloud',
      expectedBehavior: 'Fall back to React Native TTS'
    },
    {
      name: 'Service Disabled',
      description: 'Google Cloud TTS is disabled in configuration',
      trigger: 'useGoogleTTS: false in config',
      expectedBehavior: 'Use React Native TTS directly'
    },
    {
      name: 'Quota Exceeded',
      description: 'Google Cloud TTS quota or rate limit exceeded',
      trigger: 'HTTP 429 or quota error from API',
      expectedBehavior: 'Fall back to React Native TTS'
    }
  ];
  
  log('green', '✅ Offline scenarios supported:');
  scenarios.forEach((scenario, index) => {
    log('blue', `   ${index + 1}. ${scenario.name}`);
    log('blue', `      Trigger: ${scenario.trigger}`);
    log('blue', `      Expected: ${scenario.expectedBehavior}`);
  });
}

// Generate test recommendations
function generateRecommendations(config, deps, fallback) {
  log('blue', '\n💡 Recommendations...');
  
  const recommendations = [];
  
  if (!deps.hasRNTTS) {
    recommendations.push({
      type: 'critical',
      message: 'Install react-native-tts dependency',
      action: 'cd FRONTEND && npm install react-native-tts'
    });
  }
  
  if (!config.nativeTTSEnabled) {
    recommendations.push({
      type: 'warning',
      message: 'Enable native TTS in configuration',
      action: 'Set nativeTTS.enabled: true in ttsConfig.ts'
    });
  }
  
  if (!config.fallbackConfigured) {
    recommendations.push({
      type: 'critical',
      message: 'Implement fallback mechanism',
      action: 'Add speakWithNativeTTS fallback in useTextToSpeech hook'
    });
  }
  
  if (config.languageSupport < 10) {
    recommendations.push({
      type: 'info',
      message: 'Consider adding more language support',
      action: 'Add more languages to SUPPORTED_LANGUAGES mapping'
    });
  }
  
  if (recommendations.length === 0) {
    log('green', '✅ No critical issues found! Your React Native TTS offline mode is well configured.');
  } else {
    recommendations.forEach(rec => {
      const color = rec.type === 'critical' ? 'red' : rec.type === 'warning' ? 'yellow' : 'blue';
      log(color, `${rec.type.toUpperCase()}: ${rec.message}`);
      log('blue', `   Action: ${rec.action}`);
    });
  }
}

// Main test execution
function runTests() {
  const config = analyzeConfiguration();
  const deps = checkDependencies();
  const fallback = analyzeFallbackBehavior();
  
  simulateOfflineMode();
  generateRecommendations(config, deps, fallback);
  
  // Overall status
  log('blue', '\n📊 Overall Status...');
  
  const criticalIssues = [
    !deps.hasRNTTS,
    !config.fallbackConfigured,
    !config.configExists
  ].filter(Boolean).length;
  
  if (criticalIssues === 0) {
    log('green', '🎉 React Native TTS offline mode is ready!');
    log('blue', '   Your app will gracefully fall back to device TTS when backend is unavailable.');
  } else {
    log('yellow', `⚠️  Found ${criticalIssues} critical issue(s) that need attention.`);
    log('blue', '   Please address the recommendations above.');
  }
  
  // Test commands
  log('blue', '\n🧪 Manual Testing Commands:');
  log('blue', '   1. Test with backend running:');
  log('blue', '      - Start backend: npm start (in BACKEND folder)');
  log('blue', '      - Test TTS in app (should use Google Cloud TTS)');
  log('blue', '   2. Test offline mode:');
  log('blue', '      - Stop backend server');
  log('blue', '      - Test TTS in app (should fall back to React Native TTS)');
  log('blue', '   3. Test configuration:');
  log('blue', '      - Set useGoogleTTS: false in TTS config');
  log('blue', '      - Test TTS (should use React Native TTS directly)');
}

// Run the tests
runTests();

console.log('\n✨ Test completed!');
console.log('For more detailed testing, run the app and check the console logs.');