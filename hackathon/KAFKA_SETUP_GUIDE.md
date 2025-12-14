# Kafka Event-Driven Architecture Setup Guide

## Overview

This guide covers the setup and deployment of the Kafka event-driven architecture using AWS MSK (Managed Streaming for Kafka), Kafka producers/consumers, and WebSocket real-time communication.

## Architecture Components

```
┌─────────────────────────────────────────────────────────────────────┐
│                         Angular Frontend                             │
│         (Displays real-time updates via WebSocket)                  │
└────────────────────────────┬────────────────────────────────────────┘
                             │
                    ┌────────▼────────┐
                    │  API Gateway    │
                    │   WebSocket     │
                    └────────┬────────┘
                             │
         ┌───────────────────┼──────────────────────┐
         │                   │                      │
    ┌────▼───┐        ┌─────▼──┐           ┌──────▼─────┐
    │Connect │        │Default │           │Disconnect  │
    │Lambda  │        │Lambda  │           │Lambda      │
    └────────┘        └────────┘           └────────────┘
         │
    ┌────▼──────────────────────────────────────────────────┐
    │   DynamoDB WebSocket Connections Table                │
    │   (Stores: customerId → connectionId mapping)         │
    └─────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────────┐
│              Lambda Functions (Producers)                         │
│  ┌──────────────┐  ┌───────────────┐  ┌──────────────┐          │
│  │Submit User   │  │Process Docs   │  │Perform KYC   │  ...    │
│  │Info Lambda   │  │Lambda         │  │Lambda        │          │
│  └──────┬───────┘  └───────┬───────┘  └──────┬───────┘          │
│         │                  │                  │                   │
│         └──────────────────┼──────────────────┘                   │
│                            │ (KafkaProducer)                      │
└────────────────────────────┼──────────────────────────────────────┘
                             │
                    ┌────────▼────────┐
                    │  AWS MSK Kafka  │
                    │     Cluster     │
                    └────────┬────────┘
                             │
         ┌───────────────────┼──────────────────────────────┐
         │                   │                              │
    ┌────▼──────┐      ┌────▼──────┐              ┌────────▼────┐
    │Consumer 1 │      │Consumer 2 │              │Consumer 6   │
    │(User Info)│      │(Documents)│   ...       │(Errors)     │
    └────┬──────┘      └────┬──────┘              └────────┬────┘
         │                  │                              │
         └──────────────────┼──────────────────────────────┘
                            │
    ┌───────────────────────┼────────────────────────────┐
    │                       │                            │
┌───▼────────┐    ┌────────▼───────┐        ┌──────────▼──────┐
│ DynamoDB   │    │      SNS       │        │  WebSocket API  │
│(Stores     │    │   (Alerts,    │        │  Management API │
│Events)     │    │   Emails)     │        │ (Real-time Push)│
└────────────┘    └────────────────┘        └─────────────────┘
```

## Prerequisites

- AWS Account with appropriate IAM permissions
- AWS CLI v2 configured
- Node.js 18+ with npm
- CloudFormation knowledge
- Basic understanding of Kafka

## Step 1: Deploy MSK Cluster and WebSocket API Gateway

### 1.1 Deploy CloudFormation Stack

```bash
# Set environment variables
export AWS_REGION=us-east-1
export ENVIRONMENT=dev

# Validate template
aws cloudformation validate-template \
  --template-body file://backend/infrastructure/cloudformation-msk-websocket.yaml \
  --region $AWS_REGION

# Deploy stack
aws cloudformation create-stack \
  --stack-name onboard-ai-infrastructure-$ENVIRONMENT \
  --template-body file://backend/infrastructure/cloudformation-msk-websocket.yaml \
  --parameters ParameterKey=Environment,ParameterValue=$ENVIRONMENT \
  --capabilities CAPABILITY_NAMED_IAM \
  --region $AWS_REGION

# Wait for stack creation
aws cloudformation wait stack-create-complete \
  --stack-name onboard-ai-infrastructure-$ENVIRONMENT \
  --region $AWS_REGION
```

### 1.2 Retrieve Kafka Configuration

