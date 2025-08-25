// services/users.js
const Stripe = require("stripe");
const rawKey = process.env.STRIPE_SECRET_KEY || "";
const STRIPE_KEY = rawKey.replace(/^['"]|['"]$/g, "").trim();
const stripe = new Stripe(STRIPE_KEY, { apiVersion: "2024-06-20" });

// In-memory cache for dev; still used, but we'll also SEARCH Stripe so restarts reuse the same customer.
const USERS = new Map(); // userId -> { id, stripeCustomerId }

/** Try to find an existing Stripe customer by our metadata tag */
async function findCustomerByAppUserId(userId) {
	try {
		// Requires Stripe's Search API (enabled by default in test mode)
		const result = await stripe.customers.search({
			query: `metadata['appUserId']:'${userId}'`,
			limit: 1,
		});
		return result.data[0] || null;
	} catch (e) {
		// Fallback: none found / search unavailable
		return null;
	}
}

async function getOrCreateStripeCustomerId(userId) {
	let u = USERS.get(userId);
	if (u?.stripeCustomerId) return u.stripeCustomerId;

	// 1) Reuse an existing customer if one already has this appUserId
	const existing = await findCustomerByAppUserId(userId);
	if (existing) {
		const cid = existing.id;
		USERS.set(userId, { id: userId, stripeCustomerId: cid });
		return cid;
	}

	// 2) Otherwise, create a new one and tag it with our app user id
	const customer = await stripe.customers.create({
		metadata: { appUserId: userId },
		// email: 'dev@example.com', // add if you have it to enable Stripe receipts
	});

	USERS.set(userId, { id: userId, stripeCustomerId: customer.id });
	return customer.id;
}

module.exports = { getOrCreateStripeCustomerId };
