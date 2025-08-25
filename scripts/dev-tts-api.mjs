import "dotenv/config";
import express from "express";
import cors from "cors";
import { synthesizeToSignedUrl } from "../src/lib/tts/googleTTS.mjs";

const app = express();
app.use(cors());
app.use(express.json());

// ✅ Health check to confirm we're hitting THIS server
app.get("/__health", (req, res) => {
	res.json({ ok: true, name: "dev-tts-api", time: new Date().toISOString() });
});

/**
 * POST /api/tts
 * body: { text: string, expiresInSeconds?: number, prefix?: string }
 * returns: { signedUrl, gsUri, objectKey }
 */
app.post("/api/tts", async (req, res) => {
	try {
		const { text, expiresInSeconds = 3600, prefix = "tts" } = req.body || {};
		if (!text || typeof text !== "string" || !text.trim()) {
			return res
				.status(400)
				.json({ error: 'Missing or empty "text" in body.' });
		}
		if (text.length > 2000) {
			return res
				.status(413)
				.json({ error: "Text too long (max ~2000 chars for demo)." });
		}

		const { signedUrl, gsUri, objectKey } = await synthesizeToSignedUrl({
			text,
			prefix,
			expiresInSeconds: Number(expiresInSeconds) || 3600,
		});

		res.json({ signedUrl, gsUri, objectKey });
	} catch (err) {
		console.error("TTS error:", err);
		res
			.status(500)
			.json({ error: "TTS failed", detail: String(err?.message || err) });
	}
});

const PORT = process.env.PORT ? Number(process.env.PORT) : 5055;
app.listen(PORT, () => {
	console.log(`▶ Dev TTS API running on http://localhost:${PORT}`);
	console.log(`   Health: GET  http://localhost:${PORT}/__health`);
	console.log(
		`   TTS   : POST http://localhost:${PORT}/api/tts  { "text": "…" }`
	);
});
