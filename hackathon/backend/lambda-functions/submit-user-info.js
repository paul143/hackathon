/**
 * Lambda Function: Submit User Info
 * Purpose: Validate and store user information (Tile 1)
 * Triggers: API Gateway POST /api/user/submit
 * Outputs: DynamoDB Users table
 */

const AWS = require('aws-sdk');
const dynamodb = new AWS.DynamoDB.DocumentClient();
const { v4: uuidv4 } = require('uuid');

const USERS_TABLE = process.env.USERS_TABLE || 'users';

/**
 * Email validation regex
 */
function validateEmail(email) {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

/**
 * Main handler function
 */
exports.handler = async (event) => {
  try {
    // Parse request body
    const body = JSON.parse(event.body || '{}');
    const { email, firstName, lastName, dateOfBirth, phoneNumber } = body;

    // Validation
    if (!email || !validateEmail(email)) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'Invalid email format' }),
        headers: { 'Content-Type': 'application/json' }
      };
    }

    if (!firstName || !lastName || !dateOfBirth || !phoneNumber) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'Missing required fields' }),
        headers: { 'Content-Type': 'application/json' }
      };
    }

    // Check if user already exists
    const existingUser = await dynamodb.get({
      TableName: USERS_TABLE,
      Key: { email }
    }).promise();

    if (existingUser.Item) {
      return {
        statusCode: 409,
        body: JSON.stringify({ 
          error: 'User already exists',
          customerId: existingUser.Item.customerId 
        }),
        headers: { 'Content-Type': 'application/json' }
      };
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
      TableName: USERS_TABLE,
      Item: userRecord
    }).promise();

    // Log audit event
    await logAuditEvent(customerId, 'USER_INFO_SUBMITTED', { email, firstName, lastName });

    return {
      statusCode: 200,
      body: JSON.stringify({
        success: true,
        customerId,
        message: 'User information submitted successfully',
        tileProgress: userRecord.tileProgress
      }),
      headers: { 'Content-Type': 'application/json' }
    };
  } catch (error) {
    console.error('Error:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Internal server error' }),
      headers: { 'Content-Type': 'application/json' }
    };
  }
};

/**
 * Log audit events to DynamoDB
 */
async function logAuditEvent(customerId, action, details) {
  const auditTable = process.env.AUDIT_TABLE || 'audit-logs';
  const timestamp = new Date().toISOString();

  await dynamodb.put({
    TableName: auditTable,
    Item: {
      customerId,
      timestamp,
      action,
      details,
      agent: 'USER_INFO_LAMBDA'
    }
  }).promise();
}
