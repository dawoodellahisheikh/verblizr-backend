# Verblizr Backend API

A comprehensive Node.js/Express backend API for the Verblizr mobile application, providing text-to-speech, speech recognition, translation, and cloud storage services.

## 🚀 Features

### Core Services
- **Text-to-Speech (TTS)** - Google Cloud TTS integration with voice synthesis
- **Speech Recognition** - Google Cloud Speech-to-Text API
- **Translation Services** - OpenAI GPT and Google Cloud Translation
- **Audio Transcription** - OpenAI Whisper integration
- **Cloud Storage** - Google Cloud Storage for file management
- **User Authentication** - JWT-based authentication system
- **Billing Integration** - Stripe payment processing

### Security & Performance
- **Rate Limiting** - Configurable rate limits per service
- **Security Headers** - Helmet.js security middleware
- **CORS Protection** - Cross-origin resource sharing configuration
- **Input Validation** - Zod schema validation
- **Error Handling** - Comprehensive error handling and logging

## 📋 API Endpoints

### Authentication
- `POST /api/auth/login` - User login
- `POST /api/auth/register` - User registration
- `GET /api/auth/me` - Get current user profile
- `PUT /api/auth/profile` - Update user profile
- `PUT /api/auth/change-password` - Change user password

### Text-to-Speech (TTS)
- `POST /api/tts/synthesize` - Synthesize speech from text
- `GET /api/tts/voices` - Get available voices
- `GET /api/tts/test` - Test TTS connectivity
- `GET /api/tts/usage` - Get TTS usage statistics

### OpenAI Services
- `POST /api/openai/transcribe` - Audio transcription (Whisper)
- `POST /api/openai/translate` - Text translation (GPT)
- `POST /api/openai/chat` - Chat completion (GPT)
- `GET /api/openai/test` - Test OpenAI connectivity
- `GET /api/openai/usage` - Get OpenAI usage statistics

### Google Cloud Platform
- `POST /api/gcp/storage/upload` - Upload files to GCS
- `POST /api/gcp/storage/download` - Download files from GCS
- `DELETE /api/gcp/storage/delete` - Delete files from GCS
- `GET /api/gcp/storage/list` - List files in GCS
- `POST /api/gcp/speech-to-text` - Speech recognition
- `POST /api/gcp/translate` - Text translation
- `GET /api/gcp/test` - Test GCP connectivity
- `GET /api/gcp/usage` - Get GCP usage statistics

### Billing
- `GET /api/billing/health` - Billing service health check
- `POST /api/billing/setup-intent` - Create payment setup intent
- `GET /api/billing/payment-methods` - Get user payment methods
- `DELETE /api/billing/payment-methods/:id` - Delete payment method
- `GET /api/billing/customer` - Get customer information

### System
- `GET /health` - System health check

## 🛠️ Setup & Installation

### Prerequisites
- Node.js 18.17.0 or higher
- npm or yarn package manager
- Google Cloud Platform account with enabled APIs
- OpenAI API account
- Stripe account (for billing)

### 1. Clone and Install
```bash
cd BACKEND
npm install
```

### 2. Environment Configuration
Copy the example environment file and configure your settings:
```bash
cp .env.example .env
```

Edit `.env` with your actual configuration:

#### Required Configuration
```env
# Server
PORT=4000
JWT_SECRET=your-super-secret-jwt-key

# OpenAI
OPENAI_API_KEY=your-openai-api-key

# Google Cloud Platform
GOOGLE_APPLICATION_CREDENTIALS=path/to/service-account-key.json
GCP_PROJECT_ID=your-gcp-project-id
GCP_STORAGE_BUCKET=your-storage-bucket
GCP_ARTIFACTS_BUCKET=your-artifacts-bucket

# Stripe (for billing)
STRIPE_SECRET_KEY=your-stripe-secret-key
```

### 3. Google Cloud Setup

#### Enable Required APIs
```bash
# Enable required Google Cloud APIs
gcloud services enable texttospeech.googleapis.com
gcloud services enable speech.googleapis.com
gcloud services enable translate.googleapis.com
gcloud services enable storage.googleapis.com
```

#### Create Service Account
```bash
# Create service account
gcloud iam service-accounts create verblizr-backend

# Grant necessary permissions
gcloud projects add-iam-policy-binding YOUR_PROJECT_ID \
    --member="serviceAccount:verblizr-backend@YOUR_PROJECT_ID.iam.gserviceaccount.com" \
    --role="roles/storage.admin"

gcloud projects add-iam-policy-binding YOUR_PROJECT_ID \
    --member="serviceAccount:verblizr-backend@YOUR_PROJECT_ID.iam.gserviceaccount.com" \
    --role="roles/cloudtranslate.user"

gcloud projects add-iam-policy-binding YOUR_PROJECT_ID \
    --member="serviceAccount:verblizr-backend@YOUR_PROJECT_ID.iam.gserviceaccount.com" \
    --role="roles/speech.editor"

# Create and download service account key
gcloud iam service-accounts keys create service-account-key.json \
    --iam-account=verblizr-backend@YOUR_PROJECT_ID.iam.gserviceaccount.com
```

