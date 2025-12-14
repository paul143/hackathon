/**
 * Kafka Consumer Lambda Functions
 * These functions consume messages from Kafka topics and process them
 * Each consumer runs independently as a Lambda function triggered by Kafka events
 */

// Consumer 1: Handle user-info-submitted events
const KafkaConsumer = require('./kafka-consumer');

let userInfoConsumer;

exports.handleUserInfoSubmittedHandler = async (event) => {
  try {
    if (!userInfoConsumer) {
      userInfoConsumer = new KafkaConsumer('user-info-submitted', 'user-info-group');
      await userInfoConsumer.start();
    }
    console.log('✓ User Info Consumer started');
  } catch (error) {
    console.error('Error starting user info consumer:', error);
  }
};

// Consumer 2: Handle documents-processed events
let documentsConsumer;

exports.handleDocumentsProcessedHandler = async (event) => {
  try {
    if (!documentsConsumer) {
      documentsConsumer = new KafkaConsumer('documents-processed', 'documents-group');
      await documentsConsumer.start();
    }
    console.log('✓ Documents Consumer started');
  } catch (error) {
    console.error('Error starting documents consumer:', error);
  }
};

// Consumer 3: Handle kyc-verified events
let kycConsumer;

exports.handleKYCVerifiedHandler = async (event) => {
  try {
    if (!kycConsumer) {
      kycConsumer = new KafkaConsumer('kyc-verified', 'kyc-group');
      await kycConsumer.start();
    }
    console.log('✓ KYC Consumer started');
  } catch (error) {
    console.error('Error starting KYC consumer:', error);
  }
};

// Consumer 4: Handle policy-recommended events
let policyConsumer;

exports.handlePolicyRecommendedHandler = async (event) => {
  try {
    if (!policyConsumer) {
      policyConsumer = new KafkaConsumer('policy-recommended', 'policy-group');
      await policyConsumer.start();
    }
    console.log('✓ Policy Consumer started');
  } catch (error) {
    console.error('Error starting policy consumer:', error);
  }
};

// Consumer 5: Handle workflow-completed events
let completionConsumer;

exports.handleWorkflowCompletedHandler = async (event) => {
  try {
    if (!completionConsumer) {
      completionConsumer = new KafkaConsumer('workflow-completed', 'completion-group');
      await completionConsumer.start();
    }
    console.log('✓ Workflow Completion Consumer started');
  } catch (error) {
    console.error('Error starting completion consumer:', error);
  }
};

// Consumer 6: Handle workflow-errors events
let errorConsumer;

exports.handleWorkflowErrorHandler = async (event) => {
  try {
    if (!errorConsumer) {
      errorConsumer = new KafkaConsumer('workflow-errors', 'error-group');
      await errorConsumer.start();
    }
    console.log('✓ Error Consumer started');
  } catch (error) {
    console.error('Error starting error consumer:', error);
  }
};
