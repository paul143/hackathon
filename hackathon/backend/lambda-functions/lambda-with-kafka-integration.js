/**
 * Updated Lambda Functions with Kafka Producer Integration
 * Each function publishes events after completing its task
 */

const AWS = require('aws-sdk');
const KafkaProducer = require('../kafka-producers/kafka-producer');
const dynamodb = new AWS.DynamoDB.DocumentClient();
const { v4: uuidv4 } = require('uuid');

const kafkaProducer = new KafkaProducer();

// ============================================
// UPDATED: submit-user-info.js
// ============================================

exports.submitUserInfoWithKafka = async (event) => {
  try {
    const body = JSON.parse(event.body || '{}');
    const { email, firstName, lastName, dateOfBirth, phoneNumber } = body;

    // Validate
    if (!email || !validateEmail(email)) {
      return errorResponse(400, 'Invalid email format');
    }

    if (!firstName || !lastName || !dateOfBirth || !phoneNumber) {
      return errorResponse(400, 'Missing required fields');
    }

    // Create user record
    const customerId = uuidv4();
    const timestamp = new Date().toISOString();

    const userRecord = {
      email,
      customerId,
      firstName,
      lastName,
      dateOfBirth,
      phoneNumber,
      createdAt: timestamp,
      updatedAt: timestamp,
      status: 'USER_INFO_SUBMITTED',
      tileProgress: {
        tile1: 'COMPLETED',
        tile2: 'PENDING',
        tile3: 'PENDING',
        tile4: 'PENDING',
        tile5: 'PENDING'
      }
    };

    // Store in DynamoDB
    await dynamodb.put({
      TableName: process.env.USERS_TABLE || 'users',
      Item: userRecord
    }).promise();

    // ✅ NEW: Publish Kafka event
    await kafkaProducer.publishUserInfoSubmitted(customerId, {
      email,
      firstName,
      lastName,
      dateOfBirth,
      phoneNumber
    });

    // Log audit event
    await logAuditEvent(customerId, 'USER_INFO_SUBMITTED', { email });

    return successResponse({
      success: true,
      customerId,
      message: 'User information submitted successfully',
      tileProgress: userRecord.tileProgress
    });
  } catch (error) {
    console.error('Error:', error);
    return errorResponse(500, 'Internal server error');
  }
};

// ============================================
// UPDATED: process-documents.js
// ============================================

exports.processDocumentsWithKafka = async (event) => {
  try {
    const body = JSON.parse(event.body || '{}');
    const { customerId, documents, selectedAgent } = body;

    if (!customerId || !documents || documents.length === 0) {
      return errorResponse(400, 'Missing customerId or documents');
    }

    const applicationId = `APP-${customerId}-${Date.now()}`;
    const processingResults = [];

    // Process documents (simplified for brevity)
    for (const doc of documents) {
      const aiResult = await processDocumentWithAgent(selectedAgent, doc, customerId);
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
      TableName: process.env.APPLICATIONS_TABLE || 'applications',
      Item: applicationRecord
    }).promise();

    // ✅ NEW: Publish Kafka event
    await kafkaProducer.publishDocumentsProcessed(customerId, applicationId, processingResults);

    // Update user progress
    await updateUserProgress(customerId, 'tile2');

    // Log audit event
    await logAuditEvent(customerId, 'DOCUMENTS_PROCESSED', { applicationId });

    return successResponse({
      applicationId,
      status: 'DOCUMENTS_PROCESSED',
      aiResults: processingResults,
      confidence: applicationRecord.overallConfidence,
      nextStep: 'VERIFICATION'
    });
  } catch (error) {
    console.error('Error processing documents:', error);
    
    // ✅ NEW: Publish error event to Kafka
    if (body?.customerId) {
      await kafkaProducer.publishError(body.customerId, '', {
        stage: 'DOCUMENT_PROCESSING',
        error: error.message
      });
    }
    
    return errorResponse(500, 'Document processing failed');
  }
};

// ============================================
// UPDATED: perform-kyc.js
// ============================================

exports.performKYCWithKafka = async (event) => {
  try {
    const body = JSON.parse(event.body || '{}');
    const { customerId, applicationId, extractedData } = body;

    if (!customerId || !applicationId) {
      return errorResponse(400, 'Missing required parameters');
    }

    // Perform KYC checks (simplified)
    const kycResults = {
      customerId,
      applicationId,
      checks: [
        { checkType: 'AGE_VERIFICATION', passed: true, confidence: 0.99 },
        { checkType: 'NAME_CONSISTENCY', passed: true, confidence: 0.95 },
        { checkType: 'WATCHLIST_SCREENING', passed: true, riskLevel: 'LOW' },
        { checkType: 'DOCUMENT_VERIFICATION', passed: true, confidence: 0.92 },
        { checkType: 'ADDRESS_VERIFICATION', passed: true }
      ],
      status: 'APPROVED',
      riskLevel: 'LOW',
      requiresHumanReview: false,
      timestamp: new Date().toISOString()
    };

    // Store KYC results
    await dynamodb.put({
      TableName: process.env.KYC_RESULTS_TABLE || 'kyc-results',
      Item: kycResults
    }).promise();

    // ✅ NEW: Publish Kafka event
    await kafkaProducer.publishKYCVerified(
      customerId,
      applicationId,
      kycResults.status,
      kycResults.riskLevel
    );

    // Log audit event
    await logAuditEvent(customerId, 'KYC_VERIFICATION_COMPLETED', { applicationId, status: kycResults.status });

    return successResponse({
      applicationId,
      kycStatus: kycResults.status,
      riskLevel: kycResults.riskLevel,
      requiresHumanReview: kycResults.requiresHumanReview,
      checks: kycResults.checks
    });
  } catch (error) {
    console.error('KYC error:', error);
    
    // ✅ NEW: Publish error event
    if (body?.customerId) {
      await kafkaProducer.publishError(body.customerId, body.applicationId, {
        stage: 'KYC_VERIFICATION',
        error: error.message
      });
    }
    
    return errorResponse(500, 'KYC verification failed');
  }
};