```bash
# Get Kafka bootstrap brokers
KAFKA_BROKERS=$(aws cloudformation describe-stacks \
  --stack-name onboard-ai-infrastructure-$ENVIRONMENT \
  --query 'Stacks[0].Outputs[?OutputKey==`KafkaBootstrapServers`].OutputValue' \
  --output text \
  --region $AWS_REGION)

echo "Kafka Brokers: $KAFKA_BROKERS"

# Get Kafka credentials from Secrets Manager
SECRET_ARN=$(aws cloudformation describe-stacks \
  --stack-name onboard-ai-infrastructure-$ENVIRONMENT \
  --query 'Stacks[0].Outputs[?OutputKey==`KafkaSecretArn`].OutputValue' \
  --output text \
  --region $AWS_REGION)

aws secretsmanager get-secret-value \
  --secret-id $SECRET_ARN \
  --region $AWS_REGION
```

### 1.3 Retrieve WebSocket Endpoint

```bash
# Get WebSocket API endpoint
WEBSOCKET_ENDPOINT=$(aws cloudformation describe-stacks \
  --stack-name onboard-ai-infrastructure-$ENVIRONMENT \
  --query 'Stacks[0].Outputs[?OutputKey==`WebSocketApiEndpoint`].OutputValue' \
  --output text \
  --region $AWS_REGION)

echo "WebSocket Endpoint: $WEBSOCKET_ENDPOINT"
```

## Step 2: Create Kafka Topics

```bash
# Create topics using AWS MSK operations
# Option A: Use MSK API (recommended)
aws kafka create-cluster \
  --cluster-name onboard-ai-topics-$ENVIRONMENT \
  --kafka-version 3.4.0 \
  --number-of-broker-nodes 3

# Option B: Use Kafka CLI (if you have access to brokers)
# For each topic:
kafka-topics.sh --create \
  --bootstrap-server $KAFKA_BROKERS \
  --topic user-info-submitted \
  --partitions 3 \
  --replication-factor 2 \
  --command-config client.properties
```

### Topics to Create:

```bash
# Define topics array
TOPICS=(
  "user-info-submitted"
  "documents-processed"
  "kyc-verified"
  "policy-recommended"
  "workflow-completed"
  "workflow-errors"
)

# Create each topic
for TOPIC in "${TOPICS[@]}"; do
  kafka-topics.sh --create \
    --bootstrap-server $KAFKA_BROKERS \
    --topic $TOPIC \
    --partitions 3 \
    --replication-factor 2 \
    --config retention.ms=604800000 \
    --config cleanup.policy=delete
done
```

## Step 3: Configure Lambda Environment Variables

### 3.1 Update Lambda Functions with Kafka Configuration

```bash
# For each Lambda function that uses Kafka producer:

aws lambda update-function-configuration \
  --function-name onboard-ai-submit-user-info-$ENVIRONMENT \
  --environment Variables="{
    KAFKA_BROKERS=$KAFKA_BROKERS,
    KAFKA_USERNAME=onboard-ai-producer,
    KAFKA_PASSWORD=<your-kafka-password>,
    WEBSOCKET_ENDPOINT=$WEBSOCKET_ENDPOINT,
    USERS_TABLE=users-$ENVIRONMENT,
    APPLICATIONS_TABLE=applications-$ENVIRONMENT,
    KYC_RESULTS_TABLE=kyc-results-$ENVIRONMENT,
    AUDIT_TABLE=audit-logs-$ENVIRONMENT
  }" \
  --region $AWS_REGION
```

### 3.2 Store Kafka Credentials in Environment

```bash
# Create local .env file (DO NOT COMMIT)
cat > .env.local << 'EOF'
ENVIRONMENT=dev
AWS_REGION=us-east-1
KAFKA_BROKERS=<brokers-from-step-1.2>
KAFKA_USERNAME=onboard-ai-producer
KAFKA_PASSWORD=<password-from-step-1.2>
WEBSOCKET_ENDPOINT=<endpoint-from-step-1.3>
EOF

# Load in deployment scripts
source .env.local
```

## Step 4: Deploy Kafka Producer/Consumer Lambdas

### 4.1 Package Producer Lambda

```bash
# Create deployment package
mkdir -p lambda-deployment/nodejs/node_modules

# Copy Kafka producer
cp backend/kafka-producers/kafka-producer.js lambda-deployment/nodejs/

# Copy existing Lambda functions with Kafka integration
cp backend/lambda-functions/lambda-with-kafka-integration.js lambda-deployment/nodejs/

# Install dependencies
cd lambda-deployment/nodejs
npm install kafkajs aws-sdk uuid
cd ../..

# Create ZIP
zip -r lambda-producer-deployment.zip lambda-deployment/
```

### 4.2 Update Lambda Functions in AWS

