# Kafka Event-Driven Architecture - Complete Implementation Summary

## 📋 Overview

This document summarizes the complete Kafka event-driven architecture implementation for the OnboardAI insurance onboarding platform.

## 🏗️ Architecture Summary

### System Components

```
┌─────────────────────────────────────────────────────────────────┐
│                                                                 │
│              OnboardAI Event-Driven Architecture                │
│                                                                 │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  Frontend (Angular 16) ──────┐                                 │
│                              │                                 │
│                        ┌─────▼────────┐                        │
│                        │ API Gateway  │                        │
│                        │  (REST API)  │                        │
│                        └─────┬────────┘                        │
│                              │                                 │
│              ┌───────────────┼───────────────┐                 │
│              │               │               │                 │
│      ┌───────▼────┐  ┌──────▼──┐    ┌──────▼────┐            │
│      │  Submit    │  │ Process │    │  Perform  │  ...      │
│      │ User Info  │  │Documents│    │    KYC    │            │
│      │  Lambda    │  │ Lambda  │    │  Lambda   │            │
│      └───────┬────┘  └──────┬──┘    └──────┬────┘            │
│              │               │               │                 │
│              └───────────────┼───────────────┘                 │
│                        ┌─────▼────────┐                        │
│                        │ KafkaProducer│ (Publishes Events)     │
│                        └─────┬────────┘                        │
│                              │                                 │
│                        ┌─────▼────────┐                        │
│                        │  AWS MSK     │                        │
│                        │ Kafka Cluster│                        │
│                        └─────┬────────┘                        │
│                              │                                 │
│     ┌────────────────────────┼────────────────────────┐        │
│     │                        │                        │        │
│ ┌───▼──┐ ┌───▼──┐ ┌───▼──┐ ... ┌─────▼──┐         │        │
│ │ Topic│ │ Topic│ │ Topic│      │ Topic  │         │        │
│ │  1   │ │  2   │ │  3   │      │   6    │         │        │
│ └───┬──┘ └───┬──┘ └───┬──┘      └────┬───┘         │        │
│     │        │        │              │              │        │
│ ┌───▼──────────────────────────────────┐            │        │
│ │   Kafka Consumer Lambdas             │            │        │
│ │  (6 independent event processors)    │            │        │
│ └───┬──────────────────────────────────┘            │        │
│     │                                                │        │
│ ┌───┴──────┬──────────────┬──────────────┐          │        │
│ │          │              │              │          │        │
│ v          v              v              v          │        │
│DynamoDB  SNS Topics   WebSocket    Audit Logs       │        │
│(Events)  (Alerts)      (Real-time) (Compliance)     │        │
│                                                     │        │
└─────────────────────────────────────────────────────┘
```

## 📁 Files Created/Modified

### 1. Kafka Infrastructure

#### `cloudformation-msk-websocket.yaml` (500+ lines)
**Purpose:** Complete IaC for MSK cluster, WebSocket API, and Lambda functions

**Key Sections:**
- MSK Cluster configuration with SCRAM-SHA-512 authentication
- KMS encryption for data at rest
- Security group with Kafka ports (9092, 9094, 2181)
- API Gateway WebSocket with 3 routes ($connect, $disconnect, $default)
- WebSocket Lambda functions (connect, disconnect, default message handlers)
- DynamoDB tables (WebSocket connections, Kafka events)
- IAM roles with proper permissions

**Resources Created:**
- AWS::Kafka::Cluster (onboard-ai-cluster-{env})
- AWS::EC2::SecurityGroup (kafka-sg)
- AWS::KMS::Key (encryption)
- AWS::ApiGatewayV2::Api (WebSocket)
- AWS::Lambda::Function (3 WebSocket handlers)
- AWS::DynamoDB::Table (2 new tables)

---

### 2. Kafka Producer Implementation

#### `kafka-producers/kafka-producer.js` (450+ lines)
**Purpose:** Publishes workflow events to Kafka topics from Lambda functions

**Class: KafkaProducer**

