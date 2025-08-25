
# Verblizr — Full Setup & Ops Guide
_Last updated: 25 Aug 2025 (Europe/London)_

This guide documents how to configure **GCP**, **OpenAI**, **ElevenLabs**, local dev, environment variables, and common troubleshooting for the Verblizr project.

> **Repo layout (your machine)**  
> - Frontend (React Native, bare): `~/verblizerRN`  
> - Backend (Node): `~/verblizr-backend`

---

## 1) Local Prerequisites

- **Node.js 18+** and **npm** (you prefer npm)
- **Xcode** with iOS Simulator (for iOS)
- **Android Studio** with SDKs (for Android)
- **jq** (for shell JSON parsing in test commands)
- **curl** (for quick endpoint checks)
- **Git** (optional but recommended)

**Why:** The backend uses Node; the frontend is RN native (no Expo). `jq` and `curl` let you run quick health checks and extract fields (e.g., signed URLs).

---

## 2) Environment Variables (we use `.env`, not `.env.local`)

### 2.1 Backend `.env`
Create/edit `~/verblizr-backend/.env` with the following keys (adjust values):

```bash
# --- App / Server ---
PORT=5055
NODE_ENV=development
API_BASE_URL=http://localhost:5055

# --- OpenAI ---
OPENAI_API_KEY=sk-...

# --- ElevenLabs (optional TTS provider) ---
ELEVENLABS_API_KEY=el-...

# --- GCP / Google Cloud ---
GCP_PROJECT_ID=your-project-id
GCP_BUCKET=your-gcs-bucket-name
# Absolute path to your Service Account JSON file on disk:
GOOGLE_APPLICATION_CREDENTIALS=/Users/YOU/path/to/service-account.json

# --- Feature flags / provider switches ---
# tts: "gcp" or "elevenlabs"
TTS_PROVIDER=gcp
# asr: "openai" (whisper) for now
ASR_PROVIDER=openai
# mt: "openai" for now
MT_PROVIDER=openai
```

> **Important:** Ensure the backend actually **loads** this `.env`. See section **3.4 Load .env in Node**.

### 2.2 Frontend `.env`
Create/edit `~/verblizerRN/.env` (or a constants file) to point to your backend:
```bash
API_BASE_URL=http://localhost:5055
```

If you keep config inside TypeScript instead, update:
- `~/verblizerRN/src/config.ts` (or wherever `API_BASE_URL`/endpoints are defined).

**Why:** The app needs to call your local backend for TTS/health and later ASR/MT endpoints.

---

## 3) Google Cloud Platform (GCP) Setup

### 3.1 Create a project & enable services
- Create/choose a GCP project.
- Enable **Cloud Storage** (required for signed URLs).  
  _Optional (later): Cloud Run, Speech-to-Text, etc._

**Why:** We store generated TTS audio in a GCS bucket and return a **time-limited signed URL** to the client.

### 3.2 Service Account & JSON key
- Create a **Service Account** with at least `Storage Object Admin` on your bucket.
- Download the **JSON key** and save it somewhere safe.
- Set `GOOGLE_APPLICATION_CREDENTIALS` in backend `.env` to the absolute path of that file.

**Why:** The backend needs credentials to sign URLs and upload/read objects.

### 3.3 Bucket
- Create a bucket, e.g. `verblizr-dev-audio`.
- Keep it **private** (we rely on **signed URLs** for access).

**Common pitfall:** CORS. If the RN app or any web tool hits GCS directly, configure CORS for the bucket. (For pure signed URL playback in RN, often not needed.)

### 3.4 Load `.env` in Node
Make sure your dev script loads `.env`. Two supported options:

**Option A — tiny code change (recommended)**
1. Install dotenv (once):
   ```bash
   # (backend root) ~/verblizr-backend
   npm install dotenv
   ```
   **What this does:** Adds the `dotenv` package so Node can read `.env` files automatically.

2. At the **very top** of `~/verblizr-backend/scripts/dev-tts-api.mjs`, add:
   ```js
   import 'dotenv/config';
   ```
   **What this does:** Loads `.env` before your code runs, populating `process.env`.

**Option B — no code change, use Node flag**
```bash
# (backend root) ~/verblizr-backend
node -r dotenv/config ./scripts/dev-tts-api.mjs
```
**What this does:** Preloads dotenv so `.env` is loaded for this process.

> Quick verification:
> ```bash
> # (backend root) ~/verblizr-backend
> node -r dotenv/config -e "console.log(process.env.PORT, Boolean(process.env.OPENAI_API_KEY))"
> ```
> **What this does:** Prints your `PORT` and whether `OPENAI_API_KEY` is set (`true/false`).

