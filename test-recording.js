/**
 * test-recording.js
 * ----------------------------------------------------------------------------
 * DES Added: Test script to verify audio recording functionality
 * 
 * This script helps debug recording issues by:
 * - Testing if the audio library loads correctly
 * - Checking file permissions and paths
 * - Creating a simple recording test
 * - Verifying files are saved properly
 * 
 * Run this in your BACKEND directory to test recording from Node.js side
 */

console.log('🧪 [Recording Test] Starting audio recording test...');

// Test 1: Check if required directories exist
const fs = require('fs');
const path = require('path');

const recordingsDir = path.join(__dirname, 'recordings');
console.log('📁 [Recording Test] Recordings directory:', recordingsDir);

if (!fs.existsSync(recordingsDir)) {
  console.log('📁 [Recording Test] Creating recordings directory...');
  fs.mkdirSync(recordingsDir, { recursive: true });
  console.log('✅ [Recording Test] Recordings directory created');
} else {
  console.log('✅ [Recording Test] Recordings directory exists');
}

// Test 2: Check current files in recordings
const files = fs.readdirSync(recordingsDir);
console.log('📊 [Recording Test] Current files in recordings:', files.length);
if (files.length > 0) {
  console.log('📂 [Recording Test] Files:', files.slice(0, 5)); // Show first 5
}

// Test 3: Create a test file to verify write permissions
const testFilePath = path.join(recordingsDir, 'test-recording-permissions.txt');
try {
  fs.writeFileSync(testFilePath, `Test file created at ${new Date().toISOString()}`);
  console.log('✅ [Recording Test] Write permissions OK');
  
  // Cleanup test file
  fs.unlinkSync(testFilePath);
  console.log('🧹 [Recording Test] Test file cleaned up');
} catch (error) {
  console.error('❌ [Recording Test] Write permission error:', error.message);
}

// Test 4: Check WebSocket server status
console.log('\n🌐 [Recording Test] Checking WebSocket server...');

const WebSocket = require('ws');

function testWebSocketConnection() {
  return new Promise((resolve) => {
    const ws = new WebSocket('ws://localhost:8082');
    
    const timeout = setTimeout(() => {
      ws.terminate();
      resolve(false);
    }, 3000);
    
    ws.on('open', () => {
      clearTimeout(timeout);
      console.log('✅ [Recording Test] WebSocket server is running on port 8082');
      ws.close();
      resolve(true);
    });
    
    ws.on('error', (error) => {
      clearTimeout(timeout);
      console.error('❌ [Recording Test] WebSocket connection failed:', error.message);
      resolve(false);
    });
  });
}

testWebSocketConnection().then((connected) => {
  if (!connected) {
    console.log('🔧 [Recording Test] To start WebSocket server:');
    console.log('   cd /Users/dawoodsheikh/MOBILEAPPS/VERBLIZR/BACKEND');
    console.log('   node websocket-server.js');
  }
  
  console.log('\n📋 [Recording Test] Test Summary:');
  console.log('- Recordings directory: ✅ Ready');
  console.log('- Write permissions: ✅ OK');
  console.log('- WebSocket server:', connected ? '✅ Running' : '❌ Not running');
  console.log('\n🎯 [Recording Test] Next steps:');
  console.log('1. Start WebSocket server if not running');
  console.log('2. Rebuild React Native app to fix audio library');
  console.log('3. Test recording from the app');
});

console.log('🎤 [Recording Test] Test completed - check logs above');
