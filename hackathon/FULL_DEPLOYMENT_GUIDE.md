# Complete Event-Driven System Deployment Guide

## Table of Contents

1. [System Architecture Overview](#system-architecture-overview)
2. [Infrastructure Deployment](#infrastructure-deployment)
3. [Application Deployment](#application-deployment)
4. [Integration Testing](#integration-testing)
5. [Monitoring and Maintenance](#monitoring-and-maintenance)
6. [Troubleshooting](#troubleshooting)

## System Architecture Overview

### End-to-End Event Flow

```
User Submits Info via Angular UI
         ↓
Angular Frontend → REST API (API Gateway)
         ↓
Lambda Function (Submit User Info)
         ↓
DynamoDB (Store User Record)
         ↓
KafkaProducer.publishUserInfoSubmitted()
         ↓
AWS MSK Kafka Broker (user-info-submitted topic)
         ↓
Kafka Consumer Lambda
         ↓
┌─────────┬──────────────┬────────────────────┐
│         │              │                    │
v         v              v                    v
DynamoDB  SNS Topic      WebSocket API        Audit Log
Update    (Alert)        Management API       (Record)
          (Email)        (Push to Client)
          
         ↓
Angular Frontend receives real-time update via WebSocket
and updates UI without page refresh
```

### Component Responsibilities

| Component | Purpose | Technology |
|-----------|---------|-----------|
| **Angular Frontend** | User interface, real-time updates | Angular 16, TypeScript |
| **API Gateway (REST)** | RESTful API endpoints | AWS API Gateway |
| **API Gateway (WebSocket)** | Real-time bidirectional communication | AWS API Gateway WebSocket |
| **Lambda Functions** | Business logic, event publishing | Node.js, KafkaProducer |
| **AWS MSK Kafka** | Event streaming and ordering | Apache Kafka 3.4.0 |
| **Kafka Consumers** | Event processing and downstream actions | Lambda + KafkaConsumer |
| **DynamoDB** | Data persistence and event log | NoSQL Database |
| **SNS** | Asynchronous notifications | Pub/Sub Messaging |
| **CloudWatch** | Monitoring and logging | Observability |

---

## Infrastructure Deployment

### Phase 1: Prerequisites

```bash
# Install required tools
brew install awscli node npm  # macOS
# or for Windows: choco install awscli nodejs npm

# Configure AWS CLI
aws configure
# Enter: Access Key, Secret Key, Region (us-east-1), Output format (json)

# Verify credentials
aws sts get-caller-identity

# Clone repository
git clone https://github.com/your-org/agentic-ai-onboarding.git
cd agentic-ai-onboarding

# Set environment variables
export AWS_REGION=us-east-1
export ENVIRONMENT=dev
export ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
```

### Phase 2: Deploy MSK Cluster and WebSocket API

```bash
# 1. Validate CloudFormation template
aws cloudformation validate-template \
  --template-body file://backend/infrastructure/cloudformation-msk-websocket.yaml

# 2. Create the stack
aws cloudformation create-stack \
  --stack-name onboard-ai-$ENVIRONMENT \
  --template-body file://backend/infrastructure/cloudformation-msk-websocket.yaml \
  --parameters ParameterKey=Environment,ParameterValue=$ENVIRONMENT \
  --capabilities CAPABILITY_NAMED_IAM

# 3. Monitor stack creation (takes ~10-15 minutes)
aws cloudformation describe-stacks \
  --stack-name onboard-ai-$ENVIRONMENT \
  --query 'Stacks[0].StackStatus'

# Wait for completion
aws cloudformation wait stack-create-complete \
  --stack-name onboard-ai-$ENVIRONMENT

# 4. Get stack outputs
aws cloudformation describe-stacks \
  --stack-name onboard-ai-$ENVIRONMENT \
  --query 'Stacks[0].Outputs'
```

### Phase 3: Extract and Store Configuration

```bash
# Create config file
cat > config/$ENVIRONMENT.env << 'EOF'
# AWS Configuration
AWS_REGION=us-east-1
ENVIRONMENT=dev
ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)

# Kafka Configuration
KAFKA_BROKERS=$(aws cloudformation describe-stacks \
  --stack-name onboard-ai-$ENVIRONMENT \
  --query 'Stacks[0].Outputs[?OutputKey==`KafkaBootstrapServers`].OutputValue' \
  --output text)

KAFKA_USERNAME=onboard-ai-producer

KAFKA_PASSWORD=$(aws secretsmanager get-secret-value \
  --secret-id onboard-ai/kafka/$ENVIRONMENT \
  --query 'SecretString' \
  --output text | jq -r '.password')

# WebSocket Configuration
WEBSOCKET_ENDPOINT=$(aws cloudformation describe-stacks \
  --stack-name onboard-ai-$ENVIRONMENT \
  --query 'Stacks[0].Outputs[?OutputKey==`WebSocketApiEndpoint`].OutputValue' \
  --output text)

# DynamoDB Tables
WEBSOCKET_TABLE=websocket-connections-$ENVIRONMENT
USERS_TABLE=users-$ENVIRONMENT
APPLICATIONS_TABLE=applications-$ENVIRONMENT
KYC_RESULTS_TABLE=kyc-results-$ENVIRONMENT
EOF

# Load configuration
source config/$ENVIRONMENT.env
```

### Phase 4: Create Kafka Topics

```bash
# Option A: Using AWS CLI (simplest)
cat > scripts/create-kafka-topics.sh << 'EOF'
#!/bin/bash
source config/$ENVIRONMENT.env

TOPICS=(
  "user-info-submitted"
  "documents-processed"
  "kyc-verified"
  "policy-recommended"
  "workflow-completed"
  "workflow-errors"
)

# Note: MSK topics are typically auto-created by Kafka cluster
# If manual creation needed, use Kafka CLI with proper SASL config
echo "Topics will be auto-created on first publish to Kafka brokers"
EOF

chmod +x scripts/create-kafka-topics.sh
```

### Phase 5: Deploy Lambda Functions with Kafka Integration

```bash
# Package producer Lambdas
mkdir -p build/producer-lambda/nodejs/node_modules

cp backend/kafka-producers/kafka-producer.js \
   build/producer-lambda/nodejs/

cp backend/lambda-functions/lambda-with-kafka-integration.js \
   build/producer-lambda/nodejs/

cd build/producer-lambda/nodejs
npm install kafkajs aws-sdk uuid
cd ../../../

zip -r build/producer-lambda.zip build/producer-lambda/

# Deploy/Update Lambda functions
aws lambda update-function-code \
  --function-name onboard-ai-submit-user-info-$ENVIRONMENT \
  --zip-file fileb://build/producer-lambda.zip

aws lambda update-function-code \
  --function-name onboard-ai-process-documents-$ENVIRONMENT \
  --zip-file fileb://build/producer-lambda.zip

aws lambda update-function-code \
  --function-name onboard-ai-perform-kyc-$ENVIRONMENT \
  --zip-file fileb://build/producer-lambda.zip

aws lambda update-function-code \
  --function-name onboard-ai-generate-recommendations-$ENVIRONMENT \
  --zip-file fileb://build/producer-lambda.zip
```

### Phase 6: Configure Lambda Environment Variables

```bash
# Update environment variables for each producer Lambda
for FUNC_NAME in submit-user-info process-documents perform-kyc generate-recommendations; do
  aws lambda update-function-configuration \
    --function-name onboard-ai-${FUNC_NAME}-$ENVIRONMENT \
    --environment Variables="{
      KAFKA_BROKERS=$KAFKA_BROKERS,
      KAFKA_USERNAME=$KAFKA_USERNAME,
      KAFKA_PASSWORD=$KAFKA_PASSWORD,
      WEBSOCKET_ENDPOINT=$WEBSOCKET_ENDPOINT,
      WEBSOCKET_TABLE=$WEBSOCKET_TABLE,
      USERS_TABLE=$USERS_TABLE,
      APPLICATIONS_TABLE=$APPLICATIONS_TABLE,
      KYC_RESULTS_TABLE=$KYC_RESULTS_TABLE,
      AUDIT_TABLE=audit-logs-$ENVIRONMENT
    }"
done
```

### Phase 7: Deploy Consumer Lambdas

```bash
# Package consumer Lambdas
mkdir -p build/consumer-lambda/nodejs/node_modules

cp backend/kafka-consumers/kafka-consumer.js \
   build/consumer-lambda/nodejs/

cp backend/kafka-consumers/index.js \
   build/consumer-lambda/nodejs/

cd build/consumer-lambda/nodejs
npm install kafkajs aws-sdk uuid
cd ../../../

zip -r build/consumer-lambda.zip build/consumer-lambda/

# Create consumer Lambda functions
TOPICS=(
  "user-info-submitted"
  "documents-processed"
  "kyc-verified"
  "policy-recommended"
  "workflow-completed"
  "workflow-errors"
)

for TOPIC in "${TOPICS[@]}"; do
  FUNC_NAME_PART=${TOPIC//-/_}
  FUNC_NAME="onboard-ai-consumer-${FUNC_NAME_PART}-$ENVIRONMENT"
  
  # Check if function exists
  if aws lambda get-function --function-name $FUNC_NAME 2>/dev/null; then
    # Update existing function
    aws lambda update-function-code \
      --function-name $FUNC_NAME \
      --zip-file fileb://build/consumer-lambda.zip
  else
    # Create new function
    aws lambda create-function \
      --function-name $FUNC_NAME \
      --runtime nodejs18.x \
      --role arn:aws:iam::$ACCOUNT_ID:role/kafka-consumer-role-$ENVIRONMENT \
      --handler index.handler \
      --zip-file fileb://build/consumer-lambda.zip \
      --timeout 300 \
      --memory-size 512 \
      --environment Variables="{
        KAFKA_BROKERS=$KAFKA_BROKERS,
        KAFKA_TOPIC=$TOPIC,
        KAFKA_USERNAME=$KAFKA_USERNAME,
        KAFKA_PASSWORD=$KAFKA_PASSWORD,
        WEBSOCKET_TABLE=$WEBSOCKET_TABLE,
        APPLICATIONS_TABLE=$APPLICATIONS_TABLE,
        WEBSOCKET_ENDPOINT=$WEBSOCKET_ENDPOINT,
        AUDIT_TABLE=audit-logs-$ENVIRONMENT
      }"
  fi
done
```

---

## Application Deployment

### Frontend Build and Deploy

```bash
# 1. Install dependencies
npm install

# 2. Configure environment for WebSocket
cat > src/environments/environment.$ENVIRONMENT.ts << EOF
export const environment = {
  production: false,
  apiUrl: 'https://api.example.com/$ENVIRONMENT',
  wsEndpoint: '$WEBSOCKET_ENDPOINT'
};
EOF

# 3. Build Angular application
ng build --configuration $ENVIRONMENT --output-path=dist/onboard-ai

# 4. Deploy to S3 and CloudFront (or your hosting)
aws s3 sync dist/onboard-ai/ \
  s3://onboard-ai-frontend-$ENVIRONMENT/ \
  --delete

# 5. Invalidate CloudFront cache (if using CloudFront)
aws cloudfront create-invalidation \
  --distribution-id $CLOUDFRONT_DISTRIBUTION_ID \
  --paths "/*"
```

---

## Integration Testing

### Test 1: Kafka Producer

```bash
# Invoke a Lambda to trigger Kafka event
aws lambda invoke \
  --function-name onboard-ai-submit-user-info-$ENVIRONMENT \
  --payload '{
    "body": "{
      \"email\": \"test@example.com\",
      \"firstName\": \"John\",
      \"lastName\": \"Doe\",
      \"dateOfBirth\": \"1990-01-01\",
      \"phoneNumber\": \"+1234567890\"
    }"
  }' \
  response.json

# Check response
cat response.json | jq '.'
```

### Test 2: WebSocket Connection

```bash
# Install WebSocket testing tool
npm install -g wscat

# Connect to WebSocket endpoint
wscat -c "$WEBSOCKET_ENDPOINT?customerId=test-customer-001"

# You should see "Connected" message
# In another terminal, trigger a Lambda to publish event
# The WebSocket should receive the event in real-time
```

### Test 3: End-to-End Flow

```bash
# 1. Open browser console
# 2. Navigate to frontend application
# 3. Fill user info form and submit
# 4. Monitor:
#    - CloudWatch Logs: /aws/lambda/onboard-ai-submit-user-info-*
#    - CloudWatch Logs: /aws/lambda/onboard-ai-consumer-user-info-submitted-*
#    - Browser console: WebSocket events
#    - UI update: Should see progress update in real-time
```

### Test 4: Error Handling

```bash
# Test error event publishing
aws lambda invoke \
  --function-name onboard-ai-submit-user-info-$ENVIRONMENT \
  --payload '{
    "body": "{
      \"email\": \"invalid-email\",
      \"firstName\": \"John\"
    }"
  }' \
  error-response.json

# Should see error published to workflow-errors topic
```

---

## Monitoring and Maintenance

### Set Up CloudWatch Alarms

```bash
# Create alarm for Lambda errors
aws cloudwatch put-metric-alarm \
  --alarm-name onboard-ai-lambda-errors-$ENVIRONMENT \
  --alarm-description "Lambda function errors" \
  --metric-name Errors \
  --namespace AWS/Lambda \
  --statistic Sum \
  --period 300 \
  --threshold 5 \
  --comparison-operator GreaterThanOrEqualToThreshold \
  --evaluation-periods 1 \
  --alarm-actions arn:aws:sns:$AWS_REGION:$ACCOUNT_ID:onboard-ai-alerts-$ENVIRONMENT

# Create alarm for Kafka consumer lag
aws cloudwatch put-metric-alarm \
  --alarm-name onboard-ai-kafka-lag-$ENVIRONMENT \
  --alarm-description "Kafka consumer lag" \
  --metric-name ConsumerLag \
  --namespace AWS/Kafka \
  --statistic Maximum \
  --period 300 \
  --threshold 1000 \
  --comparison-operator GreaterThanThreshold
```

### View Logs

```bash
# Real-time log viewing
aws logs tail /aws/lambda/onboard-ai-submit-user-info-$ENVIRONMENT --follow

# Filter for errors
aws logs filter-log-events \
  --log-group-name /aws/lambda/onboard-ai-consumer-user-info-submitted-$ENVIRONMENT \
  --filter-pattern "ERROR"

# Get log statistics
aws logs describe-log-groups | jq '.logGroups[] | select(.logGroupName | contains("onboard-ai"))'
```

### Scaling Configuration

```bash
# Set Lambda concurrency limits
aws lambda put-function-concurrency \
  --function-name onboard-ai-submit-user-info-$ENVIRONMENT \
  --reserved-concurrent-executions 100

# Enable MSK auto-scaling
aws autoscaling put-scaling-policy \
  --auto-scaling-group-name onboard-ai-asg-$ENVIRONMENT \
  --policy-name scale-up \
  --policy-type TargetTrackingScaling \
  --target-tracking-configuration file://scaling-config.json
```

---

## Troubleshooting

### Issue: Lambda cannot connect to Kafka

**Symptoms:** Lambda errors, timeout errors

**Solutions:**
```bash
# 1. Check security group
aws ec2 describe-security-groups \
  --filters Name=group-name,Values=onboard-ai-kafka-sg-$ENVIRONMENT

# 2. Check Lambda VPC configuration
aws lambda get-function-configuration \
  --function-name onboard-ai-submit-user-info-$ENVIRONMENT | jq '.VpcConfig'

# 3. Verify Kafka brokers are reachable
aws kafka describe-cluster \
  --cluster-arn arn:aws:kafka:$AWS_REGION:$ACCOUNT_ID:cluster/onboard-ai-cluster-$ENVIRONMENT/*

# 4. Check Kafka credentials
aws secretsmanager get-secret-value \
  --secret-id onboard-ai/kafka/$ENVIRONMENT
```

### Issue: WebSocket events not received

**Symptoms:** No real-time updates in UI

**Solutions:**
```bash
# 1. Check WebSocket connections table
aws dynamodb scan \
  --table-name websocket-connections-$ENVIRONMENT

# 2. Check API Gateway logs
aws logs tail /aws/apigateway/websocket/$ENVIRONMENT --follow

# 3. Verify WebSocket endpoint is correct
echo "WebSocket Endpoint: $WEBSOCKET_ENDPOINT"

# 4. Check browser console for WebSocket errors
```

### Issue: Consumer lag increasing

**Symptoms:** Events not being processed, backlog building up

**Solutions:**
```bash
# 1. Check consumer group lag
kafka-consumer-groups.sh --describe \
  --group onboard-ai-consumer-$TOPIC \
  --bootstrap-server $KAFKA_BROKERS

# 2. Increase Lambda memory and timeout
aws lambda update-function-configuration \
  --function-name onboard-ai-consumer-$TOPIC-$ENVIRONMENT \
  --memory-size 1024 \
  --timeout 600

# 3. Increase Lambda concurrency
aws lambda put-function-concurrency \
  --function-name onboard-ai-consumer-$TOPIC-$ENVIRONMENT \
  --reserved-concurrent-executions 500

# 4. Check Lambda logs for errors
aws logs tail /aws/lambda/onboard-ai-consumer-$TOPIC-$ENVIRONMENT --follow
```

### Issue: DynamoDB throttling

**Symptoms:** Lambda errors, slow data storage

**Solutions:**
```bash
# Check DynamoDB metrics
aws cloudwatch get-metric-statistics \
  --namespace AWS/DynamoDB \
  --metric-name ConsumedWriteCapacityUnits \
  --dimensions Name=TableName,Value=$APPLICATIONS_TABLE \
  --start-time $(date -u -d '1 hour ago' +%Y-%m-%dT%H:%M:%S) \
  --end-time $(date -u +%Y-%m-%dT%H:%M:%S) \
  --period 300 \
  --statistics Sum,Average

# Switch to on-demand billing
aws dynamodb update-table \
  --table-name $APPLICATIONS_TABLE \
  --billing-mode PAY_PER_REQUEST
```

---

## Rollback Procedures

```bash
# Rollback Lambda code to previous version
aws lambda update-function-code \
  --function-name onboard-ai-submit-user-info-$ENVIRONMENT \
  --s3-bucket code-versions \
  --s3-key previous-version.zip

# Rollback CloudFormation stack
aws cloudformation cancel-update-stack \
  --stack-name onboard-ai-$ENVIRONMENT

# Full stack rollback (if needed)
aws cloudformation delete-stack \
  --stack-name onboard-ai-$ENVIRONMENT
```

---

## Performance Benchmarks

| Metric | Target | Current |
|--------|--------|---------|
| User Info Submission | <1s | TBD |
| Document Processing | <5s | TBD |
| KYC Verification | <10s | TBD |
| WebSocket Event Delivery | <100ms | TBD |
| Kafka Event Processing | <500ms | TBD |

## Contact & Support

For issues or questions:
- Check CloudWatch Logs
- Review Kafka consumer lag metrics
- Verify security group and IAM permissions
- Test individual components in isolation
