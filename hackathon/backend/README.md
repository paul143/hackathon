# OnboardAI Backend

Serverless backend infrastructure for the OnboardAI Insurance Onboarding Platform using AWS Lambda, DynamoDB, and S3.

## Architecture

```
Angular Frontend
      ↓
API Gateway
      ↓
Lambda Microservices
    ├─ submit-user-info.js (Tile 1)
    ├─ process-documents.js (Tile 2 - Multi-provider AI)
    ├─ perform-kyc.js (Tile 4)
    └─ generate-policy-recommendations.js (Tile 5)
      ↓
Data Layer
    ├─ DynamoDB (Users, Applications, AI Results, KYC, Recommendations, Audit Logs)
    └─ S3 (Document Storage)
```

## Project Structure

```
backend/
├── lambda-functions/
│   ├── submit-user-info.js              # User information validation & storage
│   ├── process-documents.js             # Multi-AI document processing orchestration
│   ├── perform-kyc.js                   # KYC verification & compliance checks
│   └── generate-policy-recommendations.js # AI-driven policy recommendations
├── infrastructure/
│   ├── cloudformation-template.yaml     # Infrastructure as Code
│   └── package.json                     # Deployment scripts
└── README.md
```

## Prerequisites

- AWS Account with appropriate permissions
- AWS CLI configured
- Node.js 18.x or higher
- npm

## Installation

```bash
cd backend
npm install
```

## Deployment

### Deploy to Development

```bash
npm run deploy:dev
```

### Deploy to Staging

```bash
npm run deploy:staging
```

### Deploy to Production

```bash
npm run deploy:prod
```

## API Endpoints

### 1. Submit User Information (Tile 1)
**Endpoint:** `POST /api/user/submit`

```bash
curl -X POST https://api-endpoint/dev/api/user/submit \
  -H "Content-Type: application/json" \
  -d '{
    "email": "john@example.com",
    "firstName": "John",
    "lastName": "Doe",
    "dateOfBirth": "1990-01-15",
    "phoneNumber": "+1-555-0123"
  }'
```

**Response:**
```json
{
  "success": true,
  "customerId": "uuid-string",
  "message": "User information submitted successfully",
  "tileProgress": {
    "tile1": "COMPLETED",
    "tile2": "PENDING",
    "tile3": "PENDING",
    "tile4": "PENDING",
    "tile5": "PENDING"
  }
}
```

### 2. Process Documents (Tile 2)
**Endpoint:** `POST /api/documents/process`

```bash
curl -X POST https://api-endpoint/dev/api/documents/process \
  -H "Content-Type: application/json" \
  -d '{
    "customerId": "uuid-string",
    "documents": [
      {
        "fileName": "drivers-license.pdf",
        "type": "ID_DOCUMENT"
      },
      {
        "fileName": "medical-record.pdf",
        "type": "MEDICAL_RECORD"
      }
    ],
    "selectedAgent": "AWS_TEXTRACT"
  }'
```

**Supported Agents:**
- `AWS_TEXTRACT` - Best for printed documents
- `GOOGLE_VISION` - Best for handwritten documents
- `AZURE_FORM_RECOGNIZER` - Best for structured forms
- `CUSTOM_AGENT` - Insurer-specific models

**Response:**
```json
{
  "applicationId": "APP-uuid-timestamp",
  "status": "DOCUMENTS_PROCESSED",
  "aiResults": [
    {
      "documentName": "drivers-license.pdf",
      "agent": "AWS_TEXTRACT",
      "extractedFields": {
        "name": "John Doe",
        "dateOfBirth": "1990-01-15",
        "documentNumber": "D1234567"
      },
      "confidence": 0.987,
      "processingTime": "2024-12-15T10:30:00Z"
    }
  ],
  "confidence": 0.987,
  "nextStep": "VERIFICATION"
}
```

### 3. Perform KYC Verification (Tile 4)
**Endpoint:** `POST /api/kyc/verify`

```bash
curl -X POST https://api-endpoint/dev/api/kyc/verify \
  -H "Content-Type: application/json" \
  -d '{
    "customerId": "uuid-string",
    "applicationId": "APP-uuid-timestamp",
    "extractedData": {
      "name": "John Doe",
      "dateOfBirth": "1990-01-15",
      "documentNumber": "D1234567",
      "address": "123 Main St, Springfield, IL 62701"
    }
  }'
```

**Response:**
```json
{
  "applicationId": "APP-uuid-timestamp",
  "kycStatus": "APPROVED",
  "riskLevel": "LOW",
  "requiresHumanReview": false,
  "checks": [
    {
      "checkType": "AGE_VERIFICATION",
      "passed": true,
      "details": "Age: 34 years",
      "confidence": 0.99
    },
    {
      "checkType": "WATCHLIST_SCREENING",
      "passed": true,
      "details": "No watchlist matches",
      "riskLevel": "LOW"
    },
    {
      "checkType": "DOCUMENT_VERIFICATION",
      "passed": true,
      "details": "Document has required fields: true, Expired: false",
      "confidence": 0.92
    },
    {
      "checkType": "ADDRESS_VERIFICATION",
      "passed": true,
      "details": "Valid address provided"
    }
  ]
}
```

### 4. Generate Policy Recommendations (Tile 5)
**Endpoint:** `POST /api/policy/recommend`

