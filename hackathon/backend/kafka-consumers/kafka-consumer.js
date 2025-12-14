/**
 * Kafka Consumer Service - Processes events and updates DynamoDB/WebSocket
 * Consumers subscribe to Kafka topics and handle events asynchronously
 * 
 * Topics:
 * - user-info-submitted: Updates user progress, sends WebSocket notifications
 * - documents-processed: Triggers AI processing pipeline, updates application status
 * - kyc-verified: Flags for compliance review, updates KYC status
 * - policy-recommended: Prepares recommendations for frontend display
 * - workflow-completed: Archives application, triggers thank-you email
 * - workflow-errors: Logs errors, notifies support team
 */

const { Kafka, logLevel } = require('kafkajs');
const AWS = require('aws-sdk');

const dynamodb = new AWS.DynamoDB.DocumentClient();
const sns = new AWS.SNS();

class KafkaConsumer {
  constructor(topic, groupId, brokers = process.env.KAFKA_BROKERS?.split(',') || []) {
    this.topic = topic;
    this.groupId = groupId;
    this.brokers = brokers;
    this.kafka = new Kafka({
      clientId: `onboard-ai-consumer-${groupId}`,
      brokers: this.brokers,
      ssl: true,
      sasl: {
        mechanism: 'scram-sha-512',
        username: process.env.KAFKA_USERNAME,
        password: process.env.KAFKA_PASSWORD
      },
      logLevel: logLevel.ERROR
    });
    this.consumer = this.kafka.consumer({ groupId });
    this.connected = false;
  }

  /**
   * Start consuming messages from Kafka topic
   */
  async start() {
    try {
      await this.consumer.connect();
      await this.consumer.subscribe({ topic: this.topic, fromBeginning: false });

      await this.consumer.run({
        eachMessage: async ({ topic, partition, message }) => {
          try {
            const event = JSON.parse(message.value.toString());
            console.log(`📨 Message received on topic '${topic}':`, event.eventType);

            // Route event to appropriate handler
            switch (event.eventType) {
              case 'USER_INFO_SUBMITTED':
                await this.handleUserInfoSubmitted(event);
                break;
              case 'DOCUMENTS_PROCESSED':
                await this.handleDocumentsProcessed(event);
                break;
              case 'KYC_VERIFIED':
                await this.handleKYCVerified(event);
                break;
              case 'POLICY_RECOMMENDED':
                await this.handlePolicyRecommended(event);
                break;
              case 'WORKFLOW_COMPLETED':
                await this.handleWorkflowCompleted(event);
                break;
              case 'WORKFLOW_ERROR':
                await this.handleWorkflowError(event);
                break;
              default:
                console.warn('Unknown event type:', event.eventType);
            }
          } catch (error) {
            console.error('Error processing message:', error);
          }
        }
      });

      this.connected = true;
      console.log(`✓ Kafka Consumer started for topic '${this.topic}'`);
    } catch (error) {
      console.error('Kafka Consumer startup failed:', error);
      throw error;
    }
  }

  /**
   * Stop consuming messages
   */
  async stop() {
    if (!this.connected) return;
    try {
      await this.consumer.disconnect();
      this.connected = false;
      console.log(`✓ Kafka Consumer stopped for topic '${this.topic}'`);
    } catch (error) {
      console.error('Kafka Consumer stop failed:', error);
    }
  }

  /**
   * Handle USER_INFO_SUBMITTED event
   * Updates user progress, sends WebSocket notification
   */
  async handleUserInfoSubmitted(event) {
    try {
      const { customerId, data } = event;

      // Update user record with submission timestamp
      await dynamodb.update({
        TableName: process.env.USERS_TABLE || 'users',
        Key: { email: data.email },
        UpdateExpression: 'SET userInfoSubmittedAt = :ts, #status = :status',
        ExpressionAttributeNames: { '#status': 'status' },
        ExpressionAttributeValues: {
          ':ts': event.timestamp,
          ':status': 'USER_INFO_SUBMITTED'
        }
      }).promise();

      // Send real-time WebSocket notification to frontend
      await this.publishWebSocketEvent(customerId, {
        type: 'USER_INFO_SUBMITTED',
        message: 'Your information has been received',
        progress: { tile1: 'COMPLETED', tile2: 'PENDING' },
        timestamp: event.timestamp
      });

      console.log(`✓ Processed USER_INFO_SUBMITTED for customerId: ${customerId}`);
    } catch (error) {
      console.error('Error handling USER_INFO_SUBMITTED:', error);
    }
  }

