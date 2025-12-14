/**
 * Lambda Function: Process Documents
 * Purpose: Orchestrate multi-provider AI document processing (Tile 2)
 * Triggers: S3 file upload event or API Gateway POST /api/documents/process
 * Outputs: DynamoDB AIResults table, S3 processed documents
 */

const AWS = require('aws-sdk');
const dynamodb = new AWS.DynamoDB.DocumentClient();
const s3 = new AWS.S3();
const textract = new AWS.Textract();

const APPLICATIONS_TABLE = process.env.APPLICATIONS_TABLE || 'applications';
const AI_RESULTS_TABLE = process.env.AI_RESULTS_TABLE || 'ai-results';
const DOCUMENTS_BUCKET = process.env.DOCUMENTS_BUCKET || 'onboard-ai-documents';

/**
 * Main handler - Orchestrate document processing
 */
exports.handler = async (event) => {
  try {
    const body = JSON.parse(event.body || '{}');
    const { customerId, documents, selectedAgent } = body;

    if (!customerId || !documents || documents.length === 0) {
      return errorResponse(400, 'Missing customerId or documents');
    }

    const applicationId = `APP-${customerId}-${Date.now()}`;
    const processingResults = [];

    // Process each document with selected AI agent
    for (const doc of documents) {
      const docKey = `documents/${customerId}/${doc.fileName}`;
      
      let aiResult;
      
      switch (selectedAgent) {
        case 'AWS_TEXTRACT':
          aiResult = await processWithTextract(docKey, doc, customerId);
          break;
        case 'GOOGLE_VISION':
          aiResult = await processWithGoogleVision(docKey, doc, customerId);
          break;
        case 'AZURE_FORM_RECOGNIZER':
          aiResult = await processWithAzureFormRecognizer(docKey, doc, customerId);
          break;
        case 'CUSTOM_AGENT':
          aiResult = await processWithCustomAgent(docKey, doc, customerId);
          break;
        default:
          aiResult = await processWithTextract(docKey, doc, customerId);
      }

      processingResults.push(aiResult);
    }

    // Store application record
    const applicationRecord = {
      applicationId,
      customerId,
      selectedAgent,
      documents: documents.map(d => d.fileName),
      aiResults: processingResults,
      createdAt: new Date().toISOString(),
      status: 'DOCUMENTS_PROCESSED',
      overallConfidence: calculateAverageConfidence(processingResults)
    };

    await dynamodb.put({
      TableName: APPLICATIONS_TABLE,
      Item: applicationRecord
    }).promise();

    // Update user tile progress
    await updateUserProgress(customerId, 'tile2');

    // Log audit event
    await logAuditEvent(customerId, 'DOCUMENTS_PROCESSED', {
      applicationId,
      agent: selectedAgent,
      documentCount: documents.length,
      confidence: applicationRecord.overallConfidence
    });

    return successResponse({
      applicationId,
      status: 'DOCUMENTS_PROCESSED',
      aiResults: processingResults,
      confidence: applicationRecord.overallConfidence,
      nextStep: 'VERIFICATION'
    });
  } catch (error) {
    console.error('Error processing documents:', error);
    return errorResponse(500, 'Document processing failed');
  }
};

/**
 * Process with AWS Textract
 */
async function processWithTextract(docKey, document, customerId) {
  try {
    // Get document from S3
    const s3Object = await s3.getObject({
      Bucket: DOCUMENTS_BUCKET,
      Key: docKey
    }).promise();

    // Call Textract
    const params = {
      Document: { Bytes: s3Object.Body },
      FeatureTypes: ['TABLES', 'FORMS']
    };

    const textractResult = await textract.analyzeDocument(params).promise();

    // Extract and structure data
    const extractedData = {
      documentName: document.fileName,
      documentType: document.type || 'UNKNOWN',
      agent: 'AWS_TEXTRACT',
      rawResult: textractResult,
      extractedFields: parseTextractResult(textractResult),
      confidence: calculateTextractConfidence(textractResult),
      processingTime: new Date().toISOString()
    };

    // Store AI result
    await storeAIResult(customerId, extractedData);

    return extractedData;
  } catch (error) {
    console.error('Textract error:', error);
    return {
      documentName: document.fileName,
      agent: 'AWS_TEXTRACT',
      error: error.message,
      confidence: 0
    };
  }
}

/**
 * Process with Google Vision AI
 */
