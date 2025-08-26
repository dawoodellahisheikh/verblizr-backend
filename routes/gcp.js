const express = require('express');
const { z } = require('zod');
const { Storage } = require('@google-cloud/storage');
const speech = require('@google-cloud/speech');
const { Translate } = require('@google-cloud/translate').v2;
const router = express.Router();

// Initialize Google Cloud clients
const storage = new Storage();
const speechClient = new speech.SpeechClient();
const translate = new Translate();

// Get bucket names from environment or use defaults
const STORAGE_BUCKET = process.env.GCP_STORAGE_BUCKET || 'verblizr-storage';
const ARTIFACTS_BUCKET = process.env.GCP_ARTIFACTS_BUCKET || 'verblizr-artifacts';

// Validation schemas
const uploadSchema = z.object({
  fileName: z.string().min(1),
  fileData: z.string().min(1), // Base64 encoded file data
  contentType: z.string().optional().default('application/octet-stream'),
  bucket: z.enum(['storage', 'artifacts']).optional().default('storage')
});

const downloadSchema = z.object({
  fileName: z.string().min(1),
  bucket: z.enum(['storage', 'artifacts']).optional().default('storage')
});

const deleteSchema = z.object({
  fileName: z.string().min(1),
  bucket: z.enum(['storage', 'artifacts']).optional().default('storage')
});

const listSchema = z.object({
  bucket: z.enum(['storage', 'artifacts']).optional().default('storage'),
  prefix: z.string().optional(),
  maxResults: z.number().min(1).max(1000).optional().default(100)
});

const speechToTextSchema = z.object({
  audioData: z.string().min(1), // Base64 encoded audio
  languageCode: z.string().optional().default('en-US'),
  sampleRateHertz: z.number().optional().default(16000),
  encoding: z.enum(['LINEAR16', 'FLAC', 'MULAW', 'AMR', 'AMR_WB', 'OGG_OPUS', 'SPEEX_WITH_HEADER_BYTE']).optional().default('LINEAR16'),
  enableAutomaticPunctuation: z.boolean().optional().default(true),
  model: z.enum(['latest_long', 'latest_short', 'command_and_search', 'phone_call', 'video']).optional().default('latest_short')
});

const gcpTranslateSchema = z.object({
  text: z.string().min(1).max(30000),
  target: z.string().min(2).max(10),
  source: z.string().optional(),
  format: z.enum(['text', 'html']).optional().default('text')
});

// Usage tracking (in-memory for demo - use database in production)
let usageStats = {
  storageOperations: 0,
  speechMinutes: 0,
  translationCharacters: 0,
  requestsCount: 0,
  costEstimate: 0,
  period: 'current_month'
};

/**
 * POST /api/gcp/storage/upload
 * Upload files to Google Cloud Storage
 */
router.post('/storage/upload', async (req, res) => {
  try {
    const validatedData = uploadSchema.parse(req.body);
    const { fileName, fileData, contentType, bucket: bucketType } = validatedData;

    const bucketName = bucketType === 'artifacts' ? ARTIFACTS_BUCKET : STORAGE_BUCKET;
    const bucket = storage.bucket(bucketName);
    const file = bucket.file(fileName);

    // Convert base64 to buffer
    const buffer = Buffer.from(fileData, 'base64');

    // Upload file
    await file.save(buffer, {
      metadata: {
        contentType: contentType
      },
      resumable: false
    });

    // Update usage stats
    usageStats.storageOperations += 1;
    usageStats.requestsCount += 1;
    usageStats.costEstimate += buffer.length * 0.00000002; // Approximate storage cost

    res.json({
      success: true,
      fileName: fileName,
      bucket: bucketName,
      size: buffer.length,
      contentType: contentType,
      gsUri: `gs://${bucketName}/${fileName}`,
      uploadedAt: new Date().toISOString()
    });

  } catch (error) {
    console.error('[GCP Storage] Upload error:', error);
    
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        success: false,
        error: 'Invalid request parameters',
        details: error.errors
      });
    }

    res.status(500).json({
      success: false,
      error: error.message || 'File upload failed'
    });
  }
});

/**
 * POST /api/gcp/storage/download
 * Download files from Google Cloud Storage
 */
