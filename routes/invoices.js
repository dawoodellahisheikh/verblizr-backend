// routes/invoices.js
const express = require("express");
const router = express.Router();

const {
	format,
	parseISO,
	isWithinInterval,
	startOfDay,
	endOfDay,
} = require("date-fns");
const PDFDocument = require("pdfkit");
const archiver = require("archiver");

/**
 * WHY demo data here:
 * - For now we're using in-memory demo payments so you can test the flows immediately.
 * - Later, replace with your real billing provider (Stripe, etc.) or your DB.
 * - We only return invoices for the authenticated user (req.user.id).
 */
const DEMO_PAYMENTS = [
	{
		id: "inv_1001",
		userId: "u_1",
		amount: 1499, // pennies
		currency: "GBP",
		status: "paid",
		createdAt: "2025-08-01T10:12:00Z",
		lineItems: [{ title: "Verblizr Pro — Monthly", qty: 1, unitAmount: 1499 }],
	},
	{
		id: "inv_1002",
		userId: "u_1",
		amount: 1499,
		currency: "GBP",
		status: "paid",
		createdAt: "2025-09-01T10:05:00Z",
		lineItems: [{ title: "Verblizr Pro — Monthly", qty: 1, unitAmount: 1499 }],
	},
	// add more if you like
];

/** Helper: filter by current user and optional date range */
function filterByUserAndDate(rows, userId, from, to) {
	let filtered = rows.filter((p) => p.userId === userId);

	if (from || to) {
		const fromDate = from ? startOfDay(parseISO(from)) : new Date("1970-01-01");
		const toDate = to ? endOfDay(parseISO(to)) : new Date("9999-12-31");
		filtered = filtered.filter((p) =>
			isWithinInterval(new Date(p.createdAt), { start: fromDate, end: toDate })
		);
	}

	return filtered.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)); // newest first
}

/** Helper: build one invoice PDF into a writable stream */
function writeInvoicePDF(doc, inv, billedTo) {
	// Header
	doc.fontSize(20).text("Verblizr — Invoice", { align: "right" });
	doc.moveDown(0.5);
	doc.fontSize(10).text(`Invoice #: ${inv.id}`, { align: "right" });
	doc.text(`Date: ${format(new Date(inv.createdAt), "yyyy-MM-dd")}`, {
		align: "right",
	});

	// Billed to
	doc.moveDown();
	doc.fontSize(12).text("Billed To:");
	if (billedTo?.name) doc.text(billedTo.name);
	if (billedTo?.email) doc.text(billedTo.email);

	// Lines
	doc.moveDown();
	doc.fontSize(12).text("Details:").moveDown(0.5);
	inv.lineItems.forEach((li) => {
		const lineTotal = li.qty * li.unitAmount;
		doc.text(`${li.title} x ${li.qty}`);
		doc.text(`£${(li.unitAmount / 100).toFixed(2)} each`, { align: "right" });
		doc.text(`Line total: £${(lineTotal / 100).toFixed(2)}`, {
			align: "right",
		});
		doc.moveDown(0.5);
	});

	// Total
	doc.moveDown();
	doc
		.fontSize(14)
		.text(`Total: £${(inv.amount / 100).toFixed(2)}`, { align: "right" });
	doc.fontSize(10).text(`Status: ${inv.status}`, { align: "right" });
}

/**
 * GET /invoices
 * Query: ?from=YYYY-MM-DD&to=YYYY-MM-DD&page=1&pageSize=20
 * Returns paginated list of invoices for the current user.
 */
router.get("/invoices", (req, res) => {
	const { from, to, page = 1, pageSize = 20 } = req.query;
	const userId = req.user?.id;
	if (!userId) return res.status(401).json({ message: "Unauthorized" });

	const rows = filterByUserAndDate(DEMO_PAYMENTS, userId, from, to);

	const p = Math.max(1, parseInt(page, 10));
	const ps = Math.max(1, Math.min(100, parseInt(pageSize, 10)));
	const start = (p - 1) * ps;
	const end = start + ps;

	const items = rows.slice(start, end).map((x) => ({
		id: x.id,
		amount: x.amount,
		currency: x.currency,
		status: x.status,
		createdAt: x.createdAt,
	}));

	res.json({
		page: p,
		pageSize: ps,
		total: rows.length,
		items,
	});
});

/**
 * GET /invoices/:id/pdf
 * Returns a single invoice as a PDF attachment.
 */
router.get("/invoices/:id/pdf", (req, res) => {
	const userId = req.user?.id;
	if (!userId) return res.status(401).json({ message: "Unauthorized" });

	const inv = DEMO_PAYMENTS.find(
		(p) => p.id === req.params.id && p.userId === userId
	);
	if (!inv) return res.status(404).json({ error: "Invoice not found" });

	res.setHeader("Content-Type", "application/pdf");
	res.setHeader("Content-Disposition", `attachment; filename=${inv.id}.pdf`);

	const doc = new PDFDocument({ size: "A4", margin: 50 });
	doc.pipe(res);

	const billedTo = {
		name: req.user?.name || "Customer",
		email: req.user?.email,
	};
	writeInvoicePDF(doc, inv, billedTo);

	doc.end();
});

/**
 * GET /invoices/export?from=YYYY-MM-DD&to=YYYY-MM-DD
 * Streams a ZIP of PDFs for all invoices in the given range (or all).
 */
router.get("/invoices/export", async (req, res) => {
	const { from, to } = req.query;
	const userId = req.user?.id;
	if (!userId) return res.status(401).json({ message: "Unauthorized" });

	const all = filterByUserAndDate(DEMO_PAYMENTS, userId, from, to).sort(
		(a, b) => new Date(a.createdAt) - new Date(b.createdAt) // oldest first in ZIP
	);

	if (!all.length)
		return res.status(404).json({ error: "No invoices in that range" });

	res.setHeader("Content-Type", "application/zip");
	res.setHeader(
		"Content-Disposition",
		`attachment; filename=invoices_${from || "all"}_${to || "all"}.zip`
	);

	const archive = archiver("zip", { zlib: { level: 9 } });
	archive.on("error", (err) => {
		console.error("[invoices/export] archive error", err);
		if (!res.headersSent) res.status(500).end("Archive error");
	});
	archive.pipe(res);

	// Build each PDF and append to the ZIP
	for (const inv of all) {
		const pdfStream = new PDFDocument({ size: "A4", margin: 50 });
		const chunks = [];
		pdfStream.on("data", (chunk) => chunks.push(chunk));

		await new Promise((resolve) => {
			pdfStream.on("end", resolve);

			const billedTo = {
				name: req.user?.name || "Customer",
				email: req.user?.email,
			};
			writeInvoicePDF(pdfStream, inv, billedTo);
			pdfStream.end();
		});

		archive.append(Buffer.concat(chunks), { name: `${inv.id}.pdf` });
	}

	archive.finalize();
});

module.exports = router;
