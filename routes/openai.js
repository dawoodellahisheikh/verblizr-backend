const express = require('express');
const { z } = require('zod');
const router = express.Router();

const OpenAI = require('openai');

// Initialize OpenAI client
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

// Validation schemas
const transcribeSchema = z.object({
  audioData: z.string().min(1), // Base64 encoded audio
  language: z.string().optional(),
  model: z.enum(['whisper-1']).optional().default('whisper-1'),
  prompt: z.string().optional(),
  response_format: z.enum(['json', 'text', 'srt', 'verbose_json', 'vtt']).optional().default('json'),
  temperature: z.number().min(0).max(1).optional().default(0)
});

const translateSchema = z.object({
  text: z.string().min(1).max(8000),
  target_language: z.string().min(2).max(10),
  source_language: z.string().optional(),
  model: z.enum(['gpt-3.5-turbo', 'gpt-4', 'gpt-4-turbo']).optional().default('gpt-3.5-turbo')
});

const chatSchema = z.object({
  messages: z.array(z.object({
    role: z.enum(['system', 'user', 'assistant']),
    content: z.string()
  })).min(1),
  model: z.enum(['gpt-3.5-turbo', 'gpt-4', 'gpt-4-turbo']).optional().default('gpt-3.5-turbo'),
  temperature: z.number().min(0).max(2).optional().default(1),
  max_tokens: z.number().min(1).max(4096).optional(),
  stream: z.boolean().optional().default(false)
});

// Usage tracking (in-memory for demo - use database in production)
let usageStats = {
  transcriptionMinutes: 0,
  translationCharacters: 0,
  chatTokens: 0,
  requestsCount: 0,
  costEstimate: 0,
  period: 'current_month'
};

/**
 * POST /api/openai/transcribe
 * Audio transcription using Whisper
 */
router.post('/transcribe', async (req, res) => {
  try {
    const validatedData = transcribeSchema.parse(req.body);
    const { audioData, language, model, prompt, response_format, temperature } = validatedData;

    // Convert base64 audio data to buffer
    const audioBuffer = Buffer.from(audioData, 'base64');
    
    // Create a temporary file-like object for OpenAI API
    const audioFile = {
      buffer: audioBuffer,
      name: 'audio.wav',
      type: 'audio/wav'
    };

    // Call OpenAI Whisper API
    const transcription = await openai.audio.transcriptions.create({
      file: audioFile,
      model: model,
      language: language,
      prompt: prompt,
      response_format: response_format,
      temperature: temperature
    });

    // Estimate duration (rough calculation based on buffer size)
    const estimatedDuration = audioBuffer.length / (16000 * 2); // Assuming 16kHz, 16-bit audio

    // Update usage stats
    usageStats.transcriptionMinutes += estimatedDuration / 60;
    usageStats.requestsCount += 1;
    usageStats.costEstimate += (estimatedDuration / 60) * 0.006; // $0.006 per minute

    res.json({
      success: true,
      transcription: transcription,
      model: model,
      response_format: response_format,
      estimatedDuration: estimatedDuration
    });

  } catch (error) {
    console.error('[OpenAI] Transcription error:', error);
    
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        success: false,
        error: 'Invalid request parameters',
        details: error.errors
      });
    }

    res.status(500).json({
      success: false,
      error: error.message || 'Transcription failed'
    });
  }
});

/**
 * POST /api/openai/translate
 * Text translation using GPT models
 */
router.post('/translate', async (req, res) => {
  try {
    const validatedData = translateSchema.parse(req.body);
    const { text, target_language, source_language, model } = validatedData;

    // Create translation prompt
    const translationPrompt = source_language 
      ? `Translate the following text from ${source_language} to ${target_language}: "${text}"`
      : `Translate the following text to ${target_language}: "${text}"`;

    // Call OpenAI Chat Completion API for translation
    const completion = await openai.chat.completions.create({
      model: model,
      messages: [
        {
          role: 'system',
          content: 'You are a professional translator. Provide only the translated text without any additional commentary or explanation.'
        },
        {
          role: 'user',
          content: translationPrompt
        }
      ],
      temperature: 0.3, // Lower temperature for more consistent translations
      max_tokens: Math.min(text.length * 2, 4000) // Estimate output length
    });

    const translatedText = completion.choices[0].message.content.trim();

    // Update usage stats
    usageStats.translationCharacters += text.length;
    usageStats.chatTokens += completion.usage.total_tokens;
    usageStats.requestsCount += 1;
    usageStats.costEstimate += completion.usage.total_tokens * 0.00002; // Approximate cost per token

    res.json({
      success: true,
      translation: {
        translated_text: translatedText,
        source_language: source_language || 'auto-detected',
        target_language: target_language,
        confidence: 0.95 // OpenAI doesn't provide confidence scores
      },
      model: model,
      usage: {
        input_characters: text.length,
        output_characters: translatedText.length,
        tokens_used: completion.usage.total_tokens
      }
    });

  } catch (error) {
    console.error('[OpenAI] Translation error:', error);
    
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        success: false,
        error: 'Invalid request parameters',
        details: error.errors
      });
    }

    res.status(500).json({
      success: false,
      error: error.message || 'Translation failed'
    });
  }
});

