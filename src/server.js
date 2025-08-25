// src/server.js - Builder Added: Converted from TypeScript to JavaScript for compatibility
const express = require('express');
const cors = require('cors');

// 1) IMPORT the billing routes
const billingRoutes = require('../routes/billing');

const app = express();
app.use(cors({ origin: true, credentials: true }));
app.use(express.json());

// (Optional) TEMP auth shim for local testing so req.user.id exists:
app.use((req, _res, next) => {
  if (!req.user) req.user = { id: 'dev-user-1' };
  next();
});

// 2) MOUNT the routes at /billing (no /api prefix here)
app.use('/billing', billingRoutes);
console.log('[server] Billing routes mounted at /billing');

// Builder Added: Commented out duplicate server configuration
/*
const app = express();
app.use(express.json());

// Ensure you have auth middleware that sets req.user.id
// app.use(requireAuth);

// BEFORE mounting /billing
app.use((req, _res, next) => {
  if (!req.user) req.user = { id: 'dev-user-1' }; // TEMP for local testing
  next();
});

// CORS if your RN app hits from a device/simulator:
// const cors = require('cors');
app.use(cors({ origin: true, credentials: true }));

app.use('/billing', billingRoutes);

// ... existing routes & error handlers
*/

module.exports = app;