```bash
curl -X POST https://api-endpoint/dev/api/policy/recommend \
  -H "Content-Type: application/json" \
  -d '{
    "customerId": "uuid-string",
    "applicationId": "APP-uuid-timestamp",
    "extractedData": {
      "age": 34,
      "healthStatus": "EXCELLENT",
      "occupation": "SOFTWARE_ENGINEER",
      "smoker": false
    },
    "userProfile": {
      "dateOfBirth": "1990-01-15",
      "familySize": 3
    }
  }'
```

**Response:**
```json
{
  "applicationId": "APP-uuid-timestamp",
  "riskProfile": {
    "age": 34,
    "healthStatus": "EXCELLENT",
    "occupation": "SOFTWARE_ENGINEER",
    "smokerStatus": false,
    "familySize": 3,
    "riskFactors": [],
    "protectionGaps": ["LIFE_INSURANCE", "HEALTH_INSURANCE"]
  },
  "recommendations": [
    {
      "id": "TERM_LIFE_20Y",
      "name": "Term Life Insurance - 20 Year",
      "type": "LIFE",
      "coverage": 500000,
      "basePrice": 25,
      "adjustedPrice": 25.00,
      "fitScore": 95,
      "features": ["Basic coverage", "Renewable"]
    },
    {
      "id": "HEALTH_SILVER",
      "name": "Health - Silver Plan",
      "type": "HEALTH",
      "coverage": 5000,
      "basePrice": 300,
      "adjustedPrice": 270.00,
      "fitScore": 88,
      "features": ["Doctor visits", "Prescription", "Emergency"]
    }
  ],
  "message": "Personalized policy recommendations generated"
}
```

## Environment Variables

Set these in Lambda function configurations:

```
USERS_TABLE=users-{environment}
APPLICATIONS_TABLE=applications-{environment}
AI_RESULTS_TABLE=ai-results-{environment}
KYC_RESULTS_TABLE=kyc-results-{environment}
RECOMMENDATIONS_TABLE=policy-recommendations-{environment}
COMPLIANCE_TABLE=compliance-flags-{environment}
AUDIT_TABLE=audit-logs-{environment}
DOCUMENTS_BUCKET=onboard-ai-documents-{account-id}-{environment}
ENVIRONMENT={dev|staging|production}
```

## Database Schema

### Users Table (Primary Key: email)
```
{
  email: String (PK),
  customerId: String (GSI),
  firstName: String,
  lastName: String,
  dateOfBirth: String,
  phoneNumber: String,
  createdAt: String,
  updatedAt: String,
  status: String,
  tileProgress: {
    tile1: String,
    tile2: String,
    tile3: String,
    tile4: String,
    tile5: String
  }
}
```

### Applications Table (Primary Key: applicationId)
```
{
  applicationId: String (PK),
  customerId: String (GSI),
  selectedAgent: String,
  documents: String[],
  aiResults: Object[],
  createdAt: String,
  status: String,
  overallConfidence: Number
}
```

### Audit Logs Table (Primary Key: customerId + timestamp)
```
{
  customerId: String (PK),
  timestamp: String (SK),
  action: String,
  details: Object,
  agent: String,
  expiresAt: Number (TTL - auto-delete after 7 years)
}
```

## Security

- ✅ All data encrypted in transit (TLS 1.3)
- ✅ All data encrypted at rest (AES-256)
- ✅ IAM role-based access control (least privilege)
- ✅ VPC isolation for sensitive operations
- ✅ CloudTrail logging for audit compliance
- ✅ GDPR-compliant data retention with TTL

## Monitoring

CloudWatch metrics and alarms automatically track:
- Lambda invocation counts and duration
- Error rates and function failures
- DynamoDB read/write throttling
- S3 upload/download activity
- API Gateway latency and status codes

View metrics:
```bash
aws cloudwatch get-metric-statistics \
  --namespace AWS/Lambda \
  --metric-name Duration \
  --dimensions Name=FunctionName,Value=onboard-ai-submit-user-info-dev \
  --start-time 2024-12-15T00:00:00Z \
  --end-time 2024-12-15T23:59:59Z \
  --period 3600 \
  --statistics Average,Maximum,Minimum
```

## Testing

Run unit tests:
```bash
npm test
```

Run integration tests against AWS (requires credentials):
```bash
npm run test:integration
```

## Cost Estimation (100K applications/year)

| Service | Cost |
|---------|------|
| Lambda | $0.00025/app |
| DynamoDB | $0.000002/app |
| S3 | $0.00055/app |
| Textract | $0.0075/app |
| Vision AI | $0.00075/app |
| Azure Forms | $0.015/app |
| **Total Infrastructure** | **$0.0288/app** |
| **+ AI APIs** | **$0.0232/app** |
| **Grand Total** | **$2.19/app** |

## Troubleshooting

### Lambda Timeout
Increase timeout in CloudFormation template to 60 seconds for document processing.

### DynamoDB Throttling
Switch to on-demand billing mode (already configured in template).

### Document Upload Failures
Ensure S3 bucket policy allows Lambda access and files are <10MB.

### KYC Verification Errors
Check that extracted data includes required fields (name, DOB, document number).

## Contributing

1. Create a feature branch
2. Make changes to Lambda functions
3. Run tests: `npm test`
4. Package: `npm run package`
5. Deploy to dev: `npm run deploy:dev`
6. Test in dev environment
7. Create pull request for review
8. Deploy to staging/production after approval

## License

Cognizant Proprietary - AWS Hackathon 2025

## Support

For issues and questions, contact the OnboardAI development team.
