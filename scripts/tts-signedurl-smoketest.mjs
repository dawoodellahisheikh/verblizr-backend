import "dotenv/config";
import { synthesizeToSignedUrl } from "../src/lib/tts/googleTTS.mjs";

const text =
	process.argv.slice(2).join(" ") || "یہ ایک سائنڈ یو آر ایل ٹیسٹ ہے۔";

async function main() {
	const { gsUri, signedUrl, objectKey } = await synthesizeToSignedUrl({
		text,
		prefix: "tts-signedurl",
	});
	console.log("GS URI   :", gsUri);
	console.log("SIGNED   :", signedUrl);
	console.log("OBJECT   :", objectKey);
	console.log("✅ Open the SIGNED URL in a browser to play the MP3.");
}

main().catch((err) => {
	console.error(
		"❌ Signed URL smoketest failed:",
		err?.stack || err?.message || err
	);
	process.exit(1);
});