```bash
# Update each Lambda function with new code
aws lambda update-function-code \
  --function-name onboard-ai-submit-user-info-$ENVIRONMENT \
  --zip-file fileb://lambda-producer-deployment.zip \
  --region $AWS_REGION

aws lambda update-function-code \
  --function-name onboard-ai-process-documents-$ENVIRONMENT \
  --zip-file fileb://lambda-producer-deployment.zip \
  --region $AWS_REGION

# ... repeat for other Lambda functions
```

### 4.3 Deploy Consumer Lambdas

```bash
# Package consumer Lambdas
mkdir -p lambda-consumer-deployment/nodejs/node_modules

cp backend/kafka-consumers/kafka-consumer.js lambda-consumer-deployment/nodejs/
cp backend/kafka-consumers/index.js lambda-consumer-deployment/nodejs/

cd lambda-consumer-deployment/nodejs
npm install kafkajs aws-sdk uuid
cd ../..

zip -r lambda-consumer-deployment.zip lambda-consumer-deployment/

# Create consumer Lambda functions
CONSUMER_TOPICS=(
  "user-info-submitted"
  "documents-processed"
  "kyc-verified"
  "policy-recommended"
  "workflow-completed"
  "workflow-errors"
)

for TOPIC in "${CONSUMER_TOPICS[@]}"; do
  FUNCTION_NAME="onboard-ai-consumer-${TOPIC///-/}_$ENVIRONMENT"
  
  aws lambda create-function \
    --function-name $FUNCTION_NAME \
    --runtime nodejs18.x \
    --role arn:aws:iam::$(aws sts get-caller-identity --query Account --output text):role/kafka-consumer-role-$ENVIRONMENT \
    --handler index.handler \
    --zip-file fileb://lambda-consumer-deployment.zip \
    --timeout 300 \
    --memory-size 512 \
    --environment Variables="{
      KAFKA_BROKERS=$KAFKA_BROKERS,
      KAFKA_TOPIC=$TOPIC,
      KAFKA_USERNAME=onboard-ai-producer,
      KAFKA_PASSWORD=<password>,
      WEBSOCKET_TABLE=websocket-connections-$ENVIRONMENT,
      APPLICATIONS_TABLE=applications-$ENVIRONMENT,
      WEBSOCKET_ENDPOINT=$WEBSOCKET_ENDPOINT
    }" \
    --region $AWS_REGION
done
```

## Step 5: Configure Kafka Event Source Mapping

```bash
# For each consumer Lambda, create event source mapping
# This connects the Lambda to Kafka topics

aws lambda create-event-source-mapping \
  --event-source-arn arn:aws:kafka:$AWS_REGION:$(aws sts get-caller-identity --query Account --output text):cluster/onboard-ai-cluster-$ENVIRONMENT/* \
  --function-name onboard-ai-consumer-user-info-submitted-$ENVIRONMENT \
  --topics user-info-submitted \
  --starting-position LATEST \
  --batch-size 100 \
  --region $AWS_REGION
```

## Step 6: Configure WebSocket Lambda Permissions

```bash
# Grant API Gateway permissions to invoke WebSocket Lambdas
WS_ENDPOINT_ARN="arn:aws:execute-api:$AWS_REGION:$(aws sts get-caller-identity --query Account --output text):$(echo $WEBSOCKET_ENDPOINT | cut -d'.' -f1)/*/*"

aws lambda add-permission \
  --function-name onboard-ai-websocket-connect-$ENVIRONMENT \
  --statement-id AllowAPIGateway \
  --action lambda:InvokeFunction \
  --principal apigateway.amazonaws.com \
  --source-arn $WS_ENDPOINT_ARN \
  --region $AWS_REGION
```

## Step 7: Test the Infrastructure

### 7.1 Test Kafka Producer

```bash
# Create test Lambda function to publish event
aws lambda invoke \
  --function-name onboard-ai-submit-user-info-$ENVIRONMENT \
  --payload '{"body": "{\"email\":\"test@example.com\",\"firstName\":\"John\",\"lastName\":\"Doe\",\"dateOfBirth\":\"1990-01-01\",\"phoneNumber\":\"+1234567890\"}"}' \
  response.json \
  --region $AWS_REGION

cat response.json
```

### 7.2 Test WebSocket Connection

```bash
# Using wscat tool
npm install -g wscat

# Connect to WebSocket
wscat -c "$WEBSOCKET_ENDPOINT?customerId=test-customer-123"

# In another terminal, publish a test event
# The WebSocket connection should receive the event in real-time
```

### 7.3 Verify Kafka Topics