  /**
   * Handle DOCUMENTS_PROCESSED event
   * Triggers next stage (KYC verification), updates application status
   */
  async handleDocumentsProcessed(event) {
    try {
      const { customerId, applicationId, data } = event;

      // Update application record
      await dynamodb.update({
        TableName: process.env.APPLICATIONS_TABLE || 'applications',
        Key: { applicationId },
        UpdateExpression: 'SET documentsProcessedAt = :ts, avgConfidence = :conf, #status = :status',
        ExpressionAttributeNames: { '#status': 'status' },
        ExpressionAttributeValues: {
          ':ts': event.timestamp,
          ':conf': data.confidence,
          ':status': 'DOCUMENTS_PROCESSED'
        }
      }).promise();

      // Send real-time notification
      await this.publishWebSocketEvent(customerId, {
        type: 'DOCUMENTS_PROCESSED',
        message: `${data.agents.length} documents processed successfully`,
        confidence: data.confidence,
        progress: { tile2: 'COMPLETED', tile3: 'PENDING' },
        timestamp: event.timestamp
      });

      console.log(`✓ Processed DOCUMENTS_PROCESSED for applicationId: ${applicationId}`);
    } catch (error) {
      console.error('Error handling DOCUMENTS_PROCESSED:', error);
    }
  }

  /**
   * Handle KYC_VERIFIED event
   * Updates KYC status, flags for compliance if needed
   */
  async handleKYCVerified(event) {
    try {
      const { customerId, applicationId, data } = event;

      // Update application record
      await dynamodb.update({
        TableName: process.env.APPLICATIONS_TABLE || 'applications',
        Key: { applicationId },
        UpdateExpression: 'SET kycVerifiedAt = :ts, kycStatus = :status, riskLevel = :risk',
        ExpressionAttributeValues: {
          ':ts': event.timestamp,
          ':status': data.status,
          ':risk': data.riskLevel
        }
      }).promise();

      // If requires review, notify compliance team via SNS
      if (data.requiresHumanReview) {
        await sns.publish({
          TopicArn: process.env.COMPLIANCE_ALERT_TOPIC,
          Subject: `Compliance Review Required - ${applicationId}`,
          Message: `Application ${applicationId} (Customer: ${customerId}) requires manual review. Risk Level: ${data.riskLevel}`
        }).promise();
      }

      // Send WebSocket notification
      await this.publishWebSocketEvent(customerId, {
        type: 'KYC_VERIFIED',
        message: data.status === 'APPROVED' ? 'Identity verified successfully' : 'Identity verification pending review',
        status: data.status,
        riskLevel: data.riskLevel,
        progress: { tile4: 'COMPLETED', tile5: 'PENDING' },
        timestamp: event.timestamp
      });

      console.log(`✓ Processed KYC_VERIFIED for applicationId: ${applicationId}`);
    } catch (error) {
      console.error('Error handling KYC_VERIFIED:', error);
    }
  }

  /**
   * Handle POLICY_RECOMMENDED event
   * Caches recommendations, updates application status
   */
  async handlePolicyRecommended(event) {
    try {
      const { customerId, applicationId, data } = event;

      // Update application record with recommendation summary
      await dynamodb.update({
        TableName: process.env.APPLICATIONS_TABLE || 'applications',
        Key: { applicationId },
        UpdateExpression: 'SET policyRecommendedAt = :ts, topRecommendation = :top, topFitScore = :score, #status = :status',
        ExpressionAttributeNames: { '#status': 'status' },
        ExpressionAttributeValues: {
          ':ts': event.timestamp,
          ':top': data.topRecommendation,
          ':score': data.topFitScore,
          ':status': 'POLICY_RECOMMENDED'
        }
      }).promise();

      // Send WebSocket notification
      await this.publishWebSocketEvent(customerId, {
        type: 'POLICY_RECOMMENDED',
        message: `${data.recommendationCount} personalized policies generated`,
        topFitScore: data.topFitScore,
        progress: { tile5: 'ACTIVE' },
        timestamp: event.timestamp
      });

      console.log(`✓ Processed POLICY_RECOMMENDED for applicationId: ${applicationId}`);
    } catch (error) {
      console.error('Error handling POLICY_RECOMMENDED:', error);
    }
  }

