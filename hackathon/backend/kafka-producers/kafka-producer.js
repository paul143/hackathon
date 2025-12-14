/**
 * Kafka Producer Utility for OnboardAI
 * Publishes events from Lambda functions to Kafka topics
 * Events: user-info-submitted, documents-processed, kyc-verified, policy-recommended
 */

const { Kafka } = require('kafkajs');

class KafkaProducer {
  constructor(brokers = process.env.KAFKA_BROKERS?.split(',') || []) {
    this.brokers = brokers;
    this.kafka = new Kafka({
      clientId: 'onboard-ai-producer',
      brokers: this.brokers,
      ssl: true,
      sasl: {
        mechanism: 'scram-sha-512',
        username: process.env.KAFKA_USERNAME,
        password: process.env.KAFKA_PASSWORD
      }
    });
    this.producer = this.kafka.producer();
    this.connected = false;
  }

  /**
   * Connect to Kafka cluster
   */
  async connect() {
    if (this.connected) return;
    try {
      await this.producer.connect();
      this.connected = true;
      console.log('✓ Kafka Producer connected');
    } catch (error) {
      console.error('Kafka Producer connection failed:', error);
      throw error;
    }
  }

  /**
   * Disconnect from Kafka cluster
   */
  async disconnect() {
    if (!this.connected) return;
    try {
      await this.producer.disconnect();
      this.connected = false;
      console.log('✓ Kafka Producer disconnected');
    } catch (error) {
      console.error('Kafka Producer disconnect failed:', error);
    }
  }

  /**
   * Publish user info submitted event
   */
  async publishUserInfoSubmitted(customerId, userData) {
    return this.publishEvent('user-info-submitted', {
      eventType: 'USER_INFO_SUBMITTED',
      customerId,
      timestamp: new Date().toISOString(),
      data: userData,
      source: 'SUBMIT_USER_INFO_LAMBDA'
    });
  }

  /**
   * Publish documents processed event
   */
  async publishDocumentsProcessed(customerId, applicationId, aiResults) {
    return this.publishEvent('documents-processed', {
      eventType: 'DOCUMENTS_PROCESSED',
      customerId,
      applicationId,
      timestamp: new Date().toISOString(),
      data: {
        documentCount: aiResults.length,
        confidence: aiResults.reduce((sum, r) => sum + r.confidence, 0) / aiResults.length,
        agents: aiResults.map(r => r.agent)
      },
      source: 'PROCESS_DOCUMENTS_LAMBDA'
    });
  }

  /**
   * Publish KYC verified event
   */
  async publishKYCVerified(customerId, applicationId, kycStatus, riskLevel) {
    return this.publishEvent('kyc-verified', {
      eventType: 'KYC_VERIFIED',
      customerId,
      applicationId,
      timestamp: new Date().toISOString(),
      data: {
        status: kycStatus,
        riskLevel,
        requiresHumanReview: kycStatus === 'REQUIRES_REVIEW'
      },
      source: 'PERFORM_KYC_LAMBDA'
    });
  }

  /**
   * Publish policy recommendations generated event
   */
  async publishPolicyRecommended(customerId, applicationId, recommendations) {
    return this.publishEvent('policy-recommended', {
      eventType: 'POLICY_RECOMMENDED',
      customerId,
      applicationId,
      timestamp: new Date().toISOString(),
      data: {
        recommendationCount: recommendations.length,
        topRecommendation: recommendations[0]?.id,
        topFitScore: recommendations[0]?.fitScore
      },
      source: 'POLICY_RECOMMENDATIONS_LAMBDA'
    });
  }

  /**
   * Publish workflow completed event
   */
  async publishWorkflowCompleted(customerId, applicationId, selectedPolicyId) {
    return this.publishEvent('workflow-completed', {
      eventType: 'WORKFLOW_COMPLETED',
      customerId,
      applicationId,
      timestamp: new Date().toISOString(),
      data: {
        selectedPolicyId,
        completedAt: new Date().toISOString()
      },
      source: 'POLICY_SELECTION_LAMBDA'
    });
  }

  /**
   * Publish error event
   */
  async publishError(customerId, applicationId, errorDetails) {
    return this.publishEvent('workflow-errors', {
      eventType: 'WORKFLOW_ERROR',
      customerId,
      applicationId,
      timestamp: new Date().toISOString(),
      data: errorDetails,
      source: 'LAMBDA_ERROR'
    });
  }

  /**
   * Generic event publisher
   */
  async publishEvent(topic, event) {
    try {
      await this.connect();

      const result = await this.producer.send({
        topic,
        messages: [
          {
            key: event.customerId, // Partition by customerId for ordering
            value: JSON.stringify(event),
            timestamp: Date.now().toString(),
            headers: {
              'event-type': event.eventType,
              'source': event.source,
              'version': '1.0'
            }
          }
        ]
      });

      console.log(`✓ Event published to topic '${topic}':`, event.eventType);
      return result;
    } catch (error) {
      console.error(`Error publishing event to topic '${topic}':`, error);
      // Don't throw - allow Lambda to complete even if event publishing fails
      // This prevents blocking the main workflow
    }
  }

  /**
   * Publish batch events
   */
  async publishBatch(topic, events) {
    try {
      await this.connect();

      const messages = events.map(event => ({
        key: event.customerId,
        value: JSON.stringify(event),
        timestamp: Date.now().toString(),
        headers: {
          'event-type': event.eventType,
          'source': event.source
        }
      }));

      await this.producer.send({ topic, messages });
      console.log(`✓ ${events.length} events published to topic '${topic}'`);
    } catch (error) {
      console.error(`Error publishing batch to topic '${topic}':`, error);
    }
  }
}

module.exports = KafkaProducer;
