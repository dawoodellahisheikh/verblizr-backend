#!/bin/bash

# kill-port.sh - Kill processes using ports 4000 and 8082

echo "🔍 Checking for processes using ports 4000 and 8082..."

# Kill processes on port 4000 (HTTP API)
HTTP_PID=$(lsof -ti:4000)
if [ ! -z "$HTTP_PID" ]; then
    echo "🔪 Killing process $HTTP_PID on port 4000"
    kill -9 $HTTP_PID
else
    echo "✅ Port 4000 is free"
fi

# Kill processes on port 8082 (WebSocket)
WS_PID=$(lsof -ti:8082)
if [ ! -z "$WS_PID" ]; then
    echo "🔪 Killing process $WS_PID on port 8082"
    kill -9 $WS_PID
else
    echo "✅ Port 8082 is free"
fi

echo "🚀 Ports are now clear. You can run 'npm start'"
