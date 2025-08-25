// Loads .env automatically
import "dotenv/config";
import { Storage } from "@google-cloud/storage";

const projectId = process.env.GCP_PROJECT_ID;
if (!projectId) throw new Error("GCP_PROJECT_ID missing in .env");

export const storage = new Storage({ projectId });

export const buckets = {
	uploads: process.env.GCS_UPLOADS_BUCKET,
	artifacts: process.env.GCS_ARTIFACTS_BUCKET,
};

if (!buckets.uploads || !buckets.artifacts) {
	throw new Error(
		"Bucket env vars missing: GCS_UPLOADS_BUCKET / GCS_ARTIFACTS_BUCKET"
	);
}

export async function putText(
	bucketName,
	objectKey,
	contents,
	contentType = "text/plain; charset=utf-8"
) {
	const bucket = storage.bucket(bucketName);
	const file = bucket.file(objectKey);
	await file.save(contents, { contentType, resumable: false });
	return `gs://${bucketName}/${objectKey}`;
}

export async function getText(bucketName, objectKey) {
	const [buf] = await storage.bucket(bucketName).file(objectKey).download();
	return buf.toString("utf8");
}