async function processWithGoogleVision(docKey, document, customerId) {
  // Placeholder for Google Vision API integration
  // Requires: @google-cloud/vision npm package
  try {
    // Implementation would call Google Vision API
    return {
      documentName: document.fileName,
      agent: 'GOOGLE_VISION',
      extractedFields: {},
      confidence: 0.94,
      processingTime: new Date().toISOString()
    };
  } catch (error) {
    console.error('Google Vision error:', error);
    return {
      documentName: document.fileName,
      agent: 'GOOGLE_VISION',
      error: error.message,
      confidence: 0
    };
  }
}

/**
 * Process with Azure Form Recognizer
 */
async function processWithAzureFormRecognizer(docKey, document, customerId) {
  // Placeholder for Azure Form Recognizer integration
  try {
    // Implementation would call Azure API
    return {
      documentName: document.fileName,
      agent: 'AZURE_FORM_RECOGNIZER',
      extractedFields: {},
      confidence: 0.96,
      processingTime: new Date().toISOString()
    };
  } catch (error) {
    console.error('Azure Form Recognizer error:', error);
    return {
      documentName: document.fileName,
      agent: 'AZURE_FORM_RECOGNIZER',
      error: error.message,
      confidence: 0
    };
  }
}

/**
 * Process with Custom Agent
 */
async function processWithCustomAgent(docKey, document, customerId) {
  // Placeholder for custom ML model
  try {
    // Implementation would invoke SageMaker endpoint or custom model
    return {
      documentName: document.fileName,
      agent: 'CUSTOM_AGENT',
      extractedFields: {},
      confidence: 0.92,
      processingTime: new Date().toISOString()
    };
  } catch (error) {
    console.error('Custom Agent error:', error);
    return {
      documentName: document.fileName,
      agent: 'CUSTOM_AGENT',
      error: error.message,
      confidence: 0
    };
  }
}

/**
 * Parse Textract results into structured fields
 */
function parseTextractResult(result) {
  const fields = {};
  if (result.Blocks) {
    result.Blocks.forEach(block => {
      if (block.BlockType === 'KEY_VALUE_SET' && block.EntityTypes.includes('KEY')) {
        // Extract key-value pairs
        fields[block.Text] = 'extracted_value';
      }
    });
  }
  return fields;
}

/**
 * Calculate confidence score from Textract
 */
function calculateTextractConfidence(result) {
  if (!result.Blocks || result.Blocks.length === 0) return 0;
  
  const confidences = result.Blocks
    .filter(b => b.Confidence !== undefined)
    .map(b => b.Confidence / 100);
  
  return confidences.length > 0
    ? (confidences.reduce((a, b) => a + b, 0) / confidences.length)
    : 0;
}

/**
 * Calculate average confidence across all fields
 */
function calculateAverageConfidence(results) {
  const validResults = results.filter(r => r.confidence !== undefined);
  if (validResults.length === 0) return 0;
  
  const sum = validResults.reduce((acc, r) => acc + r.confidence, 0);
  return sum / validResults.length;
}

/**
 * Store AI results in DynamoDB
 */
async function storeAIResult(customerId, result) {
  await dynamodb.put({
    TableName: AI_RESULTS_TABLE,
    Item: {
      customerId,
      resultId: `${customerId}-${Date.now()}`,
      ...result,
      timestamp: new Date().toISOString()
    }
  }).promise();
}

/**
 * Update user tile progress
 */
async function updateUserProgress(customerId, tile) {
  await dynamodb.update({
    TableName: process.env.USERS_TABLE || 'users',
    Key: { email: 'placeholder' }, // Note: Need to refactor to use customerId as key
    UpdateExpression: `SET tileProgress.#tile = :status`,
    ExpressionAttributeNames: { '#tile': tile },
    ExpressionAttributeValues: { ':status': 'COMPLETED' }
  }).promise();
}

/**
 * Log audit event
 */
async function logAuditEvent(customerId, action, details) {
  await dynamodb.put({
    TableName: process.env.AUDIT_TABLE || 'audit-logs',
    Item: {
      customerId,
      timestamp: new Date().toISOString(),
      action,
      details,
      agent: 'PROCESS_DOCUMENTS_LAMBDA'
    }
  }).promise();
}

/**
 * Helper response functions
 */
function successResponse(data) {
  return {
    statusCode: 200,
    body: JSON.stringify(data),
    headers: { 'Content-Type': 'application/json' }
  };
}

function errorResponse(statusCode, message) {
  return {
    statusCode,
    body: JSON.stringify({ error: message }),
    headers: { 'Content-Type': 'application/json' }
  };
}
