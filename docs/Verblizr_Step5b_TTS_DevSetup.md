
# Verblizr — Step 5b: Temporary TTS Test Button & Backend TTS Dev API
**Date:** 2025-08-24 04:18 UTC

This document captures *everything we set up* to test Text‑to‑Speech end‑to‑end on device using a **time‑limited signed URL** from Google Cloud Storage (GCS). It’s safe to commit into your repo (no secrets inside).

> **Project roots**
> - **Frontend (React Native):** `~/VerblizrRN`  *(note the capital V)*
> - **Backend (Node):** `~/verblizr-backend`

---

## 1) Frontend changes (React Native)

### 1.1 Add a temporary “Test TTS” button (Dashboard)
**File to edit:** `~/VerblizrRN/src/screens/DashboardScreen.tsx`  
**Why:** Quick end‑to‑end test without touching the mic/ASR/MT flow.

**What we added**
- Import (merged into your existing import so `Linking` is not duplicated):
```ts
import { Linking, Button, View } from 'react-native';
import { createTtsSignedUrl } from '../features/tts/api';
import { API_BASE } from '../config/api';
```
- Temporary button near the bottom (placed **above `<Footer />`**):
```tsx
<View style={{ marginHorizontal: 16, marginTop: 12 }}>
  <Button
    title="🔊 Test TTS"
    onPress={async () => {
      try {
        console.log('[TTS] calling', `${API_BASE}/api/tts`);
        const url = await createTtsSignedUrl('Hello, this is a Verblizr TTS test.');
        console.log('[TTS] signedUrl =>', url);
        await Linking.openURL(url);
      } catch (err: any) {
        console.error('[TTS] error:', err?.message || err);
      }
    }}
  />
</View>
```

**What this does**  
Calls your backend `POST /api/tts` → returns a **signedUrl** → opens it in Safari / system player, so you can hear audio.

---

### 1.2 API client already present
**File:** `~/VerblizrRN/src/features/tts/api.ts`  
We used your existing implementation:
```ts
import { API_BASE } from '../../config/api';

type TtsResponse = { signedUrl: string; gsUri: string; objectKey: string };

export async function createTtsSignedUrl(text: string, signal?: AbortSignal): Promise<string> {
  if (!text?.trim()) throw new Error('Text is required');
  const res = await fetch(`${API_BASE}/api/tts`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text }), signal });
  if (!res.ok) { const err = await res.text().catch(() => res.statusText); throw new Error(`TTS failed (${res.status}): ${err}`); }
  const data = (await res.json()) as TtsResponse;
  if (!data?.signedUrl) throw new Error('No signedUrl in response');
  return data.signedUrl;
}
```

---

### 1.3 API base for Simulator vs Device
**File:** `~/VerblizrRN/src/config/api.ts`  
**Why:** Simulator can hit the Mac with `127.0.0.1` / `localhost`; a *real device* needs your Mac’s **LAN IP**.

Example:
```ts
export const API_BASE =
  __DEV__ ? 'http://127.0.0.1:5055' : 'https://YOUR_PROD_API_HOST';
// For real iPhone testing (replace the dev value):
// export const API_BASE = 'http://192.168.1.23:5055';
```

**What this does**  
Ensures the RN app posts to your local dev TTS server.

---

## 2) Backend: Dev TTS API

### 2.1 Dev server
**File:** `~/verblizr-backend/scripts/dev-tts-api.mjs`  
**What it exposes**
- `GET /__health` — uptime check
- `POST /api/tts` — body: `{ "text": "..." }` → returns `{ signedUrl, gsUri, objectKey }`

**Key lines**
```js
import { synthesizeToSignedUrl } from '../src/lib/tts/googleTTS.mjs';

app.post('/api/tts', async (req, res) => {
  const { text, expiresInSeconds = 3600, prefix = 'tts' } = req.body || {};
  const { signedUrl, gsUri, objectKey } = await synthesizeToSignedUrl({ text, prefix, expiresInSeconds });
  res.json({ signedUrl, gsUri, objectKey });
});
```

---

### 2.2 TTS implementation
**File:** `~/verblizr-backend/src/lib/tts/googleTTS.mjs`  
**What it does**
1. Uses **Google Cloud Text‑to‑Speech** to synthesize MP3 into a buffer.  
2. Uploads MP3 to **GCS artifacts bucket**.  
3. Returns a **V4 signed URL** for timed public read.

**Bucket comes from** `buckets.artifacts` (see next).

---