// ============================================
// UPDATED: generate-policy-recommendations.js
// ============================================

exports.generateRecommendationsWithKafka = async (event) => {
  try {
    const body = JSON.parse(event.body || '{}');
    const { customerId, applicationId, extractedData, userProfile } = body;

    if (!customerId || !applicationId) {
      return errorResponse(400, 'Missing required parameters');
    }

    // Generate recommendations (simplified)
    const recommendations = [
      { id: 'TERM_LIFE_20Y', name: 'Term Life - 20Y', fitScore: 95, adjustedPrice: 25 },
      { id: 'HEALTH_SILVER', name: 'Health - Silver', fitScore: 88, adjustedPrice: 270 }
    ];

    // Store recommendations
    const recommendationRecord = {
      recommendationId: `REC-${applicationId}-${Date.now()}`,
      customerId,
      applicationId,
      recommendations,
      createdAt: new Date().toISOString()
    };

    await dynamodb.put({
      TableName: process.env.RECOMMENDATIONS_TABLE || 'policy-recommendations',
      Item: recommendationRecord
    }).promise();

    // ✅ NEW: Publish Kafka event
    await kafkaProducer.publishPolicyRecommended(customerId, applicationId, recommendations);

    // Log audit event
    await logAuditEvent(customerId, 'POLICY_RECOMMENDATIONS_GENERATED', { applicationId });

    return successResponse({
      applicationId,
      recommendations,
      message: 'Personalized policy recommendations generated'
    });
  } catch (error) {
    console.error('Recommendation error:', error);
    
    // ✅ NEW: Publish error event
    if (body?.customerId) {
      await kafkaProducer.publishError(body.customerId, body.applicationId, {
        stage: 'POLICY_RECOMMENDATIONS',
        error: error.message
      });
    }
    
    return errorResponse(500, 'Policy recommendation generation failed');
  }
};

// ============================================
// NEW: submit-policy-selection.js
// ============================================

exports.submitPolicySelectionWithKafka = async (event) => {
  try {
    const body = JSON.parse(event.body || '{}');
    const { customerId, applicationId, selectedPolicyId } = body;

    if (!customerId || !applicationId || !selectedPolicyId) {
      return errorResponse(400, 'Missing required parameters');
    }

    // Update application with selected policy
    await dynamodb.update({
      TableName: process.env.APPLICATIONS_TABLE || 'applications',
      Key: { applicationId },
      UpdateExpression: 'SET selectedPolicy = :policy, #status = :status, completedAt = :ts',
      ExpressionAttributeNames: { '#status': 'status' },
      ExpressionAttributeValues: {
        ':policy': selectedPolicyId,
        ':status': 'POLICY_SELECTED',
        ':ts': new Date().toISOString()
      }
    }).promise();

    // ✅ NEW: Publish workflow completion event
    await kafkaProducer.publishWorkflowCompleted(customerId, applicationId, selectedPolicyId);

    // Log audit event
    await logAuditEvent(customerId, 'POLICY_SELECTED', { applicationId, selectedPolicyId });

    return successResponse({
      success: true,
      message: 'Policy selected successfully',
      applicationId,
      selectedPolicyId
    });
  } catch (error) {
    console.error('Policy selection error:', error);
    
    // ✅ NEW: Publish error event
    if (body?.customerId) {
      await kafkaProducer.publishError(body.customerId, body.applicationId, {
        stage: 'POLICY_SELECTION',
        error: error.message
      });
    }
    
    return errorResponse(500, 'Policy selection failed');
  }
};

// ============================================
// Helper Functions
// ============================================

function validateEmail(email) {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

function calculateAverageConfidence(results) {
  const validResults = results.filter(r => r.confidence !== undefined);
  if (validResults.length === 0) return 0;
  const sum = validResults.reduce((acc, r) => acc + r.confidence, 0);
  return sum / validResults.length;
}

async function updateUserProgress(customerId, tile) {
  // Implementation
}

async function processDocumentWithAgent(agent, document, customerId) {
  // Placeholder implementation
  return {
    documentName: document.fileName,
    agent,
    confidence: 0.95,
    extractedFields: {}
  };
}

async function logAuditEvent(customerId, action, details) {
  await dynamodb.put({
    TableName: process.env.AUDIT_TABLE || 'audit-logs',
    Item: {
      customerId,
      timestamp: new Date().toISOString(),
      action,
      details,
      agent: 'LAMBDA'
    }
  }).promise();
}

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
