/**
 * start-all.js
 * ----------------------------------------------------------------------------
 * DES Added: Integrated startup script for both HTTP and WebSocket servers
 * 
 * Starts:
 * - HTTP API server on port 4000
 * - WebSocket server on port 8082
 * 
 * Usage:
 *   node start-all.js
 */

const { spawn } = require('child_process');
const path = require('path');

console.log('🚀 Starting Verblizr Backend Services...');

// Start HTTP API server (port 4000)
const httpServer = spawn('node', ['index.js'], {
  stdio: ['inherit', 'pipe', 'pipe'],
  cwd: __dirname
});

httpServer.stdout.on('data', (data) => {
  process.stdout.write(`[HTTP] ${data}`);
});

httpServer.stderr.on('data', (data) => {
  process.stderr.write(`[HTTP] ${data}`);
});

httpServer.on('close', (code) => {
  console.log(`[HTTP] Server exited with code ${code}`);
  process.exit(code);
});

// Start WebSocket server (port 8082)
const wsServer = spawn('node', ['websocket-server.js'], {
  stdio: ['inherit', 'pipe', 'pipe'],
  cwd: __dirname
});

wsServer.stdout.on('data', (data) => {
  process.stdout.write(`[WS] ${data}`);
});

wsServer.stderr.on('data', (data) => {
  process.stderr.write(`[WS] ${data}`);
});

wsServer.on('close', (code) => {
  console.log(`[WS] Server exited with code ${code}`);
  process.exit(code);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('\n🛑 Shutting down all servers...');
  httpServer.kill('SIGTERM');
  wsServer.kill('SIGTERM');
});

process.on('SIGINT', () => {
  console.log('\n🛑 Shutting down all servers...');
  httpServer.kill('SIGINT');
  wsServer.kill('SIGINT');
});

console.log('✅ Both servers starting...');
console.log('📡 HTTP API: http://localhost:4000');
console.log('🎙️ WebSocket: ws://localhost:8082');