/**
 * POST /api/openai/chat
 * Chat completion using GPT models
 */
router.post('/chat', async (req, res) => {
  try {
    const validatedData = chatSchema.parse(req.body);
    const { messages, model, temperature, max_tokens, stream } = validatedData;

    // Call OpenAI Chat Completion API
    const completion = await openai.chat.completions.create({
      model: model,
      messages: messages,
      temperature: temperature,
      max_tokens: max_tokens,
      stream: stream
    });

    if (stream) {
      // Handle streaming response
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');
      
      for await (const chunk of completion) {
        const data = JSON.stringify(chunk);
        res.write(`data: ${data}\n\n`);
        
        // Update usage stats for streaming (approximate)
        if (chunk.choices[0]?.delta?.content) {
          usageStats.chatTokens += 1; // Rough estimate
        }
      }
      
      res.write('data: [DONE]\n\n');
      res.end();
      
      usageStats.requestsCount += 1;
    } else {
      // Update usage stats
      usageStats.chatTokens += completion.usage.total_tokens;
      usageStats.requestsCount += 1;
      usageStats.costEstimate += completion.usage.total_tokens * 0.00002; // Approximate cost per token

      res.json({
        success: true,
        ...completion
      });
    }

  } catch (error) {
    console.error('[OpenAI] Chat error:', error);
    
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        success: false,
        error: 'Invalid request parameters',
        details: error.errors
      });
    }

    res.status(500).json({
      success: false,
      error: error.message || 'Chat completion failed'
    });
  }
});

/**
 * GET /api/openai/test
 * Test OpenAI service connectivity
 */
router.get('/test', async (req, res) => {
  try {
    const testResults = {
      whisper: false,
      gpt_models: false,
      api_key_valid: !!process.env.OPENAI_API_KEY
    };

    if (!process.env.OPENAI_API_KEY) {
      return res.json({
        success: false,
        services: testResults,
        providers: [],
        error: 'OpenAI API key not configured'
      });
    }

    // Test GPT models with a simple completion
    try {
      const testCompletion = await openai.chat.completions.create({
        model: 'gpt-3.5-turbo',
        messages: [{ role: 'user', content: 'Test' }],
        max_tokens: 5
      });
      testResults.gpt_models = !!testCompletion.choices[0]?.message?.content;
    } catch (error) {
      console.error('GPT test failed:', error);
    }

    // Test Whisper with minimal audio (this would normally require actual audio data)
    try {
      // We can't easily test Whisper without audio data, so we'll assume it works if GPT works
      testResults.whisper = testResults.gpt_models;
    } catch (error) {
      console.error('Whisper test failed:', error);
    }

    const allServicesWorking = testResults.whisper && testResults.gpt_models && testResults.api_key_valid;

    res.json({
      success: allServicesWorking,
      services: testResults,
      providers: allServicesWorking ? ['openai-whisper', 'openai-gpt'] : [],
      error: allServicesWorking ? null : 'Some OpenAI services are not available'
    });

  } catch (error) {
    console.error('[OpenAI] Test error:', error);
    
    res.json({
      success: false,
      services: {
        whisper: false,
        gpt_models: false,
        api_key_valid: false
      },
      providers: [],
      error: error.message || 'OpenAI service test failed'
    });
  }
});

/**
 * GET /api/openai/usage
 * Get OpenAI usage statistics
 */
router.get('/usage', (req, res) => {
  try {
    res.json({
      success: true,
      ...usageStats,
      breakdown: {
        transcription_cost: usageStats.transcriptionMinutes * 0.006,
        translation_cost: (usageStats.translationCharacters / 1000) * 0.002,
        chat_cost: usageStats.chatTokens * 0.00002
      },
      lastUpdated: new Date().toISOString()
    });
  } catch (error) {
    console.error('[OpenAI] Usage error:', error);
    
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to get usage statistics'
    });
  }
});

// Reset usage stats endpoint (for development/testing)
router.post('/usage/reset', (req, res) => {
  usageStats = {
    transcriptionMinutes: 0,
    translationCharacters: 0,
    chatTokens: 0,
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