// routes/billing.js
const express = require("express");
const Stripe = require("stripe");
const { getOrCreateStripeCustomerId } = require("../services/users");

const router = express.Router();

/** Sanitize the env var: strip quotes/whitespace */
const rawKey = process.env.STRIPE_SECRET_KEY || "";
const STRIPE_KEY = rawKey.replace(/^['"]*|['"]*$/g, "").trim();
console.log(
	"[billing] key check:",
	STRIPE_KEY.slice(0, 10) + "...",
	"len=",
	STRIPE_KEY.length
);

// DES Added: Validate Stripe key format and configuration
if (!STRIPE_KEY || STRIPE_KEY.length < 10) {
	console.error("[billing] ERROR: Invalid or missing STRIPE_SECRET_KEY!");
	console.error("[billing] Please check your .env file");
} else if (!STRIPE_KEY.startsWith('sk_')) {
	console.error("[billing] ERROR: STRIPE_SECRET_KEY should start with 'sk_'");
} else {
	console.log("[billing] ✅ Stripe key appears valid");
}

const stripe = new Stripe(STRIPE_KEY, { apiVersion: "2024-06-20" });

/* ----------------- helpers ----------------- */
function extractDefaultPmId(customer) {
	const invDefault = customer?.invoice_settings?.default_payment_method;
	return typeof invDefault === "string" ? invDefault : invDefault?.id || null;
}

async function getDefaultPaymentMethodId(customerId) {
	const customer = await stripe.customers.retrieve(customerId);
	const invoiceDefault = extractDefaultPmId(customer);
	if (invoiceDefault) return invoiceDefault;

	const { data } = await stripe.paymentMethods.list({
		customer: customerId,
		type: "card",
		limit: 1,
	});
	return data[0]?.id || null;
}

/* ----------------- debug ----------------- */
router.get("/health", (req, res) => {
	res.json({ ok: true, mountedAt: req.baseUrl || "/billing" });
});

router.get("/debug-key", (_req, res) =>
	res.json({
		prefix: STRIPE_KEY.slice(0, 10) + "...",
		length: STRIPE_KEY.length,
		maskedCharFound: /\*/.test(STRIPE_KEY),
	})
);

/* ----------------- billing APIs ----------------- */

// Create SetupIntent (save a card from the device)
router.post("/setup-intent", async (req, res) => {
	try {
		// DES Added: Better validation and logging
		console.log("[billing] setup-intent request from user:", req.user?.id);
		
		const userId = req.user?.id;
		if (!userId) {
			console.error("[billing] setup-intent: No user ID found");
			return res.status(401).json({ error: "Unauthorized" });
		}

		// DES Added: Validate Stripe key before proceeding
		if (!STRIPE_KEY || STRIPE_KEY.length < 10) {
			console.error("[billing] setup-intent: Invalid Stripe key configuration");
			return res.status(500).json({ error: "Payment service configuration error" });
		}

		const customerId = await getOrCreateStripeCustomerId(userId);
		console.log("[billing] setup-intent: Creating for customer:", customerId);
		
		const si = await stripe.setupIntents.create({
			customer: customerId,
			usage: "off_session",
			automatic_payment_methods: { enabled: true },
		});
		
		console.log("[billing] setup-intent: Success", si.id);
		res.json({ clientSecret: si.client_secret });
	} catch (e) {
		// DES Added: More detailed error logging
		console.error("[billing] setup-intent error:", {
			message: e.message,
			code: e.code,
			type: e.type,
			stack: e.stack
		});
		res
			.status(400)
			.json({ 
				error: e.message || "Failed to create SetupIntent",
				code: e.code || 'unknown'
			});
	}
});

// Set default card
router.post("/payment-methods/:id/default", async (req, res) => {
	try {
		const userId = req.user?.id;
		if (!userId) return res.status(401).json({ error: "Unauthorized" });

		const paymentMethodId = req.params.id;
		if (!paymentMethodId)
			return res.status(400).json({ error: "paymentMethodId required" });

		const customerId = await getOrCreateStripeCustomerId(userId);

		// attach (idempotent)
		try {
			await stripe.paymentMethods.attach(paymentMethodId, {
				customer: customerId,
			});
		} catch (err) {
			if (!(err && err.code === "resource_already_exists")) throw err;
		}

		// set as invoice default
		await stripe.customers.update(customerId, {
			invoice_settings: { default_payment_method: paymentMethodId },
		});

		res.json({ ok: true });
	} catch (e) {
		console.error("[billing] set-default error:", e);
		res
			.status(400)
			.json({ error: e.message || "Failed to set default payment method" });
	}
});

// List attached cards (default first) – accept optional trailing slash
router.get(["/payment-methods", "/payment-methods/"], async (req, res) => {
	try {
		const userId = req.user?.id;
		if (!userId) return res.status(401).json({ error: "Unauthorized" });

		const customerId = await getOrCreateStripeCustomerId(userId);
		const customer = await stripe.customers.retrieve(customerId);
		const defaultId = extractDefaultPmId(customer);

		const { data } = await stripe.paymentMethods.list({
			customer: customerId,
			type: "card",
		});

		const items = data
			.map((pm) => ({
				id: pm.id,
				brand: pm.card?.brand || "card",
				last4: pm.card?.last4 || "",
				expMonth: pm.card?.exp_month || 0,
				expYear: pm.card?.exp_year || 0,
				isDefault: pm.id === defaultId,
			}))
			.sort((a, b) => (a.isDefault === b.isDefault ? 0 : a.isDefault ? -1 : 1));

		res.json(items);
	} catch (e) {
		res
			.status(400)
			.json({ error: e?.message || "Failed to load payment methods" });
	}
});

// Delete a payment method
async function deletePmHandler(req, res) {
	try {
		const userId = req.user?.id;
		if (!userId) return res.status(401).json({ error: "Unauthorized" });

		const paymentMethodId = req.params.id;
		const customerId = await getOrCreateStripeCustomerId(userId);

		const customer = await stripe.customers.retrieve(customerId);
		const invDefault = customer?.invoice_settings?.default_payment_method;
		const currentDefault =
			typeof invDefault === "string" ? invDefault : invDefault?.id || null;

		if (currentDefault === paymentMethodId) {
			const { data } = await stripe.paymentMethods.list({
				customer: customerId,
				type: "card",
			});
			const next = data.find((pm) => pm.id !== paymentMethodId);
			await stripe.customers.update(customerId, {
				invoice_settings: { default_payment_method: next?.id || null },
			});
		}

		await stripe.paymentMethods.detach(paymentMethodId);
		return res.json({ ok: true });
	} catch (e) {
		return res
			.status(400)
			.json({ error: e?.message || "Failed to remove payment method" });
	}
}

// Keep DELETE (if your client uses it)
router.delete("/payment-methods/:id", deletePmHandler);

// POST alias for delete (use this from the app to avoid DELETE quirks)
router.post("/payment-methods/:id/delete", deletePmHandler);

// Customer summary (used by the app to show saved cards)
router.get("/customer", async (req, res) => {
	try {
		const userId = req.user?.id;
		if (!userId) return res.status(401).json({ error: "Unauthorized" });

		const customerId = await getOrCreateStripeCustomerId(userId);
		const customer = await stripe.customers.retrieve(customerId);
		const pms = await stripe.paymentMethods.list({
			customer: customerId,
			type: "card",
		});

		res.json({
			customerId,
			defaultPaymentMethod: extractDefaultPmId(customer),
			cards: pms.data.map((pm) => ({
				id: pm.id,
				brand: pm.card?.brand,
				last4: pm.card?.last4,
				expMonth: pm.card?.exp_month,
				expYear: pm.card?.exp_year,
			})),
		});
	} catch (e) {
		res.status(400).json({ error: e?.message || "Failed" });
	}
});

// Off-session test charge
router.post("/test-charge", async (req, res) => {
	try {
		const userId = req.user?.id;
		if (!userId) return res.status(401).json({ error: "Unauthorized" });

		const amountMinor = Number(req.body?.amountMinor ?? 50);
		const customerId = await getOrCreateStripeCustomerId(userId);
		const pmId = await getDefaultPaymentMethodId(customerId);
		if (!pmId) {
			return res.status(409).json({
				ok: false,
				error: "No payment method on file. Save a card first.",
			});
		}

		const pi = await stripe.paymentIntents.create({
			amount: amountMinor,
			currency: "gbp",
			customer: customerId,
			payment_method: pmId,
			confirm: true,
			off_session: true,
			payment_method_types: ["card"],
			description: `Test off-session charge for ${userId}`,
			metadata: { kind: "test_charge" },
		});

		res.json({
			ok: true,
			paymentIntentId: pi.id,
			status: pi.status,
			amountMinor: pi.amount,
			currency: pi.currency,
			paymentMethodId: pmId,
		});
	} catch (e) {
		res.status(402).json({ ok: false, error: e?.message || "Payment failed" });
	}
});

module.exports = router;
