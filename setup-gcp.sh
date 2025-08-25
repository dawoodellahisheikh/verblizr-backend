#!/bin/bash
# ---------- Verblizr — GCP base setup (Step 1 final) ----------
# Safe to re-run; commands are idempotent.

set -euo pipefail

# 👉 Update these if you chose different values
PROJECT_ID="verblizr-dev-uk"                   # your new GCP project id
BILLING_ACCOUNT="017A79-40406D-CC3229"         # your OPEN billing account id
REGION="europe-west2"                          # London

echo "==> Using project: ${PROJECT_ID}"
gcloud config set project "${PROJECT_ID}" >/dev/null

echo "==> Setting default Cloud Run region to ${REGION}"
gcloud config set run/region "${REGION}"

echo "==> Linking billing account ${BILLING_ACCOUNT} to project ${PROJECT_ID}"
# If already linked, this is a no-op and will return successfully.
gcloud billing projects link "${PROJECT_ID}" --billing-account="${BILLING_ACCOUNT}"

echo "==> Enabling core APIs (deploy, registry, build, secrets, IAM, storage, logs, metrics)"
gcloud services enable \
  run.googleapis.com \
  artifactregistry.googleapis.com \
  cloudbuild.googleapis.com \
  secretmanager.googleapis.com \
  iam.googleapis.com \
  iamcredentials.googleapis.com \
  storage.googleapis.com \
  logging.googleapis.com \
  monitoring.googleapis.com

echo "==> (Local auth) Launching Application Default Credentials login..."
echo "    A browser will open; select the SAME account you used for gcloud."
# This opens the browser — complete the consent to store local ADC.
gcloud auth application-default login

echo "==> Verifying billing is enabled..."
gcloud beta billing projects describe "${PROJECT_ID}" --format="value(billingEnabled)"

echo "==> Listing enabled services count (should be > 10):"
gcloud services list --enabled | wc -l

echo "==> Done. Core GCP setup for ${PROJECT_ID} is complete."
# --------------------------------------------------------------
