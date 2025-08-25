#!/bin/bash
# DES Added: Simple package upgrade script
# Run this script to apply the package fixes

echo "🚀 VERBLIZR PACKAGE UPGRADE SCRIPT"
echo "=================================="

# Check if we're in the right directory
if [[ ! -f "package.json" ]]; then
    echo "❌ Error: No package.json found. Run this from FRONTEND or BACKEND directory."
    exit 1
fi

# Detect if this is frontend or backend
if grep -q "react-native" package.json; then
    echo "📱 Detected: FRONTEND project"
    PROJECT_TYPE="frontend"
elif grep -q "express" package.json; then
    echo "🖥️  Detected: BACKEND project"  
    PROJECT_TYPE="backend"
else
    echo "❓ Unknown project type"
    exit 1
fi

# Confirm upgrade
echo ""
read -p "⚠️  This will replace your package.json and reinstall all dependencies. Continue? (y/N): " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "❌ Upgrade cancelled"
    exit 1
fi

# Backup current package.json
echo "📦 Creating backup..."
cp package.json package.json.backup.$(date +%Y%m%d_%H%M%S)

# Replace with fixed version
if [[ ! -f "package.json.fixed" ]]; then
    echo "❌ Error: package.json.fixed not found"
    exit 1
fi

cp package.json.fixed package.json
echo "✅ Package.json updated"

# Clean and reinstall
echo "🧹 Cleaning old dependencies..."
rm -rf node_modules package-lock.json

if [[ "$PROJECT_TYPE" == "frontend" ]]; then
    echo "🧹 Cleaning iOS pods..."
    rm -rf ios/Pods ios/Podfile.lock
fi

echo "📦 Installing new dependencies..."
npm install

if [[ "$PROJECT_TYPE" == "frontend" ]]; then
    echo "🍎 Installing iOS pods..."
    cd ios && pod install --repo-update && cd ..
    
    echo "🧹 Clearing React Native cache..."
    npx react-native start --reset-cache &
    sleep 3
    kill $! 2>/dev/null
fi

echo ""
echo "✅ UPGRADE COMPLETE!"
echo ""

if [[ "$PROJECT_TYPE" == "backend" ]]; then
    echo "🧪 Test with: npm run start"
    echo "🔍 Verify: curl http://localhost:4000/health"
else
    echo "🧪 Test with: npx react-native run-ios"
    echo "🧹 If issues: npx react-native start --reset-cache"
fi

echo ""
echo "📋 Check UPGRADE_GUIDE.md for detailed testing checklist"
echo "🚨 Rollback: cp package.json.backup.* package.json && npm install"