  /**
   * Handle WORKFLOW_COMPLETED event
   * Archives application, triggers thank-you email, cleans up session
   */
  async handleWorkflowCompleted(event) {
    try {
      const { customerId, applicationId, data } = event;

      // Update application as completed
      await dynamodb.update({
        TableName: process.env.APPLICATIONS_TABLE || 'applications',
        Key: { applicationId },
        UpdateExpression: 'SET completedAt = :ts, selectedPolicy = :policy, #status = :status, archiveDate = :archive',
        ExpressionAttributeNames: { '#status': 'status' },
        ExpressionAttributeValues: {
          ':ts': event.timestamp,
          ':policy': data.selectedPolicyId,
          ':status': 'COMPLETED',
          ':archive': new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString() // Archive in 30 days
        }
      }).promise();

      // Send thank you notification
      await this.publishWebSocketEvent(customerId, {
        type: 'WORKFLOW_COMPLETED',
        message: 'Onboarding completed successfully! Your policy is being processed.',
        selectedPolicy: data.selectedPolicyId,
        timestamp: event.timestamp
      });

      // Send thank-you email via SNS
      await sns.publish({
        TopicArn: process.env.EMAIL_TOPIC,
        Subject: 'Thank You for Completing Your Onboarding',
        Message: `Your policy ${data.selectedPolicyId} has been selected. You will receive your policy documents shortly.`
      }).promise();

      console.log(`✓ Processed WORKFLOW_COMPLETED for applicationId: ${applicationId}`);
    } catch (error) {
      console.error('Error handling WORKFLOW_COMPLETED:', error);
    }
  }

  /**
   * Handle WORKFLOW_ERROR event
   * Logs error, notifies support team
   */
  async handleWorkflowError(event) {
    try {
      const { customerId, applicationId, data } = event;

      // Store error details for debugging
      await dynamodb.put({
        TableName: process.env.ERROR_LOGS_TABLE || 'error-logs',
        Item: {
          customerId,
          applicationId,
          errorId: `ERR-${applicationId}-${Date.now()}`,
          timestamp: event.timestamp,
          errorDetails: data,
          resolved: false
        }
      }).promise();

      // Notify support team
      await sns.publish({
        TopicArn: process.env.SUPPORT_ALERT_TOPIC,
        Subject: `Workflow Error - ${applicationId}`,
        Message: `Error occurred in onboarding workflow for ${customerId}. Error: ${JSON.stringify(data)}`
      }).promise();

      // Send error notification to frontend
      await this.publishWebSocketEvent(customerId, {
        type: 'WORKFLOW_ERROR',
        message: 'An error occurred. Our support team has been notified.',
        errorCode: data.code,
        timestamp: event.timestamp
      });

      console.log(`✓ Processed WORKFLOW_ERROR for applicationId: ${applicationId}`);
    } catch (error) {
      console.error('Error handling WORKFLOW_ERROR:', error);
    }
  }

  /**
   * Publish event to WebSocket (via API Gateway Management API)
   * Sends real-time updates to connected frontend clients
   */
  async publishWebSocketEvent(customerId, event) {
    try {
      // Get active WebSocket connection ID from cache/database
      const connectionResult = await dynamodb.get({
        TableName: process.env.WEBSOCKET_CONNECTIONS_TABLE || 'websocket-connections',
        Key: { customerId }
      }).promise();

      if (!connectionResult.Item) {
        console.warn(`No WebSocket connection found for customerId: ${customerId}`);
        return;
      }

      const connectionId = connectionResult.Item.connectionId;
      const apiGatewayManagementApi = new AWS.ApiGatewayManagementApi({
        endpoint: process.env.WEBSOCKET_ENDPOINT
      });

      // Send message to connected client
      await apiGatewayManagementApi.postToConnection({
        ConnectionId: connectionId,
        Data: JSON.stringify(event)
      }).promise();

      console.log(`✓ WebSocket event sent to ${customerId}:`, event.type);
    } catch (error) {
      if (error.code === 'GoneException') {
        // Connection closed, remove from cache
        await dynamodb.delete({
          TableName: process.env.WEBSOCKET_CONNECTIONS_TABLE || 'websocket-connections',
          Key: { customerId }
        }).promise();
      } else {
        console.error('Error publishing WebSocket event:', error);
      }
    }
  }
}

module.exports = KafkaConsumer;
