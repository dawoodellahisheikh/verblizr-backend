// index.js
require("dotenv").config();

const express = require("express");
const cors = require("cors");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");
const { z } = require("zod");
const path = require("path");

console.log("[boot]", { file: __filename, cwd: process.cwd() });

const app = express();

// CORS + JSON body
app.use(cors({ origin: true, credentials: true }));
app.use(express.json());

const PORT = process.env.PORT || 4000;
const JWT_SECRET = process.env.JWT_SECRET || "dev-secret";

// ---------------- Demo user (extended profile fields) ----------------
const demoUser = {
	id: "u_1",
	email: "demo@verblizr.com",
	name: "Demo User",
	firstName: "Demo",
	lastName: "User",
	title: "Mr",
	address: "123 Main St",
	city: "Demo City",
	state: "DC",
	postalCode: "12345",
	country: "USA",
	company: "Verblizr Inc.",
	about: "Loves live translation and good coffee.",
	phone: "+1 (555) 123-4567",
	passwordHash: bcrypt.hashSync("Password123!", 10),
};

// ---------------- Auth helpers ----------------
function authFromJWT(req, _res, next) {
	const auth = req.headers?.authorization || "";
	if (auth.startsWith("Bearer ")) {
		const token = auth.slice("Bearer ".length).trim();
		try {
			const decoded = jwt.verify(token, JWT_SECRET);
			req.user = { id: decoded.sub, email: decoded.email };
		} catch (_e) {
			// invalid/expired token -> leave req.user unset
		}
	}
	next();
}

app.use(authFromJWT);

// DEV shim: if no JWT, use demo user so curl & bare requests work
app.use((req, _res, next) => {
	if (!req.user) req.user = { id: demoUser.id, email: demoUser.email };
	next();
});

// ---------------- Auth routes (dual paths) ----------------
const loginSchema = z.object({
	email: z.string().email(),
	password: z.string().min(8),
});

const loginHandler = (req, res) => {
	const parsed = loginSchema.safeParse(req.body);
	if (!parsed.success)
		return res.status(400).json({ message: "Invalid payload" });

	const { email, password } = parsed.data;
	if (email !== demoUser.email)
		return res.status(401).json({ message: "Invalid credentials" });

	const ok = bcrypt.compareSync(password, demoUser.passwordHash);
	if (!ok) return res.status(401).json({ message: "Invalid credentials" });

	const token = jwt.sign(
		{ sub: demoUser.id, email: demoUser.email },
		JWT_SECRET,
		{
			expiresIn: "24h",
		}
	);

	// Return full profile
	res.json({
		token,
		user: {
			id: demoUser.id,
			email: demoUser.email,
			name: `${demoUser.firstName} ${demoUser.lastName}`,
			firstName: demoUser.firstName,
			lastName: demoUser.lastName,
			title: demoUser.title,
			address: demoUser.address,
			city: demoUser.city,
			state: demoUser.state,
			postalCode: demoUser.postalCode,
			country: demoUser.country,
			company: demoUser.company,
			about: demoUser.about,
			phone: demoUser.phone,
		},
	});
};

app.post(["/auth/login", "/api/auth/login"], loginHandler);

const registerSchema = z.object({
	firstName: z.string().min(1),
	lastName: z.string().min(1),
	email: z.string().email(),
	password: z.string().min(8),
});

const registerHandler = (req, res) => {
	const parsed = registerSchema.safeParse(req.body);
	if (!parsed.success)
		return res.status(400).json({ message: "Invalid payload" });

	const { email, firstName, lastName } = parsed.data;
	if (email === demoUser.email)
		return res.status(409).json({ message: "Email already in use" });

	const token = jwt.sign({ sub: "u_2", email }, JWT_SECRET, {
		expiresIn: "24h",
	});
	const user = {
		id: "u_2",
		email,
		name: `${firstName} ${lastName}`,
		firstName,
		lastName,
	};
	res.json({ token, user });
};

app.post(["/auth/register", "/api/auth/register"], registerHandler);

// ---------------- Profile endpoints (expanded) ----------------
const profileUpdateSchema = z.object({
	firstName: z.string().min(1),
	lastName: z.string().min(1),
	email: z.string().email(),
	title: z.string().optional(),
	address: z.string().optional(),
	city: z.string().optional(),
	state: z.string().optional(),
	postalCode: z.string().optional(),
	country: z.string().optional(),
	company: z.string().optional(),
	about: z.string().optional(),
	phone: z.string().optional(),
});

