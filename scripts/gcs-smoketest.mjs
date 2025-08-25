import "../node_modules/dotenv/config.js"; // ensure .env is loaded
import { putText, getText, buckets } from "../src/lib/gcs.mjs";

async function main() {
	const ts = new Date().toISOString().replace(/[:.]/g, "-");
	const key = `smoketest/${ts}.txt`;
	const msg = `Hello from Verblizr smoketest @ ${new Date().toISOString()}`;

	console.log("Writing to:", `gs://${buckets.uploads}/${key}`);
	const uri = await putText(buckets.uploads, key, msg);
	console.log("Wrote:", uri);

	const roundTrip = await getText(buckets.uploads, key);
	console.log("Read back:", roundTrip);

	if (roundTrip.trim() !== msg.trim()) {
		throw new Error("Round-trip mismatch!");
	}
	console.log("✅ GCS smoketest passed.");
}

main().catch((err) => {
	console.error("❌ Smoketest failed:", err?.stack || err?.message || err);
	process.exit(1);
});

// --- Add this helper at the bottom of googleTTS.mjs ---
/**
 * Synthesize text to GCS and return both gs:// and a time-limited HTTPS signed URL.
 * @returns {Promise<{ gsUri: string, signedUrl: string, objectKey: string }>}
 */
export async function synthesizeToSignedUrl({
	text,
	prefix = "tts",
	expiresInSeconds = 3600, // 1 hour
}) {
	const ts = new Date().toISOString().replace(/[:.]/g, "-");
	const objectKey = `${prefix}/${ts}.mp3`;

	const gsUri = await synthesizeToGCS({ text, objectKey });
	const [signedUrl] = await storage
		.bucket(buckets.artifacts)
		.file(objectKey)
		.getSignedUrl({
			version: "v4",
			action: "read",
			expires: Date.now() + expiresInSeconds * 1000,
		});

	return { gsUri, signedUrl, objectKey };
}
