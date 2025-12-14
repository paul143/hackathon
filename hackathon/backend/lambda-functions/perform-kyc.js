/**
 * Lambda Function: Perform KYC Verification
 * Purpose: Verify customer identity against watchlists and compliance checks (Tile 4)
 * Triggers: API Gateway POST /api/kyc/verify
 * Outputs: DynamoDB KYC results, compliance flags
 */

const AWS = require('aws-sdk');
const dynamodb = new AWS.DynamoDB.DocumentClient();

const USERS_TABLE = process.env.USERS_TABLE || 'users';
const KYC_RESULTS_TABLE = process.env.KYC_RESULTS_TABLE || 'kyc-results';
const COMPLIANCE_TABLE = process.env.COMPLIANCE_TABLE || 'compliance-flags';

/**
 * Main KYC handler
 */
exports.handler = async (event) => {
  try {
    const body = JSON.parse(event.body || '{}');
    const { customerId, applicationId, extractedData } = body;

    if (!customerId || !applicationId) {
      return errorResponse(400, 'Missing customerId or applicationId');
    }

    // Get user info
    const user = await getUserByCustomerId(customerId);
    if (!user) {
      return errorResponse(404, 'User not found');
    }

    // Perform KYC checks
    const kycResults = {
      customerId,
      applicationId,
      checks: []
    };

    // 1. Age verification (must be 18+)
    const ageCheck = verifyAge(user.dateOfBirth);
    kycResults.checks.push({
      checkType: 'AGE_VERIFICATION',
      passed: ageCheck.passed,
      details: ageCheck.details,
      confidence: ageCheck.confidence
    });

    // 2. Name consistency check
    const nameCheck = verifyNameConsistency(
      user.firstName,
      user.lastName,
      extractedData?.name || ''
    );
    kycResults.checks.push({
      checkType: 'NAME_CONSISTENCY',
      passed: nameCheck.passed,
      details: nameCheck.details,
      confidence: nameCheck.confidence
    });

    // 3. Watchlist screening (PEP, OFAC, sanctions)
    const watchlistCheck = await screenWatchlist(user.firstName, user.lastName, user.dateOfBirth);
    kycResults.checks.push({
      checkType: 'WATCHLIST_SCREENING',
      passed: watchlistCheck.passed,
      details: watchlistCheck.details,
      riskLevel: watchlistCheck.riskLevel
    });

    // 4. Document verification
    const documentCheck = verifyDocuments(extractedData);
    kycResults.checks.push({
      checkType: 'DOCUMENT_VERIFICATION',
      passed: documentCheck.passed,
      details: documentCheck.details,
      confidence: documentCheck.confidence
    });

    // 5. Address verification
    const addressCheck = verifyAddress(extractedData?.address || '');
    kycResults.checks.push({
      checkType: 'ADDRESS_VERIFICATION',
      passed: addressCheck.passed,
      details: addressCheck.details
    });

    // Calculate overall KYC status
    const allChecksPassed = kycResults.checks.every(check => check.passed === true);
    const riskFlags = kycResults.checks
      .filter(check => !check.passed || (check.riskLevel && check.riskLevel !== 'LOW'));

    kycResults.status = allChecksPassed ? 'APPROVED' : 'REQUIRES_REVIEW';
    kycResults.riskLevel = calculateRiskLevel(riskFlags);
    kycResults.requiresHumanReview = riskFlags.length > 0;
    kycResults.timestamp = new Date().toISOString();

    // Store KYC results
    await dynamodb.put({
      TableName: KYC_RESULTS_TABLE,
      Item: kycResults
    }).promise();

    // If requires review, create compliance flag
    if (kycResults.requiresHumanReview) {
      await createComplianceFlag(customerId, applicationId, riskFlags);
    }

    // Update application status
    await updateApplicationStatus(applicationId, kycResults.status);

    // Log audit event
    await logAuditEvent(customerId, 'KYC_VERIFICATION_COMPLETED', {
      applicationId,
      status: kycResults.status,
      riskLevel: kycResults.riskLevel
    });

    return successResponse({
      applicationId,
      kycStatus: kycResults.status,
      riskLevel: kycResults.riskLevel,
      requiresHumanReview: kycResults.requiresHumanReview,
      checks: kycResults.checks
    });
  } catch (error) {
    console.error('KYC error:', error);
    return errorResponse(500, 'KYC verification failed');
  }
};