const profileUpdateHandler = (req, res) => {
	console.log("[Profile Update] Request received:", {
		user: req.user?.id,
		body: req.body,
	});

	if (!req.user) return res.status(401).json({ message: "Unauthorized" });

	const parsed = profileUpdateSchema.safeParse(req.body);
	if (!parsed.success) {
		console.log("[Profile Update] Validation failed:", parsed.error.errors);
		return res
			.status(400)
			.json({ message: "Invalid payload", errors: parsed.error.errors });
	}

	const {
		firstName,
		lastName,
		email,
		title,
		address,
		city,
		state,
		postalCode,
		country,
		company,
		about,
		phone,
	} = parsed.data;

	// In-memory update for demo user
	if (req.user.id === demoUser.id) {
		demoUser.firstName = firstName;
		demoUser.lastName = lastName;
		demoUser.email = email;
		demoUser.title = title ?? "";
		demoUser.address = address ?? "";
		demoUser.city = city ?? "";
		demoUser.state = state ?? "";
		demoUser.postalCode = postalCode ?? "";
		demoUser.country = country ?? "";
		demoUser.company = company ?? "";
		demoUser.about = about ?? "";
		demoUser.phone = phone ?? "";
	}

	const updatedUser = {
		id: req.user.id,
		email,
		name: `${firstName} ${lastName}`,
		firstName,
		lastName,
		title: title ?? "",
		address: address ?? "",
		city: city ?? "",
		state: state ?? "",
		postalCode: postalCode ?? "",
		country: country ?? "",
		company: company ?? "",
		about: about ?? "",
		phone: phone ?? "",
	};

	console.log("[Profile Update] Success:", updatedUser);
	res.json({ user: updatedUser });
};

// (Optional) Get current user profile
const meHandler = (_req, res) => {
	const u = demoUser;
	res.json({
		user: {
			id: u.id,
			email: u.email,
			name: `${u.firstName} ${u.lastName}`,
			firstName: u.firstName,
			lastName: u.lastName,
			title: u.title,
			address: u.address,
			city: u.city,
			state: u.state,
			postalCode: u.postalCode,
			country: u.country,
			company: u.company,
			about: u.about,
			phone: u.phone,
		},
	});
};

app.get(["/auth/me", "/api/auth/me"], meHandler);
app.put(["/auth/profile", "/api/auth/profile"], profileUpdateHandler);

// ---------------- Password change ----------------
const passwordChangeSchema = z.object({
	currentPassword: z.string().min(8),
	newPassword: z.string().min(8),
});

const passwordChangeHandler = (req, res) => {
	console.log("[Password Change] Request received for user:", req.user?.id);

	if (!req.user) return res.status(401).json({ message: "Unauthorized" });

	const parsed = passwordChangeSchema.safeParse(req.body);
	if (!parsed.success) {
		console.log("[Password Change] Validation failed:", parsed.error.errors);
		return res.status(400).json({ message: "Invalid payload" });
	}

	const { currentPassword, newPassword } = parsed.data;

	if (req.user.id === demoUser.id) {
		const ok = bcrypt.compareSync(currentPassword, demoUser.passwordHash);
		if (!ok)
			return res.status(400).json({ message: "Current password is incorrect" });
		// Update in-memory hash so subsequent logins use the new password
		demoUser.passwordHash = bcrypt.hashSync(newPassword, 10);
	}

	console.log("[Password Change] Success");
	res.json({ message: "Password changed successfully" });
};

app.put(
	["/auth/change-password", "/api/auth/change-password"],
	passwordChangeHandler
);

// ---------------- Health ----------------
app.get(["/health", "/api/health"], (_req, res) => res.json({ ok: true }));

// ---------------- Billing routes (unchanged) ----------------
console.log(
	"[server] requiring routes from",
	path.resolve(__dirname, "./routes/billing.js")
);
const billingRoutes = require("./routes/billing");

const table = (billingRoutes.stack || [])
	.filter((l) => l.route)
	.map((l) => ({
		method: Object.keys(l.route.methods)[0].toUpperCase(),
		path: l.route.path,
	}));
console.log("[server] billing route table:", table);

// Mount on BOTH prefixes
app.use("/api/billing", billingRoutes);
app.use("/billing", billingRoutes);
console.log("[server] Billing routes mounted at /api/billing and /billing");

// DEBUG: show requests as they enter the billing mount
app.use("/billing", (req, _res, next) => {
	console.log(
		"[app] entering /billing:",
		req.method,
		req.originalUrl,
		"url=",
		req.url
	);
	next();
});

app.use("/billing", (req, _res, next) => {
	console.log(
		"[app] entering /billing mount:",
		req.method,
		req.originalUrl,
		"url=",
		req.url
	);
	next();
});

// ---------------- Invoices routes ----------------
console.log(
	"[server] requiring routes from",
	path.resolve(__dirname, "./routes/invoices.js")
);
const invoiceRoutes = require("./routes/invoices");

// Mount on BOTH prefixes for consistency
app.use("/api", invoiceRoutes);
app.use("/", invoiceRoutes);

console.log("[server] Invoice routes mounted at /api/* and /*");

app.listen(PORT, () => console.log(`API running on http://localhost:${PORT}`));