### 2.3 GCS helper & env
**File:** `~/verblizr-backend/src/lib/gcs.mjs`  
Loads from `.env`:
```env
GCP_PROJECT_ID=verblizr-dev-uk
GCS_UPLOADS_BUCKET=verblizr-dev-uk-uploads-uk
GCS_ARTIFACTS_BUCKET=verblizr-dev-uk-artifacts-uk
```

**What this does**  
Defines which GCS buckets are used for uploads & artifacts, and which project to talk to.

---

## 3) GCP setup (service account, APIs, IAM)

### 3.1 Service account JSON (required for signing)
**Why:** V4 GCS signed URLs need a signer with `client_email` + `private_key`.

**Steps**
1. GCP → **IAM & Admin → Service Accounts** → select `verblizr-service-account@…`  
2. **Keys** → **Add Key → Create new key (JSON)** → download.  
3. Move it locally and set env var before starting backend:
```bash
mkdir -p ~/.gcp
mv ~/Downloads/verblizr-service-account-*.json ~/.gcp/verblizr-sa.json

# Every time you start the backend:
export GOOGLE_APPLICATION_CREDENTIALS="$HOME/.gcp/verblizr-sa.json"
```
> If you’re using **fish**, use:  
> `set -x GOOGLE_APPLICATION_CREDENTIALS $HOME/.gcp/verblizr-sa.json`

---

### 3.2 Enable the **Cloud Text‑to‑Speech API**
- GCP Console → **APIs & Services** → enable **Text‑to‑Speech API** (`texttospeech.googleapis.com`).
- Ensure project has **billing** enabled.

**Recommended IAM on the service account**
- `roles/texttospeech.user` — allow using TTS API

---

### 3.3 GCS bucket permissions (minimal)
Target bucket: `gs://verblizr-dev-uk-artifacts-uk`

Grant **write** + **read** at the bucket level:
```bash
# set project (one-time per shell)
gcloud config set project verblizr-dev-uk

# allow creating objects (upload)
gsutil iam ch   serviceAccount:verblizr-service-account@eastern-thinker-470023-c7.iam.gserviceaccount.com:roles/storage.objectCreator   gs://verblizr-dev-uk-artifacts-uk

# allow reading objects (so signed URLs are honored)
gsutil iam ch   serviceAccount:verblizr-service-account@eastern-thinker-470023-c7.iam.gserviceaccount.com:roles/storage.objectViewer   gs://verblizr-dev-uk-artifacts-uk
```
**What these do**
- `objectCreator` → lets the SA upload the synthesized MP3.  
- `objectViewer` → ensures GCS can validate signed URL reads against the signer’s read access.

---

## 4) Running & verifying

### 4.1 Start the backend TTS server (with creds)
**Where:** `~/verblizr-backend`
```bash
export GOOGLE_APPLICATION_CREDENTIALS="$HOME/.gcp/verblizr-sa.json"
env PORT=5055 node ./scripts/dev-tts-api.mjs
```
**What this does**  
Starts the dev API at `http://localhost:5055` with access to your SA key.

---

### 4.2 Quick health check
```bash
curl -sS http://localhost:5055/__health
```
Expected: `{"ok":true,"name":"dev-tts-api",...}`

---

### 4.3 Test TTS from terminal
```bash
# bash/zsh
curl -sS -X POST http://localhost:5055/api/tts   -H "Content-Type: application/json"   -d '{"text":"Hello from Verblizr"}' | jq

# fish
set SIGNED_URL (curl -sS -X POST http://localhost:5055/api/tts   -H "Content-Type: application/json"   -d '{"text":"Hello from Verblizr"}' | jq -r .signedUrl)
echo $SIGNED_URL
curl -I $SIGNED_URL       # should show HTTP/2 200
open $SIGNED_URL          # plays the MP3 in Safari (macOS)
```

**What this does**  
Confirms the backend can synthesize, upload, and sign — and that GCS honors the signed read.

---

### 4.4 Run the app and test the button
**Preferred:** use the launcher script below.  
Or manually:
```bash
# In one terminal tab: backend (see 4.1)
# In a new tab: Metro
cd ~/VerblizrRN
npx react-native start --reset-cache

# In another tab: iOS build
cd ~/VerblizrRN
npx react-native run-ios
```
In Simulator → **Dashboard → tap “🔊 Test TTS”** → Safari opens and plays audio.

**Real device tip**  
Set `API_BASE` to your Mac LAN IP (e.g., `http://192.168.1.23:5055`) then rebuild the app.

---

## 5) macOS helper script (single-window, 3 tabs)

**File:** `~/start-verblizr.sh`  
**Why:** Launches Backend + Metro (reset cache) + iOS in one go. No Watchman required.