Methods:
- `constructor()` - Initializes Kafka client from environment variables
- `connect()` - Establishes connection to MSK cluster
- `disconnect()` - Gracefully closes connection
- `publishUserInfoSubmitted(customerId, userData)` - User registration events
- `publishDocumentsProcessed(customerId, applicationId, aiResults)` - Document extraction results
- `publishKYCVerified(customerId, applicationId, status, riskLevel)` - Identity verification results
- `publishPolicyRecommended(customerId, applicationId, recommendations)` - Policy suggestions
- `publishWorkflowCompleted(customerId, applicationId, selectedPolicyId)` - Workflow completion
- `publishError(customerId, applicationId, errorDetails)` - Error events
- `publishEvent(topic, event)` - Generic event publisher
- `publishBatch(topic, events)` - Batch event publishing

**Features:**
- SCRAM-SHA-512 authentication to MSK
- Automatic connection management (lazy connect)
- Partitioning by customerId for event ordering
- Non-blocking error handling (failures logged but don't throw)
- Request timeout handling
- Graceful shutdown support

**Environment Variables Required:**
```
KAFKA_BROKERS=broker1:9094,broker2:9094,broker3:9094
KAFKA_USERNAME=onboard-ai-producer
KAFKA_PASSWORD=secure-password
```

---

### 3. Kafka Consumer Implementation

#### `kafka-consumers/kafka-consumer.js` (550+ lines)
**Purpose:** Consumes Kafka events and triggers downstream actions

**Class: KafkaConsumer**

Methods:
- `constructor(topic, handlerFunction)` - Initialize consumer for specific topic
- `start()` - Begin consuming events from topic
- `stop()` - Gracefully stop consumer
- `handleUserInfoSubmitted(event)` - Process user registration events
  - Updates DynamoDB users table
  - Sends WebSocket notification
  - Publishes SNS notification
  - Logs audit event
- `handleDocumentsProcessed(event)` - Process document extraction results
  - Updates application status
  - Caches AI results
  - Sends WebSocket update
- `handleKYCVerified(event)` - Process KYC verification results
  - Updates KYC status
  - Publishes SNS alert if review needed
  - Sends WebSocket notification
- `handlePolicyRecommended(event)` - Process policy recommendations
  - Caches recommendations in DynamoDB
  - Sends WebSocket notification
- `handleWorkflowCompleted(event)` - Process workflow completion
  - Archives application record
  - Publishes SNS thank-you email request
  - Sends WebSocket completion event
- `handleWorkflowError(event)` - Process workflow errors
  - Logs error details
  - Publishes SNS alert to support team
  - Sends WebSocket error notification
- `publishWebSocketEvent(customerId, event)` - Sends real-time updates via WebSocket
  - Uses API Gateway Management API
  - Handles GoneException for closed connections

**Features:**
- Event routing via switch statement (topic → handler)
- DynamoDB integration for state updates
- SNS integration for async notifications
- WebSocket event propagation
- Connection management with TTL
- Error handling and logging
- Consumer group management

**Environment Variables Required:**
```
KAFKA_BROKERS=...
KAFKA_TOPIC=user-info-submitted
KAFKA_USERNAME=...
KAFKA_PASSWORD=...
WEBSOCKET_TABLE=websocket-connections-{env}
WEBSOCKET_ENDPOINT=wss://...execute-api...
```

---

#### `kafka-consumers/index.js` (80+ lines)
**Purpose:** Lambda handler exports for Kafka consumer functions

**Handler Functions:**
1. `handleUserInfoSubmittedHandler` → Subscribes to `user-info-submitted` topic
2. `handleDocumentsProcessedHandler` → Subscribes to `documents-processed` topic
3. `handleKYCVerifiedHandler` → Subscribes to `kyc-verified` topic
4. `handlePolicyRecommendedHandler` → Subscribes to `policy-recommended` topic
5. `handleWorkflowCompletedHandler` → Subscribes to `workflow-completed` topic
6. `handleWorkflowErrorHandler` → Subscribes to `workflow-errors` topic

**Deployment Model:**
- Each handler becomes a separate Lambda function
- CloudFormation configures event source mapping to Kafka topic
- Consumers run continuously as separate Lambda execution environment

---

### 4. Lambda Functions with Kafka Integration

#### `lambda-with-kafka-integration.js` (500+ lines)
**Purpose:** Updated Lambda functions with Kafka producer calls

**Updated Functions:**

1. **submitUserInfoWithKafka**
   - Accepts user registration data (email, name, DoB, phone)
   - Validates email format
   - Creates user record in DynamoDB
   - **NEW:** Publishes `user-info-submitted` event to Kafka
   - Returns customerId for subsequent operations

2. **processDocumentsWithKafka**
   - Routes documents to AI providers (Textract, Vision, Azure, Custom)
   - Extracts fields with confidence scores
   - Stores results in DynamoDB
   - **NEW:** Publishes `documents-processed` event to Kafka
   - Updates user progress in real-time

3. **performKYCWithKafka**
   - Performs 5-point KYC verification
   - Checks age, name, watchlist, document, address
   - Stores results in DynamoDB
   - **NEW:** Publishes `kyc-verified` event to Kafka
   - Flags for compliance review if needed

4. **generateRecommendationsWithKafka**
   - Builds risk profile from extracted data
   - Scores policies by fit (0-100)
   - Returns top recommendations
   - **NEW:** Publishes `policy-recommended` event to Kafka

5. **submitPolicySelectionWithKafka**
   - Records selected policy
   - Updates application status
   - **NEW:** Publishes `workflow-completed` event to Kafka

**Error Handling:**
- All functions publish `workflow-errors` event on failure
- Error events include stage info and error message
- Consumer processes errors and notifies support team

---

### 5. WebSocket Service

#### `websocket-handlers.js` (300+ lines)
**Purpose:** Lambda handlers for WebSocket connection management

**Handlers:**

1. **connectHandler**
   - Stores connection ID with customerId in DynamoDB
   - Enables targeted messaging to specific customers
   - Sets 24-hour TTL on connections

2. **disconnectHandler**
   - Removes connection ID from DynamoDB
   - Cleans up stale connections

3. **defaultMessageHandler**
   - Echoes messages back to client
   - Serves as default route for custom messages

4. **broadcastEventHandler**
   - Broadcasts events to all connected clients
   - Or sends to specific customer if provided
   - Handles GoneException for closed connections

5. **statusHandler**
   - Returns connection status
   - Shows connection ID and timestamp

---

#### `websocket.service.ts` (300+ lines)
**Purpose:** Angular service for WebSocket integration

**Class: WebSocketService**

Methods:
- `connect(customerId)` - Establish WebSocket connection
- `disconnect()` - Close WebSocket connection
- `send(message)` - Send message to server
- `broadcast(messageType, data)` - Broadcast message
- `getConnectionStatus()` - Get current status
- `isConnected()` - Check if connected

**Observable Streams:**
- `events$` - Observable of incoming events
- `connectionStatus$` - Observable of connection status changes

**Features:**
- Automatic reconnection (5 attempts, 3-second delay)
- Event type handling (USER_INFO_SUBMITTED, DOCUMENTS_PROCESSED, etc.)
- Connection lifecycle management
- Error logging and recovery

**Usage in Components:**
```typescript
constructor(private webSocket: WebSocketService) {}

ngOnInit() {
  this.webSocket.connect(this.customerId).then(() => {
    this.webSocket.events$.subscribe(event => {
      if (event.type === 'DOCUMENTS_PROCESSED') {
        // Update UI with real-time results
      }
    });
  });
}

ngOnDestroy() {
  this.webSocket.disconnect();
}
```

---

## 6. Configuration & Deployment

### `KAFKA_SETUP_GUIDE.md` (500+ lines)
Complete step-by-step guide covering:
- Prerequisites and tools
- MSK cluster deployment
- Kafka topics creation
- Lambda environment configuration
- Event source mapping
- WebSocket configuration
- Testing procedures
- Troubleshooting guide
- Cost optimization

### `FULL_DEPLOYMENT_GUIDE.md` (600+ lines)
Comprehensive deployment guide covering:
- System architecture overview
- Infrastructure deployment (7 phases)
- Application deployment (frontend build)
- Integration testing (4 test scenarios)
- Monitoring and maintenance
- Troubleshooting with solutions
- Rollback procedures
- Performance benchmarks

---

## 🔄 Event Flow Details

### Event 1: User Info Submitted

```
User fills form in Angular UI
  ↓
Angular calls API Gateway (REST)
  ↓
Lambda: submitUserInfoWithKafka
  ├→ Validate input
  ├→ Store in DynamoDB (users table)
  └→ KafkaProducer.publishUserInfoSubmitted()
       ↓
     Kafka Topic: "user-info-submitted"
       ↓
     Consumer Lambda processes event
       ├→ Update DynamoDB
       ├→ Publish SNS notification
       └→ Send WebSocket event
           ↓
         WebSocket receives event
           ↓
         Angular Frontend updates UI in real-time
         (Shows "✓ User Information Confirmed")
```

### Event 2: Documents Processed

```
Documents uploaded and sent to Lambda
  ↓
Lambda: processDocumentsWithKafka
  ├→ Call AI services (Textract, Vision, etc.)
  ├→ Extract and score results
  ├→ Store in DynamoDB (ai-results table)
  └→ KafkaProducer.publishDocumentsProcessed()
       ↓
     Kafka Topic: "documents-processed"
       ↓
     Consumer Lambda
       ├→ Update application status
       ├→ Cache results
       └→ WebSocket: event to frontend
           ↓
         Angular updates Tile 2 with extracted data
```

### Event 3: KYC Verified

```
KYC verification Lambda triggered
  ↓
Lambda: performKYCWithKafka
  ├→ Verify age, name, watchlist, document, address
  ├→ Calculate risk level
  ├→ Store results in DynamoDB (kyc-results table)
  └→ KafkaProducer.publishKYCVerified()
       ↓
     Kafka Topic: "kyc-verified"
       ↓
     Consumer Lambda
       ├→ Update KYC status
       ├→ If review needed: publish SNS to compliance team
       └→ WebSocket: KYC results to frontend
           ↓
         Angular shows KYC status (APPROVED/REVIEW/REJECTED)
```

### Event 4: Policy Recommended

```
Recommendation engine Lambda triggered
  ↓
Lambda: generateRecommendationsWithKafka
  ├→ Build customer risk profile
  ├→ Score policies (0-100 fit score)
  ├→ Store recommendations in DynamoDB
  └→ KafkaProducer.publishPolicyRecommended()
       ↓
     Kafka Topic: "policy-recommended"
       ↓
     Consumer Lambda
       ├→ Cache recommendations
       └→ WebSocket: send top 5 policies to frontend
           ↓
         Angular displays personalized policy options
```

### Event 5: Workflow Completed

```
User selects policy in Angular UI
  ↓
Angular calls API Gateway
  ↓
Lambda: submitPolicySelectionWithKafka
  ├→ Update application with selected policy
  ├→ Mark as complete
  └→ KafkaProducer.publishWorkflowCompleted()
       ↓
     Kafka Topic: "workflow-completed"
       ↓
     Consumer Lambda
       ├→ Archive application
       ├→ Publish SNS: send thank-you email
       └→ WebSocket: completion event to frontend
           ↓
         Angular redirects to thank-you page
         Email sent to customer
```

### Event 6: Workflow Error

```
Any Lambda catches error
  ↓
Catch block calls:
  KafkaProducer.publishError()
       ↓
     Kafka Topic: "workflow-errors"
       ↓
     Consumer Lambda
       ├→ Log error details
       ├→ Publish SNS: alert to support team
       └→ WebSocket: error notification to frontend
           ↓
         Angular shows error message
         Support team receives alert
```

---

## 📊 Event Schema

### Base Event Structure (All Events)

```json
{
  "eventId": "uuid-generated",
  "eventType": "USER_INFO_SUBMITTED|DOCUMENTS_PROCESSED|...",
  "source": "LAMBDA_FUNCTION_NAME",
  "customerId": "uuid",
  "applicationId": "APP-uuid-timestamp",
  "timestamp": "2024-01-15T10:30:45.123Z",
  "data": {}
}
```

### Event Examples

**User Info Submitted Event:**
```json
{
  "eventType": "USER_INFO_SUBMITTED",
  "customerId": "cust-123",
  "data": {
    "email": "user@example.com",
    "firstName": "John",
    "lastName": "Doe",
    "dateOfBirth": "1990-01-01"
  }
}
```

**Documents Processed Event:**
```json
{
  "eventType": "DOCUMENTS_PROCESSED",
  "customerId": "cust-123",
  "applicationId": "APP-cust-123-1705316445",
  "data": {
    "documents": [
      {
        "fileName": "passport.pdf",
        "extractedFields": {...},
        "confidence": 0.95
      }
    ],
    "aiProvider": "AWS_TEXTRACT",
    "processingTime": 2345
  }
}
```

**KYC Verified Event:**
```json
{
  "eventType": "KYC_VERIFIED",
  "customerId": "cust-123",
  "applicationId": "APP-cust-123-1705316445",
  "data": {
    "status": "APPROVED",
    "riskLevel": "LOW",
    "checks": [
      {"checkType": "AGE_VERIFICATION", "passed": true},
      {"checkType": "WATCHLIST_SCREENING", "passed": true}
    ]
  }
}
```

---

## 🔐 Security Features

### Authentication & Authorization

- **Kafka:** SCRAM-SHA-512 authentication
- **WebSocket:** Customer ID in connection parameters
- **Lambda:** IAM roles with least privilege
- **Secrets Manager:** Encrypted credential storage
- **KMS:** Data encryption at rest and in transit

### Data Protection

- **Encryption in Transit:** TLS 1.2+
- **Encryption at Rest:** KMS encryption
- **DynamoDB TTL:** Auto-cleanup of stale connections
- **VPC Security Groups:** Restricted ingress rules

---

## 📈 Kafka Topic Configuration

| Topic | Partitions | Replication | Retention | Use Case |
|-------|-----------|------------|-----------|----------|
| user-info-submitted | 3 | 2 | 7 days | User registration |
| documents-processed | 3 | 2 | 7 days | Document extraction results |
| kyc-verified | 3 | 2 | 7 days | KYC verification results |
| policy-recommended | 3 | 2 | 7 days | Policy recommendations |
| workflow-completed | 3 | 2 | 7 days | Workflow completion |
| workflow-errors | 3 | 2 | 30 days | Error tracking |

---

## 🧪 Testing Checklist

- [ ] MSK cluster healthy and accessible
- [ ] All Kafka topics created
- [ ] WebSocket API Gateway deployed
- [ ] Lambda producer functions connected to Kafka
- [ ] Lambda consumer functions subscribed to topics
- [ ] Events published successfully
- [ ] Consumer processes events
- [ ] DynamoDB updated correctly
- [ ] SNS notifications sent
- [ ] WebSocket events delivered in <100ms
- [ ] Frontend receives real-time updates
- [ ] Error handling works correctly
- [ ] Connection recovery after disconnect
- [ ] Load testing (100+ concurrent users)

---

## 📋 Deployment Steps Summary

1. **Deploy CloudFormation Stack** (MSK + WebSocket)
2. **Extract Configuration** (Brokers, credentials, endpoint)
3. **Package and Deploy Lambda Functions**
4. **Configure Environment Variables**
5. **Create Kafka Topics**
6. **Deploy Consumer Lambdas**
7. **Configure Event Source Mapping**
8. **Deploy Frontend with WebSocket Service**
9. **Run Integration Tests**
10. **Set up Monitoring & Alerts**

---

## 📞 Support & Documentation

- **Kafka Setup:** KAFKA_SETUP_GUIDE.md
- **Full Deployment:** FULL_DEPLOYMENT_GUIDE.md
- **Architecture:** This document
- **AWS MSK Docs:** https://docs.aws.amazon.com/msk/
- **KafkaJS Docs:** https://kafka.js.org/

---

## Version History

- **v1.0** - Initial event-driven architecture with 6 Kafka topics
- **v1.1** - Added WebSocket real-time updates
- **v1.2** - Integrated with existing Lambda functions
- **v1.3** - Complete documentation and deployment guides

**Last Updated:** January 2024
**Status:** Production Ready
