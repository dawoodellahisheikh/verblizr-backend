#!/bin/bash
# DES Added: Test script to verify billing fixes

echo "🧪 Testing Verblizr Billing Fixes"
echo "================================="

# Test 1: Check if server starts without errors
echo "1️⃣ Starting server to check configuration..."
cd /Users/dawoodsheikh/MOBILEAPPS/VERBLIZR/BACKEND

# Check .env file
echo "📝 Checking .env configuration..."
if grep -q "sk_test_" .env; then
    echo "✅ Test Stripe key found in .env"
else
    echo "❌ No test Stripe key found"
fi

# Count STRIPE_SECRET_KEY occurrences
key_count=$(grep -c "STRIPE_SECRET_KEY" .env)
echo "🔍 Found $key_count STRIPE_SECRET_KEY entries (should be 1)"

echo ""
echo "🚀 To test the fix:"
echo "1. Run: cd /Users/dawoodsheikh/MOBILEAPPS/VERBLIZR/BACKEND"
echo "2. Run: node index.js"
echo "3. Look for: '[billing] ✅ Stripe key appears valid'"
echo "4. In another terminal, test the endpoint:"
echo "   curl -X POST http://localhost:4000/api/billing/setup-intent"
echo ""
echo "Expected: No more 400 errors in billing form! 🎉"
