#!/bin/bash
# start-recording-test.sh
# ----------------------------------------------------------------------------
# DES Added: Complete test setup for audio recording functionality
# 
# This script will:
# 1. Start the WebSocket server for live interpretation
# 2. Run the recording test to verify setup
# 3. Provide guidance for fixing any issues found

echo "🎙️ [Recording Test] Starting Verblizr recording test setup..."

# Check if we're in the right directory
if [ ! -f "websocket-server.js" ]; then
  echo "❌ [Recording Test] Error: Must run this from the BACKEND directory"
  echo "📂 Run: cd /Users/dawoodsheikh/MOBILEAPPS/VERBLIZR/BACKEND"
  exit 1
fi

echo "✅ [Recording Test] Running from correct directory: $(pwd)"

# Step 1: Install dependencies if needed
echo "\n📦 [Recording Test] Checking dependencies..."
if [ ! -d "node_modules" ]; then
  echo "📥 [Recording Test] Installing backend dependencies..."
  npm install
fi

# Step 2: Check if recordings directory exists
echo "\n📁 [Recording Test] Setting up recordings directory..."
mkdir -p recordings
echo "✅ [Recording Test] Recordings directory ready"

# Step 3: Check environment variables
echo "\n🔐 [Recording Test] Checking environment configuration..."
if [ ! -f ".env" ]; then
  echo "⚠️ [Recording Test] .env file not found - copying from example..."
  if [ -f ".env.example" ]; then
    cp .env.example .env
    echo "✅ [Recording Test] .env file created from example"
  else
    echo "❌ [Recording Test] No .env.example found - you may need to configure environment manually"
  fi
fi

# Step 4: Run the recording test
echo "\n🧪 [Recording Test] Running recording functionality test..."
node test-recording.js

# Step 5: Check if WebSocket server is already running
echo "\n🌐 [Recording Test] Checking if WebSocket server is already running..."
if lsof -Pi :8082 -sTCP:LISTEN -t >/dev/null ; then
  echo "✅ [Recording Test] WebSocket server is already running on port 8082"
else
  echo "🚀 [Recording Test] Starting WebSocket server on port 8082..."
  echo "💡 [Recording Test] Keep this terminal open while testing the app!"
  echo "\n📱 [Recording Test] Now you can:"
  echo "   1. Open your React Native app"
  echo "   2. Go to Live Interpretation screen"  
  echo "   3. Tap the microphone button to test recording"
  echo "   4. Check console logs for detailed feedback"
  echo "\n🛑 [Recording Test] Press Ctrl+C to stop the server when done testing"
  echo "\n" 
  
  # Start the server
  node websocket-server.js
fi