router.post('/storage/download', async (req, res) => {
  try {
    const validatedData = downloadSchema.parse(req.body);
    const { fileName, bucket: bucketType } = validatedData;

    const bucketName = bucketType === 'artifacts' ? ARTIFACTS_BUCKET : STORAGE_BUCKET;
    const bucket = storage.bucket(bucketName);
    const file = bucket.file(fileName);

    // Check if file exists
    const [exists] = await file.exists();
    if (!exists) {
      return res.status(404).json({
        success: false,
        error: 'File not found'
      });
    }

    // Download file
    const [buffer] = await file.download();
    const [metadata] = await file.getMetadata();

    // Update usage stats
    usageStats.storageOperations += 1;
    usageStats.requestsCount += 1;

    res.json({
      success: true,
      fileName: fileName,
      bucket: bucketName,
      fileData: buffer.toString('base64'),
      contentType: metadata.contentType || 'application/octet-stream',
      size: buffer.length,
      downloadedAt: new Date().toISOString()
    });

  } catch (error) {
    console.error('[GCP Storage] Download error:', error);
    
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        success: false,
        error: 'Invalid request parameters',
        details: error.errors
      });
    }

    res.status(500).json({
      success: false,
      error: error.message || 'File download failed'
    });
  }
});

/**
 * DELETE /api/gcp/storage/delete
 * Delete files from Google Cloud Storage
 */
router.delete('/storage/delete', async (req, res) => {
  try {
    const validatedData = deleteSchema.parse(req.body);
    const { fileName, bucket: bucketType } = validatedData;

    const bucketName = bucketType === 'artifacts' ? ARTIFACTS_BUCKET : STORAGE_BUCKET;
    const bucket = storage.bucket(bucketName);
    const file = bucket.file(fileName);

    // Check if file exists
    const [exists] = await file.exists();
    if (!exists) {
      return res.status(404).json({
        success: false,
        error: 'File not found'
      });
    }

    // Delete file
    await file.delete();

    // Update usage stats
    usageStats.storageOperations += 1;
    usageStats.requestsCount += 1;

    res.json({
      success: true,
      fileName: fileName,
      bucket: bucketName,
      deletedAt: new Date().toISOString()
    });

  } catch (error) {
    console.error('[GCP Storage] Delete error:', error);
    
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        success: false,
        error: 'Invalid request parameters',
        details: error.errors
      });
    }

    res.status(500).json({
      success: false,
      error: error.message || 'File deletion failed'
    });
  }
});

/**
 * GET /api/gcp/storage/list
 * List files in Google Cloud Storage
 */
router.get('/storage/list', async (req, res) => {
  try {
    const validatedData = listSchema.parse(req.query);
    const { bucket: bucketType, prefix, maxResults } = validatedData;

    const bucketName = bucketType === 'artifacts' ? ARTIFACTS_BUCKET : STORAGE_BUCKET;
    const bucket = storage.bucket(bucketName);

    // List files
    const [files] = await bucket.getFiles({
      prefix: prefix,
      maxResults: maxResults
    });

    const fileList = files.map(file => ({
      name: file.name,
      size: file.metadata.size,
      contentType: file.metadata.contentType,
      created: file.metadata.timeCreated,
      updated: file.metadata.updated,
      gsUri: `gs://${bucketName}/${file.name}`
    }));

    // Update usage stats
    usageStats.storageOperations += 1;
    usageStats.requestsCount += 1;

    res.json({
      success: true,
      bucket: bucketName,
      files: fileList,
      totalCount: fileList.length,
      ...(prefix && { prefix }),
      listedAt: new Date().toISOString()
    });

  } catch (error) {
    console.error('[GCP Storage] List error:', error);
    
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        success: false,
        error: 'Invalid request parameters',
        details: error.errors
      });
    }

    res.status(500).json({
      success: false,
      error: error.message || 'File listing failed'
    });
  }
});

/**
 * POST /api/gcp/speech-to-text
 * Speech recognition using Google Cloud Speech-to-Text
 */