---

## 4) OpenAI Setup

- Create an **API key** and place it in: `OPENAI_API_KEY` (backend `.env`).
- Whisper (ASR), Chat/Completions (MT/translation) use this key.

**Why:** ASR/Translation/TTS orchestration in the backend uses OpenAI services (ASR+MT currently).

---

## 5) ElevenLabs (Optional TTS)

- Create an **API key** and place it in: `ELEVENLABS_API_KEY` (backend `.env`).
- Switch provider with `TTS_PROVIDER=elevenlabs` to test.

**Why:** Backup/alternate TTS for languages/voices. We discovered **Deepgram** lacks Urdu; ElevenLabs/GCP can be alternates.

---

## 6) Backend: Dev APIs and Tests

The backend currently exposes:
- `GET /__health` → simple health check
- `POST /api/tts { "text": "..." }` → returns `{ signedUrl }`

### 6.1 Start the dev TTS server
```bash
# (backend root) ~/verblizr-backend
env PORT=5055 node ./scripts/dev-tts-api.mjs
```
**What this does:** Starts the dev TTS API on **http://localhost:5055** and prints available endpoints.

> If you used **Option B** above, run:
> ```bash
> node -r dotenv/config ./scripts/dev-tts-api.mjs
> ```
> **What this does:** Starts the server while loading `.env` automatically.

### 6.2 Health check
```bash
# (backend root)
curl -sS http://localhost:5055/__health
```
**What this does:** Ensures the server process is reachable. Expect:
```json
{"ok":true,"name":"dev-tts-api","time":"..."}
```

### 6.3 TTS smoke test
```bash
# (backend root)
SIGNED_URL=$(curl -sS -X POST http://localhost:5055/api/tts \
  -H "Content-Type: application/json" \
  -d '{"text":"Hello from Verblizr"}' | jq -r .signedUrl)

# Inspect headers
curl -I "$SIGNED_URL"
```
**What this does:** Generates TTS, uploads to GCS, signs a URL, and returns it. The header check should show `200 OK` and `content-type: audio/mpeg`.

---

## 7) Frontend (React Native)

### 7.1 Install & iOS prep
```bash
# (frontend root) ~/verblizerRN
npm install

# iOS native deps
cd ios
pod install
cd ..
```
**What this does:** Installs JS deps; installs CocoaPods for iOS native modules.

### 7.2 Start Metro + run iOS
```bash
# (frontend root) ~/verblizerRN
npx react-native start
# in a new terminal (same folder)
npx react-native run-ios
```
**What this does:** Starts the Metro bundler and launches the iOS simulator build.

### 7.3 Android
```bash
# (frontend root) ~/verblizerRN
npx react-native run-android
```
**What this does:** Builds and launches the Android app on a connected device/emulator.

> If the frontend also needs `.env` at runtime (e.g., using `react-native-config`), ensure you’ve integrated the library; otherwise keep API base URLs in a TS config file.

---

## 8) One-shot startup helper (your script)

You have `~/start-verblizr.sh` which opens tabs for:
- Backend: `npm run dev`
- Metro bundler
- iOS run target

We discussed adding **cache clear** for safer runs. Example commands you can incorporate:

```bash
# (frontend root) ~/verblizerRN
# Clear Metro and RN caches
rm -rf $TMPDIR/metro-* && rm -rf $TMPDIR/haste-map-*
npm start -- --reset-cache

# iOS clean
cd ios && xcodebuild -workspace VerblizrRN.xcworkspace -scheme VerblizrRN -configuration Debug clean && cd ..

# Android clean
cd android && ./gradlew clean && cd ..
```
**What this does:** Removes stale caches that often cause red screen errors or missing modules; cleans native build artifacts.

---

## 9) Where to change keys/services later

### 9.1 Backend
- File: `~/verblizr-backend/.env`
  - `OPENAI_API_KEY` — rotate OpenAI keys.
  - `ELEVENLABS_API_KEY` — rotate ElevenLabs keys.
  - `GOOGLE_APPLICATION_CREDENTIALS` — point to a new Service Account JSON if rotated.
  - `GCP_BUCKET` — switch buckets/environments.
  - `TTS_PROVIDER`, `ASR_PROVIDER`, `MT_PROVIDER` — flip providers as needed.

> **Command to reload env in a new shell (Option B):**
> ```bash
> # (backend root) ~/verblizr-backend
> node -r dotenv/config ./scripts/dev-tts-api.mjs
> ```
> **What this does:** Restarts the dev server so it reads the `.env` values.

