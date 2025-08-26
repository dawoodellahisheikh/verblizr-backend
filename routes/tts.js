const express = require('express');
const { z } = require('zod');
const textToSpeech = require('@google-cloud/text-to-speech');
const router = express.Router();

// Initialize Google Cloud TTS client
const client = new textToSpeech.TextToSpeechClient();

// Validation schemas
const synthesizeSchema = z.object({
  text: z.string().min(1).max(5000),
  languageCode: z.string().optional().default('en-US'),
  voiceName: z.string().optional(),
  speakingRate: z.number().min(0.25).max(4.0).optional().default(1.0),
  pitch: z.number().min(-20.0).max(20.0).optional().default(0.0),
  audioEncoding: z.enum(['MP3', 'LINEAR16', 'OGG_OPUS']).optional().default('MP3')
});

const voicesSchema = z.object({
  languageCode: z.string().optional()
});

// Usage tracking (in-memory for demo - use database in production)
let usageStats = {
  charactersUsed: 0,
  requestsCount: 0,
  costEstimate: 0,
  period: 'current_month'
};

/**
 * POST /api/tts/synthesize
 * Synthesize speech using Google Cloud TTS
 */
router.post('/synthesize', async (req, res) => {
  try {
    const validatedData = synthesizeSchema.parse(req.body);
    const { text, languageCode, voiceName, speakingRate, pitch, audioEncoding } = validatedData;

    // Build the request
    const request = {
      input: { text },
      voice: {
        languageCode,
        ...(voiceName && { name: voiceName })
      },
      audioConfig: {
        audioEncoding,
        speakingRate,
        pitch
      }
    };

    // Call Google Cloud TTS
    const [response] = await client.synthesizeSpeech(request);
    
    if (!response.audioContent) {
      throw new Error('No audio content returned from TTS service');
    }

    // Update usage stats
    usageStats.charactersUsed += text.length;
    usageStats.requestsCount += 1;
    usageStats.costEstimate += text.length * 0.000016; // Approximate cost per character

    // Convert audio content to base64
    const audioBase64 = Buffer.from(response.audioContent).toString('base64');

    res.json({
      success: true,
      audioContent: audioBase64,
      audioFormat: audioEncoding.toLowerCase(),
      provider: 'google-cloud-tts',
      metadata: {
        languageCode,
        voiceName: voiceName || 'default',
        speakingRate,
        pitch,
        textLength: text.length
      }
    });

  } catch (error) {
    console.error('[TTS] Synthesis error:', error);
    
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        success: false,
        error: 'Invalid request parameters',
        details: error.errors
      });
    }

    res.status(500).json({
      success: false,
      error: error.message || 'TTS synthesis failed',
      provider: 'google-cloud-tts'
    });
  }
});

/**
 * GET /api/tts/voices
 * Get available voices for a language
 */
router.get('/voices', async (req, res) => {
  try {
    const { languageCode } = voicesSchema.parse(req.query);

    // Get list of voices from Google Cloud TTS
    const [result] = await client.listVoices({
      ...(languageCode && { languageCode })
    });

    const voices = result.voices.map(voice => ({
      name: voice.name,
      languageCodes: voice.languageCodes,
      ssmlGender: voice.ssmlGender,
      naturalSampleRateHertz: voice.naturalSampleRateHertz
    }));

    res.json({
      success: true,
      voices,
      totalCount: voices.length,
      ...(languageCode && { filteredBy: languageCode })
    });

  } catch (error) {
    console.error('[TTS] Voices error:', error);
    
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        success: false,
        error: 'Invalid request parameters',
        details: error.errors
      });
    }

    res.status(500).json({
      success: false,
      error: error.message || 'Failed to get voices',
      voices: []
    });
  }
});

/**
 * GET /api/tts/test
 * Test TTS service connectivity
 */
router.get('/test', async (req, res) => {
  try {
    // Test Google Cloud TTS with a simple request
    const testRequest = {
      input: { text: 'Test' },
      voice: { languageCode: 'en-US' },
      audioConfig: { audioEncoding: 'MP3' }
    };

    const [testResponse] = await client.synthesizeSpeech(testRequest);
    const googleCloudTTSStatus = !!testResponse.audioContent;

    // Test voice listing
    const [voicesResult] = await client.listVoices({ languageCode: 'en-US' });
    const voicesAvailable = voicesResult.voices && voicesResult.voices.length > 0;

    const providers = [];
    if (googleCloudTTSStatus) providers.push('google-cloud-tts');
    
    // Note: react-native-tts is frontend-only, so we don't test it here
    providers.push('react-native-tts'); // Always available as fallback

    res.json({
      success: googleCloudTTSStatus && voicesAvailable,
      providers,
      status: {
        googleCloudTTS: googleCloudTTSStatus,
        reactNativeTTS: true, // Always true as it's handled by frontend
        voicesAvailable
      },
      error: null
    });

  } catch (error) {
    console.error('[TTS] Test error:', error);
    
    res.json({
      success: false,
      providers: ['react-native-tts'], // Fallback only
      status: {
        googleCloudTTS: false,
        reactNativeTTS: true
      },
      error: error.message || 'TTS service test failed'
    });
  }
});

/**
 * GET /api/tts/usage
 * Get TTS usage statistics
 */
router.get('/usage', (req, res) => {
  try {
    res.json({
      success: true,
      ...usageStats,
      lastUpdated: new Date().toISOString()
    });
  } catch (error) {
    console.error('[TTS] Usage error:', error);
    
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to get usage statistics'
    });
  }
});

// Reset usage stats endpoint (for development/testing)
router.post('/usage/reset', (req, res) => {
  usageStats = {
    charactersUsed: 0,
    requestsCount: 0,
    costEstimate: 0,
    period: 'current_month'
  };
  
  res.json({
    success: true,
    message: 'Usage statistics reset'
  });
});

module.exports = router;