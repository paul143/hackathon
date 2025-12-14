# Backend Integration Guide

## Overview

The OnboardAI backend consists of four AWS Lambda microservices that handle each stage of the insurance onboarding workflow:

1. **submitUserInfo** - Tile 1: User Information Validation
2. **processDocuments** - Tile 2: Multi-Provider AI Document Processing
3. **performKYC** - Tile 4: Identity Verification & Compliance
4. **generatePolicyRecommendations** - Tile 5: AI-Driven Policy Suggestions

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                    Angular Frontend                         │
│         (Tiles 1, 2, 3, 4, 5 - Workflow UI)               │
└────────────────────┬────────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────────┐
│              AWS API Gateway                                │
│         (REST API - CORS Enabled)                          │
└────────┬──────────┬──────────┬──────────┬──────────────────┘
         │          │          │          │
    POST /user  POST /docs  POST /kyc  POST /policy
    submit     process     verify    recommend
         │          │          │          │
         ▼          ▼          ▼          ▼
    ┌────────┬──────────┬─────────┬──────────────┐
    │Lambda 1│ Lambda 2 │Lambda 3 │ Lambda 4     │
    │Submit  │ Process  │   KYC   │ Recommend    │
    └────┬───┴────┬─────┴────┬────┴──────┬───────┘
         │        │          │           │
         └────────┼──────────┼───────────┘
                  │          │
                  ▼          ▼
         ┌─────────────────────────┐
         │   DynamoDB Tables       │
         │  ├─ users               │
         │  ├─ applications        │
         │  ├─ ai-results          │
         │  ├─ kyc-results         │
         │  ├─ recommendations     │
         │  ├─ compliance-flags    │
         │  └─ audit-logs          │
         └──────────┬──────────────┘
                    │
    ┌───────────────┼───────────────┐
    │               │               │
    ▼               ▼               ▼
   S3          Textract         Vision AI
(Documents)   (AWS OCR)       (Google AI)
                              + Azure Forms
                              + Custom Agent
```

## Integration Steps

### Step 1: Setup AWS Credentials

```bash
# Configure AWS CLI
aws configure
# Enter: Access Key ID, Secret Access Key, Region, Output Format
```

### Step 2: Deploy Backend Infrastructure

```bash
# Deploy to development environment
cd backend
npm install
npm run deploy:dev

# Output will show:
# - API Gateway Endpoint: https://xxxxx.execute-api.us-east-1.amazonaws.com/dev
# - S3 Documents Bucket: onboard-ai-documents-xxx-dev
# - DynamoDB Tables: users-dev, applications-dev, etc.
```

### Step 3: Update Frontend Environment Configuration

Update `src/environments/environment.ts`:

```typescript
export const environment = {
  production: false,
  apiUrl: 'https://your-api-gateway-endpoint.execute-api.us-east-1.amazonaws.com/dev'
};
```

### Step 4: Install Backend Service in Angular

The `OnboardAIBackendService` is already created in `src/app/services/onboard-ai-backend.service.ts`

Add to your `app.module.ts`:

```typescript
import { HttpClientModule } from '@angular/common/http';

@NgModule({
  imports: [HttpClientModule],
  // ...
})
export class AppModule { }
```

### Step 5: Integrate with Onboarding Component

Import and inject the service:

```typescript
import { OnboardAIBackendService } from '../services/onboard-ai-backend.service';

export class OnboardingComponent {
  constructor(private backendService: OnboardAIBackendService) {}
  
  // Call backend APIs in your methods
}
```

## API Integration Examples

### Tile 1: Submit User Information

```typescript
// In your onboarding component
async submitUserInfo() {
  const response = await this.backendService.submitUserInfo({
    email: 'user@example.com',
    firstName: 'John',
    lastName: 'Doe',
    dateOfBirth: '1990-01-15',
    phoneNumber: '+1-555-0123'
  }).toPromise();

  // Response includes customerId for next steps
  this.customerId = response.customerId;
}
```

### Tile 2: Process Documents with AI Agent Selection

```typescript
// User selects AI agent from dropdown
selectedAgent = 'AWS_TEXTRACT'; // or GOOGLE_VISION, AZURE_FORM_RECOGNIZER, CUSTOM_AGENT

async submitDocuments(files: File[]) {
  const response = await this.backendService.processDocuments({
    customerId: this.customerId,
    documents: files.map(f => ({
      fileName: f.name,
      type: 'ID_DOCUMENT' // or MEDICAL_RECORD, etc.
    })),
    selectedAgent: this.selectedAgent
  }).toPromise();

  // Response includes:
  // - applicationId
  // - aiResults with extracted data
  // - confidence scores
  this.applicationId = response.applicationId;
}
```

### Tile 4: Perform KYC Verification

```typescript
async performKYC(extractedData: any) {
  const response = await this.backendService.performKYCVerification({
    customerId: this.customerId,
    applicationId: this.applicationId,
    extractedData: {
      name: extractedData.name,
      dateOfBirth: extractedData.dob,
      documentNumber: extractedData.docNum,
      address: extractedData.address
    }
  }).toPromise();

  // Response includes:
  // - kycStatus: 'APPROVED' | 'REQUIRES_REVIEW'
  // - riskLevel: 'LOW' | 'MEDIUM' | 'HIGH'
  // - checks performed (age, watchlist, document, address)
  // - requiresHumanReview flag
}
```

### Tile 5: Generate Policy Recommendations

```typescript
async generateRecommendations(extractedData: any) {
  const response = await this.backendService.getPolicyRecommendations({
    customerId: this.customerId,
    applicationId: this.applicationId,
    extractedData: {
      age: 34,
      healthStatus: 'EXCELLENT',
      occupation: 'ENGINEER',
      smoker: false
    },
    userProfile: {
      dateOfBirth: this.userDob,
      familySize: 3
    }
  }).toPromise();

  // Response includes:
  // - riskProfile
  // - recommendations array with pricing and fit scores
  // - top 5 policies ranked by relevance
  this.policies = response.recommendations;
}
```

## Data Flow Example

### Complete Workflow

```
User fills Tile 1 (Email, Name, DOB)
  │
  ├─> Calls submitUserInfo()
  │   └─> Lambda validates and stores in DynamoDB
  │       └─> Returns customerId
  │
