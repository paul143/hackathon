# High-Level Architecture Diagram & Documentation

## Generated Artifacts

Three versions of the architecture diagram have been created:

1. **ARCHITECTURE_DIAGRAM.png** (8.3 KB) - Binary PNG image format
2. **ARCHITECTURE_DIAGRAM.svg** (10.2 KB) - Scalable vector graphics format
3. **ARCHITECTURE_DIAGRAM.html** (10.3 KB) - Interactive HTML view with embedded SVG

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                    FRONTEND LAYER (Angular 16)                  │
│  ┌──────────────┬──────────────┬──────────────┬──────────────┐ │
│  │ Angular 16   │ Login        │ Onboarding   │ Real-time    │ │
│  │ Frontend     │ Component    │ Wizard       │ Updates      │ │
│  └──────────────┴──────────────┴──────────────┴──────────────┘ │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│               API GATEWAY LAYER                                  │
│  ┌──────────────────────────┬──────────────────────────────┐   │
│  │ API Gateway (REST)       │ API Gateway (WebSocket)      │   │
│  │ - User submissions       │ - Real-time connections      │   │
│  │ - Document uploads       │ - Event broadcasting         │   │
│  └──────────────────────────┴──────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│          LAMBDA MICROSERVICES LAYER                              │
│  ┌───────────┬───────────┬───────────┬───────────────┐          │
│  │ Submit    │ Process   │ Perform   │ Generate      │          │
│  │ User Info │ Documents │ KYC       │ Policy Recs   │          │
│  └───────────┴───────────┴───────────┴───────────────┘          │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│         KAFKA PRODUCER LAYER (Non-Blocking)                     │
│  Publishes events to Kafka topics (no blocking on failures)     │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│      AWS MANAGED STREAMING FOR KAFKA (MSK)                      │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │ 3 Brokers | SCRAM-SHA-512 Auth | TLS Encryption        │   │
│  │                                                          │   │
│  │ Topics:                                                  │   │
│  │ • user-info-submitted         (Partition: customerId)   │   │
│  │ • documents-processed         (Partition: customerId)   │   │
│  │ • kyc-verified                (Partition: customerId)   │   │
│  │ • policy-recommended          (Partition: customerId)   │   │
│  │ • workflow-completed          (Partition: customerId)   │   │
│  │ • workflow-errors  (7-day retention, 30-day for errors) │   │
│  └─────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│          KAFKA CONSUMER LAYER (Event Handlers)                  │
│  ┌───────────────┬──────────────────┬──────────────────┐       │
│  │ Event Logger  │ WebSocket        │ SNS Notifier     │       │
│  │ Consumer      │ Broadcaster      │ Consumer         │       │
│  │               │ Consumer         │                  │       │
│  └───────────────┴──────────────────┴──────────────────┘       │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│        DATA & NOTIFICATION SERVICES LAYER                       │
│  ┌──────────────┬────────────────┬──────────────┐              │
│  │ DynamoDB     │ WebSocket API  │ SNS Topics   │              │
│  │ (8 Tables)   │ (Real-time)    │ (Emails)     │              │
│  │              │                │ (Alerts)     │              │
│  └──────────────┴────────────────┴──────────────┘              │
└─────────────────────────────────────────────────────────────────┘
                              ↓ (Real-time)
                        [FRONTEND]
