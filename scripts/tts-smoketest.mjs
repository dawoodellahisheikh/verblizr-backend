import "dotenv/config";
import { synthesizeToGCS } from "../src/lib/tts/googleTTS.mjs";
import { buckets } from "../src/lib/gcs.mjs";

const urduText =
	process.argv.slice(2).join(" ") || "سلام! آپ کیسے ہیں؟ یہ ایک ٹیسٹ ہے۔";

async function main() {
	const ts = new Date().toISOString().replace(/[:.]/g, "-");
	const key = `tts-smoketest/${ts}.mp3`;

	console.log("Synthesizing Urdu to:", `gs://${buckets.artifacts}/${key}`);
	const uri = await synthesizeToGCS({ text: urduText, objectKey: key });
	console.log("✅ TTS smoketest uploaded to:", uri);
	console.log(
		`Tip: To list it: gcloud storage objects list gs://${buckets.artifacts}/tts-smoketest/`
	);
}

main().catch((err) => {
	console.error("❌ TTS smoketest failed:", err?.stack || err?.message || err);
	process.exit(1);
});