User uploads documents in Tile 2
  │
  ├─> Calls processDocuments()
  │   └─> Lambda calls selected AI provider
  │       ├─ AWS Textract: For IDs, forms
  │       ├─ Google Vision: For handwritten docs
  │       ├─ Azure Forms: For structured forms
  │       └─ Custom Agent: For specialized docs
  │       └─> Returns extracted fields + confidence
  │           └─> Stores in DynamoDB
  │
Tile 3: Review Extracted Data (Optional)
  │
User clicks proceed to Tile 4
  │
  ├─> Calls performKYCVerification()
  │   └─> Lambda checks:
  │       ├─ Age >= 18
  │       ├─ Name consistency
  │       ├─ Watchlist screening
  │       ├─ Document validity
  │       └─ Address verification
  │       └─> Flags if risk detected
  │           └─> Stores in DynamoDB
  │
User proceeds to Tile 5
  │
  ├─> Calls generatePolicyRecommendations()
  │   └─> Lambda builds risk profile
  │       └─> Scores policies based on fit
  │           └─> Adjusts pricing for risk
  │               └─> Returns top 5 recommendations
  │
User selects policy
  │
  └─> Calls submitPolicySelection()
      └─> Lambda creates policy record
          └─> Redirects to thank you page
```

## Error Handling

All Lambda functions return HTTP status codes:

```typescript
// Success responses (200)
{
  success: true,
  data: {...}
}

// Validation errors (400)
{
  error: 'Invalid email format'
}

// Not found errors (404)
{
  error: 'User not found'
}

// Server errors (500)
{
  error: 'Internal server error'
}
```

Handle in your component:

```typescript
try {
  const response = await this.backendService.submitUserInfo(...).toPromise();
  // Handle success
} catch (error: any) {
  if (error.status === 400) {
    // Validation error
  } else if (error.status === 500) {
    // Server error
  }
}
```

## Monitoring & Debugging

### View Lambda Logs

```bash
# Watch real-time logs
aws logs tail /aws/lambda/onboard-ai-submit-user-info-dev --follow

# Get last 100 lines
aws logs tail /aws/lambda/onboard-ai-submit-user-info-dev --max-items 100
```

### Query DynamoDB

```bash
# Get user by email
aws dynamodb get-item \
  --table-name users-dev \
  --key '{"email":{"S":"user@example.com"}}'

# Scan all applications
aws dynamodb scan --table-name applications-dev
```

### Check API Gateway Logs

```bash
# View CloudWatch logs for API Gateway
aws logs tail /aws/apigateway/OnboardAI-dev --follow
```

## Cost Estimation

For 100,000 applications/year:

| Component | Cost |
|-----------|------|
| Lambda (5 invocations × 1GB × 3s) | $0.00025/app |
| DynamoDB (1 write + 5 reads) | $0.000002/app |
| S3 (2MB × 12 months) | $0.00055/app |
| Textract (5 pages avg) | $0.0075/app |
| Vision AI (50% docs) | $0.00075/app |
| Azure Forms (30% docs) | $0.015/app |
| **Total** | **$0.0288/app** |

## Next Steps

1. ✅ Deploy backend infrastructure (`npm run deploy:dev`)
2. ✅ Update environment configuration with API endpoint
3. ✅ Test each endpoint individually using curl or Postman
4. ✅ Integrate with Angular components
5. ✅ Add error handling and user feedback
6. ✅ Test full workflow end-to-end
7. ✅ Deploy to staging environment
8. ✅ Perform load testing
9. ✅ Deploy to production

## Support & Troubleshooting

### Lambda Timeout

If processDocuments Lambda times out:
```yaml
# Increase timeout in CloudFormation template
Timeout: 120  # seconds
MemorySize: 1024  # MB
```

### DynamoDB Throttling

Already configured for on-demand billing:
```yaml
BillingMode: PAY_PER_REQUEST
# Auto-scales as needed, no throttling
```

### CORS Issues

CORS is configured in API Gateway template:
```yaml
CorsConfiguration:
  AllowOrigins: ['*']
  AllowMethods: [GET, POST, PUT, DELETE]
  AllowHeaders: ['*']
```

For production, restrict to your domain:
```yaml
AllowOrigins: ['https://yourdomain.com']
```

---

For detailed API documentation, see `/backend/README.md`
