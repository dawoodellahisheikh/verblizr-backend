/**
 * websocket-server.js
 * ----------------------------------------------------------------------------
 * DES Added: WebSocket server for live interpretation
 * 
 * Features:
 * - Real-time audio processing via WebSocket on port 8082
 * - Integrates with existing HTTP API endpoints
 * - Speech-to-text using OpenAI Whisper
 * - Translation using OpenAI GPT or Google Translate
 * - Streaming responses back to frontend
 * - Session management and VAD support
 * 
 * Protocol (matches useTurnInterpreter.ts):
 * 
 * Client → Server:
 *   { type: "start", sessionId, from, to, mode, sampleRate }
 *   { type: "audio", pcm16: "<base64>", samples: <int> }
 *   { type: "vad", event: "begin" | "end" }
 *   { type: "pause" } | { type: "resume" } | { type: "stop" }
 * 
 * Server → Client:
 *   { type: "status", status: "listening"|"translating"|"playing", dir?: "AtoB"|"BtoA" }
 *   { type: "partial", text }
 *   { type: "final", asr, mt, lid? }
 *   { type: "error", message }
 */

const WebSocket = require('ws');
const fs = require('fs');
const path = require('path');
const OpenAI = require('openai');
const { Translate } = require('@google-cloud/translate').v2;
const speech = require('@google-cloud/speech');
require('dotenv').config();

// Initialize services
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});
const translate = new Translate();
const speechClient = new speech.SpeechClient();

// WebSocket server on port 8082 (matches frontend expectation)
const WEBSOCKET_PORT = process.env.WEBSOCKET_PORT || 8082;

// Check if port is available before starting
const net = require('net');

function checkPortAvailable(port) {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.listen(port, () => {
      server.close(() => resolve(true));
    });
    server.on('error', () => resolve(false));
  });
}

async function startWebSocketServer() {
  const isPortAvailable = await checkPortAvailable(WEBSOCKET_PORT);
  
  if (!isPortAvailable) {
    console.error(`❌ [WebSocket] Port ${WEBSOCKET_PORT} is already in use!`);
    console.log('💡 [WebSocket] Try killing the process using the port:');
    console.log(`   lsof -ti:${WEBSOCKET_PORT} | xargs kill -9`);
    process.exit(1);
  }
  
  const wss = new WebSocket.Server({ 
    port: WEBSOCKET_PORT,
    perMessageDeflate: false // Better for real-time audio
  });
  
  console.log(`🎙️ [WebSocket] Live interpretation server started on ws://localhost:${WEBSOCKET_PORT}`);
  
  return wss;
}