```bash
# Check topics
kafka-topics.sh --list \
  --bootstrap-server $KAFKA_BROKERS \
  --command-config client.properties

# Check consumer group lag
kafka-consumer-groups.sh --describe \
  --group onboard-ai-consumer-group \
  --bootstrap-server $KAFKA_BROKERS \
  --command-config client.properties
```

## Step 8: Monitoring and Logging

### 8.1 CloudWatch Monitoring

```bash
# View Kafka consumer lag
aws cloudwatch get-metric-statistics \
  --namespace AWS/Kafka \
  --metric-name BytesInPerSec \
  --dimensions Name=Cluster,Value=onboard-ai-cluster-$ENVIRONMENT \
  --start-time $(date -u -d '1 hour ago' +%Y-%m-%dT%H:%M:%S) \
  --end-time $(date -u +%Y-%m-%dT%H:%M:%S) \
  --period 300 \
  --statistics Average \
  --region $AWS_REGION
```

### 8.2 Lambda Logs

```bash
# View Lambda logs
aws logs tail /aws/lambda/onboard-ai-consumer-user-info-submitted-$ENVIRONMENT \
  --follow \
  --region $AWS_REGION

# View specific Lambda error logs
aws logs filter-log-events \
  --log-group-name /aws/lambda/onboard-ai-consumer-user-info-submitted-$ENVIRONMENT \
  --filter-pattern "ERROR" \
  --region $AWS_REGION
```

## Step 9: Production Deployment Checklist

- [ ] MSK cluster deployed and healthy
- [ ] All Kafka topics created with proper retention
- [ ] WebSocket API Gateway deployed
- [ ] Lambda producer functions updated with Kafka integration
- [ ] Lambda consumer functions deployed
- [ ] Event source mappings configured
- [ ] Lambda permissions granted
- [ ] Environment variables configured
- [ ] Secrets Manager configured with Kafka credentials
- [ ] CloudWatch alarms set up
- [ ] DynamoDB tables with TTL configured
- [ ] Security groups properly configured
- [ ] VPC and subnet configuration verified
- [ ] Encryption enabled (KMS, TLS)
- [ ] SASL/SCRAM authentication enabled
- [ ] Monitoring dashboards created
- [ ] Testing completed (producer, consumer, WebSocket)
- [ ] Scaling policies configured
- [ ] Backup and disaster recovery plan

## Troubleshooting

### Issue: Lambda cannot connect to Kafka

```bash
# Check security group
aws ec2 describe-security-groups \
  --group-names onboard-ai-kafka-sg-$ENVIRONMENT \
  --region $AWS_REGION

# Check Lambda VPC configuration
aws lambda get-function-configuration \
  --function-name onboard-ai-submit-user-info-$ENVIRONMENT \
  --region $AWS_REGION | jq '.VpcConfig'

# Check Kafka broker status
aws kafka describe-cluster \
  --cluster-arn arn:aws:kafka:$AWS_REGION:$(aws sts get-caller-identity --query Account --output text):cluster/onboard-ai-cluster-$ENVIRONMENT/* \
  --region $AWS_REGION
```

### Issue: Consumer lag increasing

```bash
# Check consumer group status
kafka-consumer-groups.sh --describe \
  --group onboard-ai-consumer-group \
  --bootstrap-server $KAFKA_BROKERS

# Increase Lambda concurrency
aws lambda put-function-concurrency \
  --function-name onboard-ai-consumer-user-info-submitted-$ENVIRONMENT \
  --reserved-concurrent-executions 100 \
  --region $AWS_REGION
```

### Issue: WebSocket connections not persisting

```bash
# Check DynamoDB table
aws dynamodb scan \
  --table-name websocket-connections-$ENVIRONMENT \
  --region $AWS_REGION

# Check TTL setting
aws dynamodb describe-table \
  --table-name websocket-connections-$ENVIRONMENT \
  --region $AWS_REGION | jq '.Table.TimeToLiveDescription'
```

## Cost Optimization

- **MSK:** Use On-Demand billing for dev, Reserved Capacity for production
- **Lambda:** Configure appropriate memory and concurrency limits
- **DynamoDB:** Use on-demand for variable traffic
- **CloudWatch:** Set appropriate log retention (7 days for logs)
- **Data Transfer:** Monitor cross-AZ and cross-region charges

## References

- [AWS MSK Documentation](https://docs.aws.amazon.com/msk/)
- [KafkaJS Documentation](https://kafka.js.org/)
- [AWS API Gateway WebSocket](https://docs.aws.amazon.com/apigateway/latest/developerguide/websocket-api.html)
- [DynamoDB Streams](https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/Streams.html)
