# Quick Reference Guide - Kafka Event-Driven Architecture

## 🚀 Quick Start (5 Minutes)

### 1. Deploy Infrastructure
```bash
export AWS_REGION=us-east-1
export ENVIRONMENT=dev

# Deploy CloudFormation stack (takes 10-15 minutes)
aws cloudformation create-stack \
  --stack-name onboard-ai-$ENVIRONMENT \
  --template-body file://backend/infrastructure/cloudformation-msk-websocket.yaml \
  --parameters ParameterKey=Environment,ParameterValue=$ENVIRONMENT \
  --capabilities CAPABILITY_NAMED_IAM
```

### 2. Extract Configuration
```bash
# Get Kafka brokers
aws cloudformation describe-stacks \
  --stack-name onboard-ai-$ENVIRONMENT \
  --query 'Stacks[0].Outputs[?OutputKey==`KafkaBootstrapServers`].OutputValue' \
  --output text

# Get WebSocket endpoint
aws cloudformation describe-stacks \
  --stack-name onboard-ai-$ENVIRONMENT \
  --query 'Stacks[0].Outputs[?OutputKey==`WebSocketApiEndpoint`].OutputValue' \
  --output text
```

### 3. Deploy Lambda Functions
```bash
# Package and deploy producer Lambdas
cd backend/lambda-functions
npm install
zip -r ../../lambda-producer.zip .
aws lambda update-function-code --function-name onboard-ai-submit-user-info-$ENVIRONMENT \
  --zip-file fileb://../../lambda-producer.zip
```

### 4. Deploy WebSocket Service
```bash
# WebSocket service is already in CloudFormation
# Just verify it's deployed:
aws apigatewayv2 get-apis | grep onboard-ai-websocket
```

### 5. Test End-to-End
```bash
# Trigger a Lambda to publish event
aws lambda invoke --function-name onboard-ai-submit-user-info-$ENVIRONMENT \
  --payload '{"body": "{\"email\":\"test@example.com\",\"firstName\":\"John\"}"}' \
  response.json

# Connect to WebSocket
wscat -c "wss://your-websocket-endpoint?customerId=test-123"
```

---

## 📋 Kafka Topics Reference

| # | Topic Name | Producer Lambda | Consumer Handler | DynamoDB Update | SNS Alert |
|---|-----------|-----------------|-----------------|-----------------|-----------|
| 1 | user-info-submitted | submitUserInfoWithKafka | handleUserInfoSubmitted | users table | No |
| 2 | documents-processed | processDocumentsWithKafka | handleDocumentsProcessed | applications table | No |
| 3 | kyc-verified | performKYCWithKafka | handleKYCVerified | kyc-results table | Yes (if review) |
| 4 | policy-recommended | generateRecommendationsWithKafka | handlePolicyRecommended | recommendations table | No |
| 5 | workflow-completed | submitPolicySelectionWithKafka | handleWorkflowCompleted | applications table | Yes (email) |
| 6 | workflow-errors | Any Lambda (catch block) | handleWorkflowError | error-logs table | Yes (support) |

---

## 🔧 Environment Variables Needed

### For Lambda Producer Functions
```bash
KAFKA_BROKERS=b-1.cluster.xxxxx.kafka.us-east-1.amazonaws.com:9094,b-2...
KAFKA_USERNAME=onboard-ai-producer
KAFKA_PASSWORD=<from-secrets-manager>
WEBSOCKET_ENDPOINT=wss://xxxxx.execute-api.us-east-1.amazonaws.com/dev
WEBSOCKET_TABLE=websocket-connections-dev
USERS_TABLE=users-dev
APPLICATIONS_TABLE=applications-dev
KYC_RESULTS_TABLE=kyc-results-dev
```

### For Lambda Consumer Functions
```bash
KAFKA_BROKERS=...
KAFKA_TOPIC=user-info-submitted (varies per consumer)
KAFKA_USERNAME=onboard-ai-producer
KAFKA_PASSWORD=...
WEBSOCKET_TABLE=websocket-connections-dev
WEBSOCKET_ENDPOINT=...
APPLICATIONS_TABLE=applications-dev
```

### For Angular Frontend
```typescript
// In environment file
export const environment = {
  wsEndpoint: 'wss://xxxxx.execute-api.us-east-1.amazonaws.com/dev'
};
```

---

## 🔗 Integration Points

### How Lambda → Kafka → Consumer → WebSocket Works