// Start the WebSocket server
startWebSocketServer().then((wss) => {

// =============================================================================
// LANGUAGE DETECTION & MAPPING
// =============================================================================

const LANGUAGE_MAPPING = {
  'en': { name: 'English', whisper: 'en', google: 'en' },
  'es': { name: 'Spanish', whisper: 'es', google: 'es' },
  'fr': { name: 'French', whisper: 'fr', google: 'fr' },
  'de': { name: 'German', whisper: 'de', google: 'de' },
  'it': { name: 'Italian', whisper: 'it', google: 'it' },
  'pt': { name: 'Portuguese', whisper: 'pt', google: 'pt' },
  'ru': { name: 'Russian', whisper: 'ru', google: 'ru' },
  'ja': { name: 'Japanese', whisper: 'ja', google: 'ja' },
  'ko': { name: 'Korean', whisper: 'ko', google: 'ko' },
  'zh': { name: 'Chinese', whisper: 'zh', google: 'zh' },
  'hi': { name: 'Hindi', whisper: 'hi', google: 'hi' },
  'ar': { name: 'Arabic', whisper: 'ar', google: 'ar' },
  'ur': { name: 'Urdu', whisper: 'ur', google: 'ur' },
  'tr': { name: 'Turkish', whisper: 'tr', google: 'tr' },
  'pl': { name: 'Polish', whisper: 'pl', google: 'pl' },
  'nl': { name: 'Dutch', whisper: 'nl', google: 'nl' },
  'sv': { name: 'Swedish', whisper: 'sv', google: 'sv' },
  'da': { name: 'Danish', whisper: 'da', google: 'da' },
  'no': { name: 'Norwegian', whisper: 'no', google: 'no' },
  'fi': { name: 'Finnish', whisper: 'fi', google: 'fi' }
};

// =============================================================================
// AUDIO PROCESSING UTILITIES
// =============================================================================

/**
 * Convert base64 PCM16LE to WAV file buffer for Whisper
 */
function pcm16ToWav(base64Pcm, sampleRate = 16000, channels = 1) {
  const pcmBuffer = Buffer.from(base64Pcm, 'base64');
  const wavHeaderSize = 44;
  const wavBuffer = Buffer.alloc(wavHeaderSize + pcmBuffer.length);
  
  // WAV header
  wavBuffer.write('RIFF', 0);
  wavBuffer.writeUInt32LE(36 + pcmBuffer.length, 4);
  wavBuffer.write('WAVE', 8);
  wavBuffer.write('fmt ', 12);
  wavBuffer.writeUInt32LE(16, 16); // PCM format chunk size
  wavBuffer.writeUInt16LE(1, 20);  // PCM format
  wavBuffer.writeUInt16LE(channels, 22);
  wavBuffer.writeUInt32LE(sampleRate, 24);
  wavBuffer.writeUInt32LE(sampleRate * channels * 2, 28); // byte rate
  wavBuffer.writeUInt16LE(channels * 2, 32); // block align
  wavBuffer.writeUInt16LE(16, 34); // bits per sample
  wavBuffer.write('data', 36);
  wavBuffer.writeUInt32LE(pcmBuffer.length, 40);
  
  // Copy PCM data
  pcmBuffer.copy(wavBuffer, wavHeaderSize);
  
  return wavBuffer;
}

/**
 * Detect language from text using simple heuristics
 */
function detectLanguageFromText(text) {
  if (!text || text.trim().length === 0) return 'en';
  
  // Simple character-based detection
  const arabicPattern = /[\u0600-\u06FF]/;
  const urduPattern = /[\u0600-\u06FF]/; // Similar to Arabic
  const chinesePattern = /[\u4e00-\u9fff]/;
  const japanesePattern = /[\u3040-\u309f\u30a0-\u30ff]/;
  const koreanPattern = /[\uac00-\ud7af]/;
  const russianPattern = /[\u0400-\u04FF]/;
  
  if (arabicPattern.test(text)) return 'ar';
  if (urduPattern.test(text)) return 'ur';
  if (chinesePattern.test(text)) return 'zh';
  if (japanesePattern.test(text)) return 'ja';
  if (koreanPattern.test(text)) return 'ko';
  if (russianPattern.test(text)) return 'ru';
  
  // Default to English for Latin scripts
  return 'en';
}

/**
 * Get target language for translation
 */
function getTargetLanguage(detectedLang, sessionConfig) {
  const { from, to, mode } = sessionConfig;
  
  if (mode === 'alternate') {
    // In alternate mode, translate to the "other" language
    if (from === 'auto' && to === 'auto') {
      // Auto-detect both: if detected is English, translate to most common alternative
      return detectedLang === 'en' ? 'es' : 'en';
    } else if (from === 'auto') {
      return to;
    } else if (to === 'auto') {
      return from !== detectedLang ? from : 'en';
    } else {
      // Both specified: translate to the one that's not detected
      return detectedLang === from ? to : from;
    }
  }
  
  // Default behavior
  return to === 'auto' ? 'en' : to;
}

// =============================================================================
// SESSION MANAGEMENT
// =============================================================================

class InterpreterSession {
  constructor(ws, sessionId) {
    this.ws = ws;
    this.sessionId = sessionId;
    this.config = null;
    this.state = 'idle'; // idle, listening, translating, playing, paused
    this.audioBuffer = [];
    this.vadState = 'silence'; // silence, speech
    this.isActive = true;
    this.lastActivity = Date.now();
    
    console.log(`[Session ${sessionId}] Created`);
  }
  
  send(message) {
    if (this.ws.readyState === WebSocket.OPEN && this.isActive) {
      this.ws.send(JSON.stringify(message));
      this.lastActivity = Date.now();
    }
  }
  
  updateState(newState, direction = null) {
    this.state = newState;
    this.send({
      type: 'status',
      status: newState,
      ...(direction && { dir: direction })
    });
    console.log(`[Session ${this.sessionId}] State: ${newState}${direction ? ` (${direction})` : ''}`);
  }
  
  sendPartial(text) {
    this.send({
      type: 'partial',
      text: text
    });
  }
  
  sendFinal(asr, translation, detectedLang) {
    this.send({
      type: 'final',
      asr: asr,
      mt: translation,
      lid: detectedLang
    });
    console.log(`[Session ${this.sessionId}] Final result: "${asr}" → "${translation}" (${detectedLang})`);
  }
  
  sendError(message) {
    this.send({
      type: 'error',
      message: message
    });
    console.error(`[Session ${this.sessionId}] Error: ${message}`);
  }
  
  async processAudioChunk(base64Pcm, samples) {
    if (this.state === 'paused') return;
    
    // Add to buffer
    this.audioBuffer.push({ base64Pcm, samples, timestamp: Date.now() });
    
    // Process when we have enough audio (roughly 1-2 seconds)
    const totalSamples = this.audioBuffer.reduce((sum, chunk) => sum + chunk.samples, 0);
    const sampleRate = this.config?.sampleRate || 16000;
    const durationMs = (totalSamples / sampleRate) * 1000;
    
    // Process if we have 1.5+ seconds of audio or VAD detected end
    if (durationMs >= 1500 || this.vadState === 'end_detected') {
      await this.processAccumulatedAudio();
    }
  }
  
  async processAccumulatedAudio() {
    if (this.audioBuffer.length === 0) return;

    try {
      this.updateState('translating');
      
      // Combine all audio chunks
      const combinedPcm = Buffer.concat(
        this.audioBuffer.map(chunk => Buffer.from(chunk.base64Pcm, 'base64'))
      );
      
      // Convert to WAV for Whisper
      const wavBuffer = pcm16ToWav(
        combinedPcm.toString('base64'),
        this.config?.sampleRate || 16000
      );
      
      // Create temporary file for OpenAI (Whisper needs file-like input)
      const tempDir = path.join(__dirname, 'temp');
      if (!fs.existsSync(tempDir)) {
        fs.mkdirSync(tempDir, { recursive: true });
      }
      
      const tempFile = path.join(tempDir, `${this.sessionId}_${Date.now()}.wav`);
      fs.writeFileSync(tempFile, wavBuffer);
      
      try {
        // Speech-to-text with Whisper
        const transcription = await openai.audio.transcriptions.create({
          file: fs.createReadStream(tempFile),
          model: 'whisper-1',
          language: this.config?.from !== 'auto' ? LANGUAGE_MAPPING[this.config.from]?.whisper : undefined,
          response_format: 'json'
        });
        
        const transcribedText = transcription.text?.trim();
        if (!transcribedText) {
          this.updateState('listening');
          return;
        }
        
        console.log(`[Session ${this.sessionId}] Transcribed: "${transcribedText}"`);
        
        // Detect language
        const detectedLang = detectLanguageFromText(transcribedText);
        const targetLang = getTargetLanguage(detectedLang, this.config);
        
        console.log(`[Session ${this.sessionId}] Translation: ${detectedLang} → ${targetLang}`);
        
        // Translate if needed
        let translatedText = transcribedText;
        if (detectedLang !== targetLang) {
          try {
            // Try Google Translate first (faster)
            const [translation] = await translate.translate(transcribedText, {
              from: detectedLang,
              to: targetLang
            });
            translatedText = translation;
          } catch (googleError) {
            console.warn(`[Session ${this.sessionId}] Google Translate failed, using OpenAI:`, googleError.message);
            
            // Fallback to OpenAI GPT
            const completion = await openai.chat.completions.create({
              model: 'gpt-3.5-turbo',
              messages: [
                {
                  role: 'system',
                  content: 'You are a professional translator. Translate the text accurately and return only the translation without any additional commentary.'
                },
                {
                  role: 'user',
                  content: `Translate the following text from ${LANGUAGE_MAPPING[detectedLang]?.name || detectedLang} to ${LANGUAGE_MAPPING[targetLang]?.name || targetLang}: "${transcribedText}"`
                }
              ],
              temperature: 0.3,
              max_tokens: Math.min(transcribedText.length * 2, 1000)
            });
            
            translatedText = completion.choices[0].message.content.trim();
          }
        }
        
        console.log(`[Session ${this.sessionId}] Translated: "${translatedText}"`);
        
        // Send final result
        this.sendFinal(transcribedText, translatedText, detectedLang);
        
        // Update state
        this.updateState('playing');
        
        // Simulate TTS playback duration (frontend handles actual TTS)
        const playbackDuration = Math.max(1000, translatedText.length * 50);
        setTimeout(() => {
          if (this.isActive && this.state === 'playing') {
            this.updateState('listening');
          }
        }, playbackDuration);
        
      } finally {
        // Cleanup temp file
        try {
          fs.unlinkSync(tempFile);
        } catch (error) {
          console.warn(`[Session ${this.sessionId}] Failed to cleanup temp file:`, error.message);
        }
      }
      
    } catch (error) {
      console.error(`[Session ${this.sessionId}] Processing error:`, error);
      this.sendError(`Processing failed: ${error.message}`);
      this.updateState('listening'); // Return to listening state
    } finally {
      // Clear buffer
      this.audioBuffer = [];
      this.vadState = 'silence';
    }
  }
  
  handleVAD(event) {
    this.vadState = event;
    console.log(`[Session ${this.sessionId}] VAD: ${event}`);
    
    if (event === 'begin') {
      // Speech started
      if (this.state === 'listening') {
        // Don't change state yet, wait for actual audio
      }
    } else if (event === 'end') {
      // Speech ended - trigger processing if we have audio
      this.vadState = 'end_detected';
      if (this.audioBuffer.length > 0) {
        setTimeout(() => {
          this.processAccumulatedAudio();
        }, 100); // Small delay to catch any final audio chunks
      }
    }
  }
  
  pause() {
    this.updateState('paused');
  }
  
  resume() {
    this.updateState('listening');
  }
  
  stop() {
    this.isActive = false;
    console.log(`[Session ${this.sessionId}] Stopped`);
  }
}

// =============================================================================
// WEBSOCKET CONNECTION HANDLING
// =============================================================================

const sessions = new Map();

wss.on('connection', (ws, req) => {
  console.log(`[WebSocket] New connection from ${req.socket.remoteAddress}`);
  
  let session = null;
  
  ws.on('message', async (data) => {
    try {
      const message = JSON.parse(data.toString());
      
      switch (message.type) {
        case 'start':
          const { sessionId, from, to, mode, sampleRate, clientVad } = message;
          
          // Create new session
          session = new InterpreterSession(ws, sessionId);
          session.config = { from, to, mode, sampleRate, clientVad };
          sessions.set(sessionId, session);
          
          console.log(`[Session ${sessionId}] Started: ${from} → ${to} (${mode})`);
          session.updateState('listening');
          break;
          
        case 'audio':
          if (session) {
            await session.processAudioChunk(message.pcm16, message.samples);
          }
          break;
          
        case 'vad':
          if (session) {
            session.handleVAD(message.event);
          }
          break;
          
        case 'pause':
          if (session) {
            session.pause();
          }
          break;
          
        case 'resume':
          if (session) {
            session.resume();
          }
          break;
          
        case 'stop':
          if (session) {
            session.stop();
            sessions.delete(session.sessionId);
          }
          break;
          
        default:
          console.warn(`[WebSocket] Unknown message type: ${message.type}`);
      }
    } catch (error) {
      console.error('[WebSocket] Message processing error:', error);
      if (session) {
        session.sendError(`Message processing failed: ${error.message}`);
      }
    }
  });
  
  ws.on('close', (code, reason) => {
    console.log(`[WebSocket] Connection closed: ${code} ${reason}`);
    if (session) {
      session.stop();
      sessions.delete(session.sessionId);
    }
  });
  
  ws.on('error', (error) => {
    console.error('[WebSocket] Connection error:', error);
    if (session) {
      session.stop();
      sessions.delete(session.sessionId);
    }
  });
});

// =============================================================================
// CLEANUP & MONITORING
// =============================================================================

// Cleanup inactive sessions every 5 minutes
setInterval(() => {
  const now = Date.now();
  const TIMEOUT = 30 * 60 * 1000; // 30 minutes
  
  for (const [sessionId, session] of sessions.entries()) {
    if (now - session.lastActivity > TIMEOUT) {
      console.log(`[Cleanup] Removing inactive session: ${sessionId}`);
      session.stop();
      sessions.delete(sessionId);
    }
  }
}, 5 * 60 * 1000);

// Cleanup temp directory on startup
const tempDir = path.join(__dirname, 'temp');
if (fs.existsSync(tempDir)) {
  const files = fs.readdirSync(tempDir);
  for (const file of files) {
    try {
      fs.unlinkSync(path.join(tempDir, file));
    } catch (error) {
      // Ignore cleanup errors
    }
  }
}

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('[WebSocket] Shutting down gracefully...');
  
  // Stop all sessions
  for (const [sessionId, session] of sessions.entries()) {
    session.stop();
  }
  sessions.clear();
  
  // Close WebSocket server
  wss.close(() => {
    console.log('[WebSocket] Server closed');
    process.exit(0);
  });
});

console.log('🎯 [WebSocket] Ready to handle live interpretation requests');
console.log('📋 [WebSocket] Supported languages:', Object.keys(LANGUAGE_MAPPING).join(', '));
console.log('🔧 [WebSocket] Services configured: OpenAI Whisper, Google Translate, OpenAI GPT');

}).catch((error) => {
  console.error('❌ [WebSocket] Failed to start WebSocket server:', error);
  process.exit(1);
});