router.post('/speech-to-text', async (req, res) => {
  try {
    const validatedData = speechToTextSchema.parse(req.body);
    const { audioData, languageCode, sampleRateHertz, encoding, enableAutomaticPunctuation, model } = validatedData;

    // Convert base64 to buffer
    const audioBuffer = Buffer.from(audioData, 'base64');

    const request = {
      audio: {
        content: audioBuffer
      },
      config: {
        encoding: encoding,
        sampleRateHertz: sampleRateHertz,
        languageCode: languageCode,
        enableAutomaticPunctuation: enableAutomaticPunctuation,
        model: model
      }
    };

    // Perform speech recognition
    const [response] = await speechClient.recognize(request);
    const transcription = response.results
      .map(result => result.alternatives[0].transcript)
      .join('\n');

    // Calculate duration (approximate)
    const duration = audioBuffer.length / (sampleRateHertz * 2); // Assuming 16-bit audio

    // Update usage stats
    usageStats.speechMinutes += duration / 60;
    usageStats.requestsCount += 1;
    usageStats.costEstimate += (duration / 60) * 0.024; // $0.024 per minute

    res.json({
      success: true,
      transcription: transcription,
      confidence: response.results[0]?.alternatives[0]?.confidence || 0,
      languageCode: languageCode,
      duration: duration,
      results: response.results.map(result => ({
        transcript: result.alternatives[0].transcript,
        confidence: result.alternatives[0].confidence
      }))
    });

  } catch (error) {
    console.error('[GCP Speech] Recognition error:', error);
    
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        success: false,
        error: 'Invalid request parameters',
        details: error.errors
      });
    }

    res.status(500).json({
      success: false,
      error: error.message || 'Speech recognition failed'
    });
  }
});

/**
 * POST /api/gcp/translate
 * Text translation using Google Cloud Translation
 */
router.post('/translate', async (req, res) => {
  try {
    const validatedData = gcpTranslateSchema.parse(req.body);
    const { text, target, source, format } = validatedData;

    const options = {
      to: target,
      format: format
    };

    if (source) {
      options.from = source;
    }

    // Perform translation
    const [translation] = await translate.translate(text, options);
    
    // Detect source language if not provided
    let detectedLanguage = source;
    if (!source) {
      const [detection] = await translate.detect(text);
      detectedLanguage = detection.language;
    }

    // Update usage stats
    usageStats.translationCharacters += text.length;
    usageStats.requestsCount += 1;
    usageStats.costEstimate += (text.length / 1000000) * 20; // $20 per million characters

    res.json({
      success: true,
      translatedText: translation,
      sourceLanguage: detectedLanguage,
      targetLanguage: target,
      originalText: text,
      characterCount: text.length
    });

  } catch (error) {
    console.error('[GCP Translate] Translation error:', error);
    
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
 * GET /api/gcp/test
 * Test GCP service connectivity
 */
router.get('/test', async (req, res) => {
  try {
    const testResults = {
      storage: false,
      speech: false,
      translate: false
    };

    // Test Storage
    try {
      const bucket = storage.bucket(STORAGE_BUCKET);
      const [exists] = await bucket.exists();
      testResults.storage = exists;
    } catch (error) {
      console.error('Storage test failed:', error);
    }

    // Test Speech-to-Text
    try {
      // Simple test with minimal audio data
      const testAudio = Buffer.alloc(1000); // Empty buffer for test
      const request = {
        audio: { content: testAudio },
        config: {
          encoding: 'LINEAR16',
          sampleRateHertz: 16000,
          languageCode: 'en-US'
        }
      };
      await speechClient.recognize(request);
      testResults.speech = true;
    } catch (error) {
      // Expected to fail with empty audio, but connection is working if we get a specific error
      testResults.speech = error.message.includes('audio') || error.message.includes('empty');
    }

    // Test Translation
    try {
      await translate.translate('test', 'es');
      testResults.translate = true;
    } catch (error) {
      console.error('Translation test failed:', error);
    }

    const allServicesWorking = Object.values(testResults).every(status => status);

    res.json({
      success: allServicesWorking,
      services: testResults,
      buckets: {
        storage: STORAGE_BUCKET,
        artifacts: ARTIFACTS_BUCKET
      },
      error: allServicesWorking ? null : 'Some GCP services are not available'
    });

  } catch (error) {
    console.error('[GCP] Test error:', error);
    
    res.json({
      success: false,
      services: {
        storage: false,
        speech: false,
        translate: false
      },
      error: error.message || 'GCP service test failed'
    });
  }
});

/**
 * GET /api/gcp/usage
 * Get GCP usage statistics
 */
router.get('/usage', (req, res) => {
  try {
    res.json({
      success: true,
      ...usageStats,
      breakdown: {
        storage_cost: usageStats.storageOperations * 0.00001,
        speech_cost: usageStats.speechMinutes * 0.024,
        translation_cost: (usageStats.translationCharacters / 1000000) * 20
      },
      lastUpdated: new Date().toISOString()
    });
  } catch (error) {
    console.error('[GCP] Usage error:', error);
    
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to get usage statistics'
    });
  }
});

// Reset usage stats endpoint (for development/testing)
router.post('/usage/reset', (req, res) => {
  usageStats = {
    storageOperations: 0,
    speechMinutes: 0,
    translationCharacters: 0,
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