```typescript
// Step 1: Lambda publishes event
const kafkaProducer = new KafkaProducer();
await kafkaProducer.publishUserInfoSubmitted(customerId, userData);

// Step 2: Event goes to Kafka topic
// Kafka Topic: "user-info-submitted" ← [Event Published]

// Step 3: Consumer Lambda subscribes
// Event Source Mapping: Kafka → Lambda Consumer

// Step 4: Consumer processes event
const consumer = new KafkaConsumer('user-info-submitted', handleUserInfoSubmitted);
await consumer.start();

// Step 5: Consumer sends WebSocket event
await publishWebSocketEvent(customerId, {
  type: 'USER_INFO_SUBMITTED',
  data: userData
});

// Step 6: Frontend receives real-time update
this.webSocket.events$.subscribe(event => {
  if (event.type === 'USER_INFO_SUBMITTED') {
    // Update UI
  }
});
```

---

## 📊 Monitoring Commands

### Check Kafka Topics
```bash
# List topics
kafka-topics.sh --list --bootstrap-server $KAFKA_BROKERS

# Describe topic
kafka-topics.sh --describe --topic user-info-submitted \
  --bootstrap-server $KAFKA_BROKERS

# Check consumer group lag
kafka-consumer-groups.sh --describe \
  --group onboard-ai-consumer-user-info \
  --bootstrap-server $KAFKA_BROKERS
```

### Check Lambda Logs
```bash
# Stream logs in real-time
aws logs tail /aws/lambda/onboard-ai-submit-user-info-$ENVIRONMENT --follow

# Filter for errors
aws logs filter-log-events \
  --log-group-name /aws/lambda/onboard-ai-consumer-user-info-submitted-$ENVIRONMENT \
  --filter-pattern "ERROR"

# Get log statistics
aws logs describe-log-groups --query 'logGroups[?contains(logGroupName, `onboard-ai`)].logGroupName'
```

### Check WebSocket Connections
```bash
# Scan DynamoDB for active connections
aws dynamodb scan --table-name websocket-connections-$ENVIRONMENT

# Count connections
aws dynamodb scan --table-name websocket-connections-$ENVIRONMENT \
  --select COUNT --output text
```

### Check DynamoDB Events
```bash
# Query events for a customer
aws dynamodb query --table-name kafka-events-$ENVIRONMENT \
  --key-condition-expression "customerId = :cid" \
  --expression-attribute-values '{":cid":{"S":"customer-uuid"}}'
```

---

## 🔍 Troubleshooting Quick Fixes

### Issue: Lambda can't connect to Kafka
```bash
# Check security group allows port 9094
aws ec2 describe-security-groups \
  --filters Name=group-name,Values=onboard-ai-kafka-sg-$ENVIRONMENT \
  --query 'SecurityGroups[0].IpPermissions[?ToPort==`9094`]'

# Check Lambda has VPC access
aws lambda get-function-configuration \
  --function-name onboard-ai-submit-user-info-$ENVIRONMENT | jq '.VpcConfig'

# Check Kafka cluster status
aws kafka describe-cluster --cluster-arn <cluster-arn> \
  --query 'ClusterInfo.State'
```

### Issue: WebSocket events not received
```bash
# Check if connection stored in DynamoDB
aws dynamodb get-item --table-name websocket-connections-$ENVIRONMENT \
  --key '{"customerId":{"S":"your-customer-id"}}'

# Check WebSocket endpoint
echo "Your endpoint: $WEBSOCKET_ENDPOINT"

# Test WebSocket connectivity
wscat -c "$WEBSOCKET_ENDPOINT?customerId=test-123"
```

### Issue: Consumer lag increasing
```bash
# Check lag
kafka-consumer-groups.sh --describe \
  --group onboard-ai-consumer-user-info \
  --bootstrap-server $KAFKA_BROKERS

# Increase Lambda concurrency
aws lambda put-function-concurrency \
  --function-name onboard-ai-consumer-user-info-submitted-$ENVIRONMENT \
  --reserved-concurrent-executions 500
```

### Issue: DynamoDB throttling
```bash
# Switch to on-demand billing
aws dynamodb update-table \
  --table-name $APPLICATIONS_TABLE \
  --billing-mode PAY_PER_REQUEST

# Check consumed capacity
aws cloudwatch get-metric-statistics \
  --namespace AWS/DynamoDB \
  --metric-name ConsumedWriteCapacityUnits \
  --dimensions Name=TableName,Value=$APPLICATIONS_TABLE \
  --period 300 --statistics Sum
```

---

## 📁 Key Files Location