/**
 * Get user by customerId
 */
async function getUserByCustomerId(customerId) {
  const result = await dynamodb.scan({
    TableName: USERS_TABLE,
    FilterExpression: 'customerId = :cid',
    ExpressionAttributeValues: { ':cid': customerId }
  }).promise();

  return result.Items?.[0] || null;
}

/**
 * Verify age (must be 18+)
 */
function verifyAge(dateOfBirthString) {
  try {
    const dob = new Date(dateOfBirthString);
    const today = new Date();
    let age = today.getFullYear() - dob.getFullYear();
    const monthDiff = today.getMonth() - dob.getMonth();

    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < dob.getDate())) {
      age--;
    }

    return {
      passed: age >= 18,
      details: `Age: ${age} years`,
      confidence: 0.99
    };
  } catch (error) {
    return {
      passed: false,
      details: 'Invalid date of birth format',
      confidence: 0
    };
  }
}

/**
 * Verify name consistency between user and extracted document
 */
function verifyNameConsistency(firstName, lastName, extractedName) {
  const userFullName = `${firstName} ${lastName}`.toLowerCase().trim();
  const docName = extractedName.toLowerCase().trim();

  // Simple string matching (can be enhanced with fuzzy matching)
  const match = docName.includes(firstName.toLowerCase()) && 
                docName.includes(lastName.toLowerCase());

  return {
    passed: match,
    details: `User: "${userFullName}" vs Document: "${docName}"`,
    confidence: match ? 0.95 : 0.5
  };
}

/**
 * Screen against watchlists (OFAC, PEP, Sanctions)
 */
async function screenWatchlist(firstName, lastName, dob) {
  try {
    // Placeholder - integrate with real watchlist service
    // Examples: OFAC API, Worldcheck, Lexis-Nexis
    
    // Mock implementation
    const suspiciousNames = ['Osama', 'Kim Jong']; // Simplified example
    const flagged = suspiciousNames.some(name => 
      firstName.toLowerCase().includes(name.toLowerCase())
    );

    return {
      passed: !flagged,
      details: flagged ? 'Name matches watchlist' : 'Watchlist screening passed',
      riskLevel: flagged ? 'HIGH' : 'LOW'
    };
  } catch (error) {
    console.error('Watchlist error:', error);
    return {
      passed: false,
      details: 'Watchlist screening unavailable',
      riskLevel: 'UNKNOWN'
    };
  }
}

/**
 * Verify document validity
 */
function verifyDocuments(extractedData) {
  // Check document authenticity indicators
  const hasRequiredFields = extractedData && 
    extractedData.documentNumber && 
    extractedData.expiryDate;

  const isNotExpired = !hasRequiredFields || 
    new Date(extractedData.expiryDate) > new Date();

  return {
    passed: hasRequiredFields && isNotExpired,
    details: `Document has required fields: ${hasRequiredFields}, Expired: ${!isNotExpired}`,
    confidence: hasRequiredFields ? 0.92 : 0
  };
}

/**
 * Verify address
 */
function verifyAddress(address) {
  // Simple address validation
  const hasAddress = address && address.length > 5;

  return {
    passed: hasAddress,
    details: hasAddress ? 'Valid address provided' : 'No valid address',
    confidence: hasAddress ? 0.85 : 0
  };
}

/**
 * Calculate overall risk level
 */
function calculateRiskLevel(riskFlags) {
  if (riskFlags.length === 0) return 'LOW';
  
  const highRiskFlags = riskFlags.filter(flag => flag.riskLevel === 'HIGH');
  if (highRiskFlags.length > 0) return 'HIGH';
  
  return 'MEDIUM';
}

/**
 * Create compliance flag for human review
 */
async function createComplianceFlag(customerId, applicationId, riskFlags) {
  await dynamodb.put({
    TableName: COMPLIANCE_TABLE,
    Item: {
      flagId: `FLAG-${applicationId}-${Date.now()}`,
      customerId,
      applicationId,
      riskFlags,
      status: 'PENDING_REVIEW',
      createdAt: new Date().toISOString(),
      assignedTo: null
    }
  }).promise();
}

/**
 * Update application status
 */
async function updateApplicationStatus(applicationId, status) {
  // Implementation depends on data model
  // This is a placeholder
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
      agent: 'KYC_LAMBDA'
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