### 9.2 Frontend
- File: `~/verblizerRN/.env` **or** `~/verblizerRN/src/config.ts`
  - `API_BASE_URL` — point to staging/prod backend.

> **Command to pick up changes:**
> ```bash
> # (frontend root) ~/verblizerRN
> npm start -- --reset-cache
> ```
> **What this does:** Restarts Metro with cache reset so updated config is bundled.

---

## 10) Permissions & UX (Mobile)

- **Microphone**: iOS requires `NSMicrophoneUsageDescription` in `Info.plist`; Android requires `RECORD_AUDIO` permission and, if needed, `MODIFY_AUDIO_SETTINGS`.
- **Network**: If you test on a physical device, ensure it can reach your dev machine (same LAN, or use tunneling).

**Why:** The dashboard’s mic + network health pills depend on these capabilities.

---

## 11) Billing & Invoices (Frontend)

- Screen: likely `~/verblizerRN/src/screens/PaymentHistoryScreen.tsx`
- API helpers: `~/verblizerRN/src/features/invoices/api.ts`
- File utils: `~/verblizerRN/src/utils/file.ts`

**What to configure:** Ensure `API_BASE_URL` points to a backend endpoint that returns invoice lists and downloadable PDFs/ZIPs (stubbed now).

---

## 12) Troubleshooting

### 12.1 Signed URL returns 403/expired
- Cause: URL TTL passed, or Service Account lacks bucket perms.
- Fix:
  - Re-generate by calling `/api/tts` again.
  - Verify bucket IAM: the SA must read objects.
  - Check system clock skew on your machine (affects signature validity).

### 12.2 CORS errors on GCS
- Cause: Direct browser access without permitted origins.
- Fix: Add a CORS JSON to bucket (if needed) or proxy through backend.

### 12.3 “Cannot find module …” or red screen in RN
- Fix: Clear Metro cache (`npm start -- --reset-cache`) and reinstall pods (`cd ios && pod install`).

### 12.4 iOS build fails after native changes
- Fix: `cd ios && pod deintegrate && pod install`. Then clean build folder in Xcode, rebuild.

### 12.5 Android “SDK/NDK missing”
- Fix: Open Android Studio → SDK Manager → install required SDKs; run `./gradlew clean` then rebuild.

### 12.6 Audio won’t play on device
- Check microphone permissions.
- Check that the **signed URL** loads in `curl -I` and returns `200`.
- Ensure `content-type` is audio/mpeg and the URL hasn’t expired.

---

## 13) From-scratch Setup Checklist (Fast Path)

1. **Clone/move repos** to:
   - `~/verblizerRN` (frontend)
   - `~/verblizr-backend` (backend)
2. **Create or edit `.env`** in both roots with values shown above.
3. **GCP**: Project → Service Account → JSON key → Bucket → set envs.
4. **OpenAI**: create key → set `OPENAI_API_KEY`.
5. (Optional) **ElevenLabs**: create key → set `ELEVENLABS_API_KEY`; set `TTS_PROVIDER=elevenlabs` to test.
6. **Backend**: ensure `.env` loads (Option A or B), run the dev TTS server; do health check + TTS smoke test.
7. **Frontend**: `npm install`, `pod install`, run iOS/Android.
8. **If errors**: use troubleshooting section and cache-clean commands.

---

## 14) Useful Test Commands (with explanations)

```bash
# (backend) Verify .env is loading (without changing code)
node -r dotenv/config -e "console.log(process.env.PORT, Boolean(process.env.OPENAI_API_KEY))"
# → Prints your PORT and whether OPENAI_API_KEY is set (true/false).

# (backend) Health check
curl -sS http://localhost:5055/__health
# → Confirms the server process is alive and time is printed.

# (backend) Generate TTS and get signed URL
curl -sS -X POST http://localhost:5055/api/tts \
  -H "Content-Type: application/json" \
  -d '{"text":"Hello from Verblizr"}'
# → Returns JSON with { "signedUrl": "..." }.

# (backend) Verify signed URL headers (validity, content-type)
curl -I "$SIGNED_URL"
# → Expect HTTP/2 200 and content-type: audio/mpeg.
```

---

## 15) Production Notes (ahead)

- Use separate **GCP project + bucket** for prod.
- Rotate keys and keep them out of repos (use CI/CD secrets).
- Consider moving the dev TTS API to **Cloud Run** (containerized).

---

**End of Guide**