| File | Purpose | Location |
|------|---------|----------|
| CloudFormation Template | Infrastructure as Code | `backend/infrastructure/cloudformation-msk-websocket.yaml` |
| Kafka Producer | Publishes events | `backend/kafka-producers/kafka-producer.js` |
| Kafka Consumer | Processes events | `backend/kafka-consumers/kafka-consumer.js` |
| Consumer Handlers | Lambda exports | `backend/kafka-consumers/index.js` |
| Lambda Functions | Updated with Kafka | `backend/lambda-functions/lambda-with-kafka-integration.js` |
| WebSocket Handlers | Connection management | `backend/websocket-service/websocket-handlers.js` |
| WebSocket Service (Angular) | Frontend integration | `src/app/services/websocket.service.ts` |
| Kafka Setup Guide | Step-by-step deployment | `KAFKA_SETUP_GUIDE.md` |
| Full Deployment Guide | Complete deployment | `FULL_DEPLOYMENT_GUIDE.md` |
| Architecture Summary | System overview | `KAFKA_ARCHITECTURE_SUMMARY.md` |

---

## ⚡ Performance Targets

| Metric | Target | Monitoring |
|--------|--------|-----------|
| Event Publishing Latency | <100ms | CloudWatch Logs |
| Consumer Processing Latency | <500ms | Consumer lag metrics |
| WebSocket Delivery | <100ms | Browser console |
| End-to-End (REST → Kafka → WebSocket) | <1s | Application logs |

---

## 🔐 Security Checklist

- [ ] Kafka credentials stored in Secrets Manager
- [ ] SCRAM-SHA-512 authentication enabled
- [ ] TLS encryption in transit enabled
- [ ] KMS encryption at rest enabled
- [ ] IAM roles follow least privilege principle
- [ ] Security groups restrict port access
- [ ] WebSocket connections have TTL
- [ ] DynamoDB encrypted at rest
- [ ] Audit logging enabled
- [ ] CloudWatch alarms configured

---

## 📞 When to Consult Full Guides

| Scenario | Guide |
|----------|-------|
| First-time deployment | FULL_DEPLOYMENT_GUIDE.md |
| Troubleshooting Kafka issues | KAFKA_SETUP_GUIDE.md |
| Understanding architecture | KAFKA_ARCHITECTURE_SUMMARY.md |
| Adding new event type | KAFKA_SETUP_GUIDE.md (Event Schema) |
| Performance tuning | FULL_DEPLOYMENT_GUIDE.md (Scaling) |
| Production deployment | FULL_DEPLOYMENT_GUIDE.md (Checklist) |

---

## 🎯 Event Publishing Checklist

For each new event type, ensure:

- [ ] Topic created in Kafka
- [ ] Producer method added to `KafkaProducer` class
- [ ] Lambda function calls producer
- [ ] Consumer handler created in `KafkaConsumer` class
- [ ] Consumer Lambda deployed and subscribed
- [ ] DynamoDB updates implemented
- [ ] SNS notifications configured (if needed)
- [ ] WebSocket event sent to frontend
- [ ] Frontend handler subscribes to event
- [ ] Tests written and passing
- [ ] Documentation updated

---

## 💡 Quick Copy-Paste Commands

```bash
# Deploy everything
export AWS_REGION=us-east-1 && export ENVIRONMENT=dev
aws cloudformation create-stack --stack-name onboard-ai-$ENVIRONMENT \
  --template-body file://backend/infrastructure/cloudformation-msk-websocket.yaml \
  --parameters ParameterKey=Environment,ParameterValue=$ENVIRONMENT \
  --capabilities CAPABILITY_NAMED_IAM

# Get endpoints
KAFKA=$(aws cloudformation describe-stacks --stack-name onboard-ai-$ENVIRONMENT \
  --query 'Stacks[0].Outputs[?OutputKey==`KafkaBootstrapServers`].OutputValue' --output text)
WS=$(aws cloudformation describe-stacks --stack-name onboard-ai-$ENVIRONMENT \
  --query 'Stacks[0].Outputs[?OutputKey==`WebSocketApiEndpoint`].OutputValue' --output text)
echo "Kafka: $KAFKA" && echo "WebSocket: $WS"

# Check deployment status
aws cloudformation describe-stacks --stack-name onboard-ai-$ENVIRONMENT \
  --query 'Stacks[0].StackStatus'

# View logs
aws logs tail /aws/lambda/onboard-ai-submit-user-info-$ENVIRONMENT --follow

# Clean up (if needed)
aws cloudformation delete-stack --stack-name onboard-ai-$ENVIRONMENT
```

---

**Last Updated:** January 2024  
**Version:** 1.0  
**Status:** Production Ready