#### Create Storage Buckets
```bash
# Create storage buckets
gsutil mb gs://your-storage-bucket
gsutil mb gs://your-artifacts-bucket
```

### 4. Start the Server

#### Development Mode
```bash
npm run dev
```

#### Production Mode
```bash
npm start
```

The server will start on `http://localhost:4000` (or your configured PORT).

## 🧪 Testing the API

### Health Check
```bash
curl http://localhost:4000/health
```

### Test TTS Service
```bash
curl http://localhost:4000/api/tts/test
```

### Test OpenAI Service
```bash
curl http://localhost:4000/api/openai/test
```

### Test GCP Service
```bash
curl http://localhost:4000/api/gcp/test
```

### Synthesize Speech
```bash
curl -X POST http://localhost:4000/api/tts/synthesize \
  -H "Content-Type: application/json" \
  -d '{
    "text": "Hello, this is a test of the text-to-speech service.",
    "languageCode": "en-US",
    "voiceName": "en-US-Standard-A"
  }'
```

## 📊 Rate Limiting

The API implements multiple layers of rate limiting:

- **Global**: 1000 requests per 15 minutes per IP
- **API Routes**: 500 requests per 15 minutes per IP
- **TTS/OpenAI/GCP**: 100 requests per 15 minutes per IP (due to cost)

## 🔒 Security Features

- **Helmet.js**: Security headers and CSP
- **CORS**: Configurable cross-origin resource sharing
- **Rate Limiting**: Multiple tiers of rate limiting
- **Input Validation**: Zod schema validation on all endpoints
- **JWT Authentication**: Secure token-based authentication
- **Error Sanitization**: Safe error responses without sensitive data

## 📈 Usage Tracking

The API tracks usage statistics for all services:

- **TTS**: Characters processed, requests count, cost estimates
- **OpenAI**: Tokens used, transcription minutes, translation characters
- **GCP**: Storage operations, speech minutes, translation characters

Access usage statistics via the `/usage` endpoints for each service.

## 🚨 Error Handling

The API provides consistent error responses:

```json
{
  "success": false,
  "error": "Error message",
  "details": "Additional error details (in development)"
}
```

## 🔧 Configuration Options

### Environment Variables

| Variable | Description | Default |
|----------|-------------|----------|
| `PORT` | Server port | `4000` |
| `NODE_ENV` | Environment mode | `development` |
| `JWT_SECRET` | JWT signing secret | Required |
| `OPENAI_API_KEY` | OpenAI API key | Required |
| `GCP_PROJECT_ID` | Google Cloud project ID | Required |
| `GCP_STORAGE_BUCKET` | Main storage bucket | `verblizr-storage` |
| `GCP_ARTIFACTS_BUCKET` | Artifacts bucket | `verblizr-artifacts` |
| `STRIPE_SECRET_KEY` | Stripe secret key | Required |

### Rate Limiting Configuration

```env
RATE_LIMIT_WINDOW_MS=900000  # 15 minutes
RATE_LIMIT_MAX_REQUESTS=1000
API_RATE_LIMIT_MAX=500
TTS_RATE_LIMIT_MAX=100
```

## 📝 Development

### Project Structure
```
BACKEND/
├── routes/
│   ├── tts.js          # Text-to-speech endpoints
│   ├── openai.js       # OpenAI service endpoints
│   ├── gcp.js          # Google Cloud Platform endpoints
│   ├── billing.js      # Stripe billing endpoints
│   └── invoices.js     # Invoice management
├── src/
│   └── lib/
│       ├── tts/
│       │   └── googleTTS.mjs
│       └── gcs.mjs
├── scripts/            # Development and testing scripts
├── index.js           # Main server file
├── package.json       # Dependencies and scripts
└── .env.example       # Environment configuration template
```

### Adding New Endpoints

1. Create a new route file in `/routes/`
2. Implement validation schemas using Zod
3. Add error handling and usage tracking
4. Mount the routes in `index.js`
5. Update this README with endpoint documentation

### Testing

```bash
# Run tests (when implemented)
npm test

# Security audit
npm audit

# Check for vulnerabilities
npm run security-check
```

## 🚀 Deployment

### Production Checklist

- [ ] Set `NODE_ENV=production`
- [ ] Configure strong `JWT_SECRET`
- [ ] Set up proper Google Cloud service account
- [ ] Configure production OpenAI API key
- [ ] Set up Stripe production keys
- [ ] Configure CORS for production domains
- [ ] Set up proper logging and monitoring
- [ ] Configure SSL/TLS certificates
- [ ] Set up database (if using persistent storage)
- [ ] Configure backup strategies

### Docker Deployment (Optional)

```dockerfile
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY . .
EXPOSE 4000
CMD ["npm", "start"]
```

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Update documentation
6. Submit a pull request

## 📄 License

This project is licensed under the ISC License.

## 🆘 Support

For support and questions:

1. Check the API endpoint responses for detailed error messages
2. Verify your environment configuration
3. Check the server logs for detailed error information
4. Ensure all required services (GCP, OpenAI, Stripe) are properly configured

## 🔄 Version History

### v1.0.0
- Initial release with full API implementation
- TTS, OpenAI, and GCP service integration
- Authentication and billing systems
- Rate limiting and security features
- Comprehensive error handling and logging