```bash
#!/usr/bin/env bash
# ~/start-verblizr.sh (safe v4)

set -euo pipefail

FRONTEND_DIR="$HOME/VerblizrRN"
BACKEND_DIR="$HOME/verblizr-backend"

[[ -d "$FRONTEND_DIR" ]] || { echo "❌ FRONTEND_DIR not found: $FRONTEND_DIR"; exit 1; }
[[ -d "$BACKEND_DIR"   ]] || { echo "❌ BACKEND_DIR not found: $BACKEND_DIR"; exit 1; }

BACKEND_CMD='node index.js'  # or: npm run dev / env PORT=5055 node ./scripts/dev-tts-api.mjs

# Skip Watchman if not installed
if command -v watchman >/dev/null 2>&1; then
  METRO_CMD='if type watchman >/dev/null 2>&1; then watchman watch-del-all; fi; npx react-native start --reset-cache'
else
  METRO_CMD='npx react-native start --reset-cache'
fi

osascript <<APPLESCRIPT
tell application "Terminal"
  activate
  do script "cd $BACKEND_DIR; echo '▶ Backend: $BACKEND_CMD'; $BACKEND_CMD"
  delay 0.2
  tell application "System Events" to keystroke "t" using command down
  do script "cd $FRONTEND_DIR; echo '▶ Metro: cache reset'; $METRO_CMD" in front window
  delay 0.2
  tell application "System Events" to keystroke "t" using command down
  do script "cd $FRONTEND_DIR; echo '▶ iOS: run-ios'; npx react-native run-ios" in front window
end tell
APPLESCRIPT
```

**Make executable & run**
```bash
chmod +x ~/start-verblizr.sh
~/start-verblizr.sh
```
**What it does**
- **Tab 1** Backend (your chosen command)  
- **Tab 2** Metro with cache reset (watchman optional)  
- **Tab 3** iOS build & run

---

## 6) iOS cleanup (if needed)

**Why:** If you previously ran commands from `ios/`, you may have stale Pods/build artifacts.

**Preview (non‑destructive)**
```bash
ls -ld ~/VerblizrRN/ios/Pods ~/VerblizrRN/ios/build ~/VerblizrRN/ios/Podfile.lock 2>/dev/null || true
```

**Clean (safe deletions)**
```bash
rm -rf ~/VerblizrRN/ios/Pods ~/VerblizrRN/ios/build ~/VerblizrRN/ios/Podfile.lock
cd ~/VerblizrRN/ios && pod install
```

**Clear Xcode DerivedData (global)**
```bash
rm -rf ~/Library/Developer/Xcode/DerivedData
```

---

## 7) Common errors we solved (and fixes)

- **“Identifier 'Linking' has already been declared.”**  
  → You imported `Linking` twice in `DashboardScreen.tsx`. **Fix:** merge into a single `react-native` import.

- **“Cannot sign data without `client_email`.”**  
  → Backend started **without** `GOOGLE_APPLICATION_CREDENTIALS` or wrong JSON file. **Fix:** export the env var in the same shell before starting the server; ensure JSON contains `client_email` & `private_key`.

- **PERMISSION_DENIED (Text‑to‑Speech API disabled).**  
  → Enable **Cloud Text‑to‑Speech API** and ensure billing is enabled; give the SA `roles/texttospeech.user`.

- **“storage.objects.create denied”** on `verblizr-dev-uk-artifacts-uk`.  
  → The SA couldn’t write to the bucket. **Fix:** grant `roles/storage.objectCreator` on that bucket.

- **Safari shows AccessDenied / ‘storage.objects.get’ denied.**  
  → The SA that signed the URL lacked read permission. **Fix:** grant `roles/storage.objectViewer` on that bucket.

- **fish shell var assignment error.**  
  → Use `set -x VAR value` and `set VAR (command ...)` in fish; not `VAR=value` or `$()`.

---

## 8) Current status

- ✅ Backend dev TTS API up on `http://localhost:5055`  
- ✅ Signed URLs generated successfully to `gs://verblizr-dev-uk-artifacts-uk/...`  
- ✅ iOS Simulator button **opens and plays audio**

---

## 9) Suggested next small steps (optional)

- Add a small **DEV TTS panel** (TextInput + “Play”) under `__DEV__` to test arbitrary lines.
- Store the SA env var in your shell profile or bake it into the launcher script so you don’t have to re‑export each time.
- Add short retention or auto‑cleanup for artifacts in the dev bucket (e.g., GCS lifecycle rule 7–30 days).

---

**End of document.**