```

## Component Descriptions

### Layer 1: Frontend (Angular 16)
- **Angular 16 Frontend**: Main SPA application
- **Login Component**: User authentication and signup
- **Onboarding Wizard**: Multi-step form for user information
- **Real-time Updates**: Live status notifications via WebSocket

### Layer 2: API Gateways
- **REST API Gateway**: Traditional HTTP endpoints for CRUD operations
- **WebSocket API Gateway**: Bi-directional connection for real-time updates
  - Manages connection lifecycle (connect/disconnect)
  - Broadcasts events to connected clients

### Layer 3: Lambda Microservices
All Lambda functions integrate with Kafka producers to publish events:

1. **Submit User Info** (submit-user-info.js)
   - Validates user registration data
   - Stores in DynamoDB users table
   - Publishes `user-info-submitted` event

2. **Process Documents** (process-documents.js)
   - Calls AWS Textract for document extraction
   - Performs AI analysis on extracted data
   - Publishes `documents-processed` event

3. **Perform KYC** (perform-kyc.js)
   - Runs 5-point identity verification
   - Checks against compliance databases
   - Publishes `kyc-verified` event

4. **Generate Policy Recommendations** (generate-policy-recommendations.js)
   - Builds customer risk profile
   - Scores available policies
   - Publishes `policy-recommended` event

### Layer 4: Kafka Producer
- **Non-blocking message publishing**: Errors logged but don't fail Lambda
- **Automatic retries**: Built-in exponential backoff
- **Connection pooling**: Reuses Kafka connections across invocations

### Layer 5: AWS MSK Cluster
- **High Availability**: 3 brokers across multiple availability zones
- **Security**:
  - SCRAM-SHA-512 authentication (credentials in Secrets Manager)
  - TLS encryption in-transit
  - KMS encryption at-rest
- **Topics** (all with 3 partitions, 2 replication factor):
  - `user-info-submitted`: User registration events
  - `documents-processed`: Document analysis results
  - `kyc-verified`: Identity verification outcomes
  - `policy-recommended`: Policy suggestion events
  - `workflow-completed`: Final selection confirmation
  - `workflow-errors`: All error events (30-day retention)

### Layer 6: Kafka Consumers
Three independent consumer Lambda functions:

1. **Event Logger**
   - Subscribes to all topics
   - Stores complete event history in DynamoDB
   - Enables audit trail and compliance reporting

2. **WebSocket Broadcaster**
   - Subscribes to all event topics
   - Reads connection IDs from DynamoDB
   - Pushes updates to connected clients via API Gateway Management API
   - Handles stale connections gracefully

3. **SNS Notifier**
   - Publishes email notifications (KYC results, policy recommendations)
   - Alerts support team on critical errors
   - Integrates with email service via SNS

### Layer 7: Data & Services
- **DynamoDB**: 8 tables for persistent storage
  - Users, Applications, UserInfo, DynamoDBResults
  - KYCResults, ErrorLog, WebSocketConnections, KafkaEvents
- **WebSocket API**: Real-time bidirectional communication
- **SNS**: Async notification service for emails and alerts

## Event Flow Example

**User submits onboarding form:**

1. Angular frontend sends POST to REST API Gateway
2. Lambda `submit-user-info` receives request
3. Lambda validates and stores in DynamoDB users table
4. Lambda publishes `user-info-submitted` event to Kafka
5. **Parallel processing**:
   - Event Logger Consumer: Stores in kafka-events table
   - WebSocket Consumer: Pushes "User info received" to frontend
   - SNS Consumer: Triggers confirmation email
6. Frontend receives real-time update via WebSocket
7. User sees immediate "Processing..." status

**Total latency**: ~500ms (Kafka publish < 100ms + consumer processing < 400ms)

## Security Features

| Component | Security Measure |
|-----------|------------------|
| API Gateway | API keys, IAM authentication |
| Lambda | IAM roles with least privilege |
| Kafka (MSK) | SCRAM-SHA-512 auth, TLS encryption |
| DynamoDB | KMS encryption, fine-grained IAM |
| WebSocket | Connection token validation |
| Secrets Manager | Kafka credentials stored securely |

## Scalability Characteristics

| Metric | Capacity |
|--------|----------|
| Concurrent WebSocket Connections | 10,000+ |
| Event Throughput | 1,000+ events/sec per topic |
| DynamoDB Partitioning | By customerId (hot partition handling) |
| Lambda Concurrency | Auto-scaling (burst to 1000+) |
| Kafka Retention | 7 days standard, 30 days for errors |

## Monitoring & Logging

- **CloudWatch Logs**: All Lambda functions and consumers
- **CloudWatch Metrics**: Event rates, latencies, error counts
- **DynamoDB Streams**: Optional integration for real-time processing
- **Kafka Metrics**: Broker health, consumer lag
- **X-Ray Tracing**: End-to-end request tracing (optional)

## Deployment Architecture

All components deployed via CloudFormation:
- `cloudformation-template.yaml`: REST APIs, Lambda, DynamoDB (original)
- `cloudformation-msk-websocket.yaml`: MSK, WebSocket API, Kafka consumers

## How to Use This Diagram

1. **PNG Format** (ARCHITECTURE_DIAGRAM.png):
   - Best for presentations, emails, documentation
   - Fixed size, lightweight
   - View with any image viewer

2. **SVG Format** (ARCHITECTURE_DIAGRAM.svg):
   - Best for editing and scaling
   - Open in Inkscape, Adobe Illustrator, or browser
   - Infinitely scalable without quality loss

3. **HTML Format** (ARCHITECTURE_DIAGRAM.html):
   - Best for interactive viewing
   - Open in any web browser
   - No external dependencies needed

---

**Generated**: December 15, 2025
**Format**: 1600×1200 pixels
**Color Scheme**: 
- Blue: Frontend Components
- Orange: APIs & Lambda Functions  
- Purple: Event Streaming (Kafka)
- Green: Storage & Data
- Pink: External Services
