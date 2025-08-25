// ~/verblizr-backend/src/lib/tts/googleTTS.mjs
import "dotenv/config";
import textToSpeech from "@google-cloud/text-to-speech";
import { storage, buckets } from "../gcs.mjs";

const client = new textToSpeech.TextToSpeechClient();

/**
 * Synthesize text to an MP3 buffer using Google Cloud TTS.
 * Defaults to Urdu (India) ur-IN Chirp3 HD voice.
 */
export async function synthesizeToBuffer({
	text,
	languageCode = process.env.GCP_TTS_LANG || "ur-IN",
	voiceName = process.env.GCP_TTS_VOICE || "ur-IN-Chirp3-HD-Achernar",
	speakingRate = Number(process.env.GCP_TTS_RATE || 1.0),
	pitch = Number(process.env.GCP_TTS_PITCH || 0.0),
	audioEncoding = "MP3",
}) {
	if (!text || !text.trim())
		throw new Error("synthesizeToBuffer: text is empty");
	const request = {
		input: { text },
		voice: { languageCode, name: voiceName },
		audioConfig: { audioEncoding, speakingRate, pitch },
	};
	const [response] = await client.synthesizeSpeech(request);
	if (!response.audioContent) throw new Error("No audioContent returned");
	return Buffer.from(response.audioContent);
}

/**
 * Synthesize and upload to the artifacts bucket. Returns gs:// URI.
 */
export async function synthesizeToGCS({
	text,
	objectKey,
	contentType = "audio/mpeg",
}) {
	if (!objectKey) throw new Error("synthesizeToGCS: objectKey is required");
	const buf = await synthesizeToBuffer({ text });
	const bucket = storage.bucket(buckets.artifacts);
	const file = bucket.file(objectKey);
	await file.save(buf, { contentType, resumable: false });
	return `gs://${buckets.artifacts}/${objectKey}`;
}

/**
 * Synthesize text to GCS and return both gs:// and a time-limited HTTPS signed URL.
 */
export async function synthesizeToSignedUrl({
	text,
	prefix = "tts-signedurl",
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
