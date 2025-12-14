# OnboardAI - Deployment Checklist & Verification

## ✅ Pre-Deployment Checklist

### Prerequisites Verification
- [ ] AWS Account created with appropriate permissions
- [ ] AWS CLI installed: `aws --version` (should be v2.x)
- [ ] AWS credentials configured: `aws configure`
- [ ] Node.js v18+: `node --version`
- [ ] npm v9+: `npm --version`
- [ ] Git installed: `git --version`
- [ ] Code editor (VS Code) with Angular extensions

### Project Structure Verification
- [ ] `/backend/lambda-functions/` contains 4 .js files:
  - [ ] `submit-user-info.js` (185 lines)
  - [ ] `process-documents.js` (380 lines)
  - [ ] `perform-kyc.js` (390 lines)
  - [ ] `generate-policy-recommendations.js` (420 lines)
- [ ] `/backend/infrastructure/` contains:
  - [ ] `cloudformation-template.yaml` (430 lines)
  - [ ] `package.json`
  - [ ] `README.md`
- [ ] Root directory contains:
  - [ ] `BACKEND_INTEGRATION_GUIDE.md`
  - [ ] `COMPLETE_SETUP_GUIDE.md`
  - [ ] `GENERATED_FILES_SUMMARY.md`
  - [ ] `deploy.sh` (Mac/Linux)
  - [ ] `deploy.bat` (Windows)

### Frontend Verification
- [ ] Angular project builds: `npm run build`
- [ ] Frontend runs: `npm start` (http://localhost:4200)
- [ ] All 5 tiles visible (1-5)
- [ ] Chatbot widget appears

---

## 🚀 Deployment Steps

### Step 1: Prepare Backend (5 minutes)

```bash
# Navigate to backend directory
cd backend

# Install dependencies
npm install

# Verify installation
npm list | head -20
```

**Expected Output:**
```
onboard-ai-backend@1.0.0
├── aws-sdk@2.1450.0
├── uuid@9.0.0
└── [other dependencies]
```

### Step 2: Deploy to AWS (10 minutes)

```bash
# Deploy CloudFormation stack to development environment
npm run deploy:dev

# Command executed:
# aws cloudformation deploy \
#   --template-file infrastructure/cloudformation-template.yaml \
#   --stack-name onboard-ai-dev \
#   --parameter-overrides Environment=dev \
#   --capabilities CAPABILITY_NAMED_IAM
```

**Expected Output:**
```
Waiting for changeset to be created..
Waiting for stack create in progress
Successfully created/updated stack named onboard-ai-dev
```

### Step 3: Verify AWS Resources

```bash
# Check CloudFormation stack
aws cloudformation describe-stacks --stack-name onboard-ai-dev

# List Lambda functions
aws lambda list-functions --query 'Functions[?contains(FunctionName, `onboard-ai`)].FunctionName'

# Expected: 4 Lambda functions
# - onboard-ai-submit-user-info-dev
# - onboard-ai-process-documents-dev
# - onboard-ai-perform-kyc-dev
# - onboard-ai-generate-recommendations-dev

# List DynamoDB tables
aws dynamodb list-tables --query 'TableNames[?contains(@, `dev`)]'

# Expected: 7 tables
# - users-dev
# - applications-dev
# - ai-results-dev
# - kyc-results-dev
# - policy-recommendations-dev
# - compliance-flags-dev
# - audit-logs-dev

# Check S3 bucket
aws s3 ls | grep onboard-ai

# Expected: onboard-ai-documents-{account-id}-dev
```

### Step 4: Get API Gateway Endpoint

```bash
# Get API Gateway endpoint
STACK_NAME="onboard-ai-dev"
API_ENDPOINT=$(aws cloudformation describe-stacks \
  --stack-name $STACK_NAME \
  --query 'Stacks[0].Outputs[?OutputKey==`APIEndpoint`].OutputValue' \
  --output text)

echo $API_ENDPOINT
# Expected: https://xxxxx.execute-api.us-east-1.amazonaws.com/dev
```

### Step 5: Configure Frontend

```bash
# Go back to root directory
cd ..

# Edit src/environments/environment.ts
# Replace: apiUrl: 'http://localhost:3000'
# With: apiUrl: '{YOUR_API_ENDPOINT_FROM_STEP_4}'

# Verify change
cat src/environments/environment.ts | grep apiUrl
```

### Step 6: Test Individual Lambda Functions

```bash
# Test submit-user-info Lambda
aws lambda invoke \
  --function-name onboard-ai-submit-user-info-dev \
  --payload '{
    "body": "{\"email\":\"test@example.com\",\"firstName\":\"John\",\"lastName\":\"Doe\",\"dateOfBirth\":\"1990-01-15\",\"phoneNumber\":\"+1-555-0123\"}"
  }' \
  response.json

# Check response
cat response.json | jq '.'
# Expected: { "statusCode": 200, "body": { "success": true, "customerId": "..." } }
```

### Step 7: Run Development Server

```bash
# Start Angular development server
npm start

# Expected output:
# ✔ Compiled successfully
# Application bundle generated successfully
# http://localhost:4200/
```

### Step 8: End-to-End Testing

Open http://localhost:4200 and test each tile:

#### Tile 1: User Information
```
Test Case 1.1: Valid Email
Input: john@example.com, John, Doe, 1990-01-15, +1-555-0123
Expected: ✓ User info submitted successfully
Backend Call: submitUserInfo Lambda
DynamoDB: users-dev table

Test Case 1.2: Invalid Email
Input: invalid-email, John, Doe, 1990-01-15, +1-555-0123
Expected: ✗ Invalid email format (client-side validation)

Test Case 1.3: Missing Phone
Input: john@example.com, John, Doe, 1990-01-15, (empty)
Expected: ✗ Phone number is required
```

#### Tile 2: Document Upload
```
Test Case 2.1: Valid ZIP Document
Input: drivers-license.zip (valid ZIP with PDF/JPG)
Select Agent: AWS_TEXTRACT
Expected: ✓ Documents processed successfully
Backend Call: processDocuments Lambda
- Routes to AWS Textract
- Extracts fields (name, DOB, etc.)
- Stores in ai-results-dev table
- Returns applicationId

Test Case 2.2: Non-ZIP File
Input: drivers-license.pdf (not ZIP)
Expected: ✗ File must be ZIP format (client-side validation)

Test Case 2.3: Multiple Agents
Test each agent:
- AWS_TEXTRACT: For IDs, forms (fast, 2-5 sec)
- GOOGLE_VISION: For handwritten (slow, 5-8 sec)
- AZURE_FORM_RECOGNIZER: For forms (slow, 7-10 sec)
- CUSTOM_AGENT: For specialized (variable)
```

#### Tile 3: Review Data
```
Test Case 3.1: Verify Extracted Data
Expected: Display extracted fields from Tile 2
- Name: [extracted]
- DOB: [extracted]
- Document Number: [extracted]
- Confidence: [score]
```

#### Tile 4: KYC Verification
```
Test Case 4.1: Automatic KYC Pass
Input: Age 34, no red flags, valid documents
Expected: ✓ KYC APPROVED, Risk Level: LOW
Backend Call: performKYC Lambda
Checks:
  - Age verification: PASSED (34 years)
  - Name consistency: PASSED
  - Watchlist screening: PASSED
  - Document verification: PASSED
  - Address verification: PASSED
DynamoDB: kyc-results-dev table

Test Case 4.2: Manual Review Required
Input: Age 16 (minor), OR suspicious name match
Expected: ⚠ KYC REQUIRES_REVIEW, Risk Level: MEDIUM
DynamoDB: compliance-flags-dev table
```

#### Tile 5: Policy Recommendations
```
Test Case 5.1: Generate Recommendations
Input: Age 34, Excellent health, Engineer, Non-smoker
Expected: ✓ 5 personalized policies displayed
Backend Call: generatePolicyRecommendations Lambda
Results:
  1. Term Life (20Y) - Fit Score: 95%
  2. Health Silver - Fit Score: 88%
  3. [etc.]
DynamoDB: policy-recommendations-dev table
Each policy shows:
  - Name, Type, Coverage amount
  - Base price, Adjusted price (with risk adjustment)
  - Fit score, Features list

Test Case 5.2: Policy Selection
Expected: ✓ Policy selected, redirect to Thank You
```

---

## 🔍 Verification Checklist

### Lambda Function Deployment
```bash
# Verify all 4 Lambda functions exist and are running
for func in submit-user-info process-documents perform-kyc generate-recommendations; do
  STATUS=$(aws lambda get-function \
    --function-name onboard-ai-$func-dev \
    --query 'Configuration.State' --output text)
  echo "$func: $STATUS"
done

# Expected: All show "Active"
```

### DynamoDB Tables
```bash
# Verify all 7 tables are created
aws dynamodb list-tables --query 'TableNames[?contains(@, `-dev`)]' --output text

# Count tables
aws dynamodb list-tables --query 'TableNames[?contains(@, `-dev`)]' --output text | wc -w
# Expected: 7
```

### S3 Bucket
```bash
# Verify S3 bucket exists and has versioning enabled
aws s3api get-bucket-versioning --bucket onboard-ai-documents-{account-id}-dev

# Expected output includes: "Status": "Enabled"
```

### API Gateway
```bash
# Test API endpoint (replace with your endpoint)
curl -X GET https://xxxxx.execute-api.us-east-1.amazonaws.com/dev/api/health

# Expected: Success response or 404 (API exists)
```

### CloudWatch Logs
```bash
# Check Lambda logs
aws logs tail /aws/lambda/onboard-ai-submit-user-info-dev --max-items 10

# Expected: Log entries showing successful invocations
```

---

## 📊 Monitoring & Metrics

### View Lambda Metrics
```bash
# Get invocation count for last hour
aws cloudwatch get-metric-statistics \
  --namespace AWS/Lambda \
  --metric-name Invocations \
  --dimensions Name=FunctionName,Value=onboard-ai-submit-user-info-dev \
  --start-time $(date -u -d '1 hour ago' +%Y-%m-%dT%H:%M:%S) \
  --end-time $(date -u +%Y-%m-%dT%H:%M:%S) \
  --period 3600 \
  --statistics Sum
```

### View DynamoDB Metrics
```bash
# Get consumed write capacity for users table
aws cloudwatch get-metric-statistics \
  --namespace AWS/DynamoDB \
  --metric-name ConsumedWriteCapacityUnits \
  --dimensions Name=TableName,Value=users-dev \
  --start-time $(date -u -d '1 hour ago' +%Y-%m-%dT%H:%M:%S) \
  --end-time $(date -u +%Y-%m-%dT%H:%M:%S) \
  --period 3600 \
  --statistics Sum
```

### View API Gateway Metrics
```bash
# Get API calls count
aws cloudwatch get-metric-statistics \
  --namespace AWS/ApiGateway \
  --metric-name Count \
  --start-time $(date -u -d '1 hour ago' +%Y-%m-%dT%H:%M:%S) \
  --end-time $(date -u +%Y-%m-%dT%H:%M:%S) \
  --period 3600 \
  --statistics Sum
```

---

## 🐛 Troubleshooting

### Issue: CloudFormation Deployment Fails

**Error:** `User: arn:aws:iam::... is not authorized to perform: cloudformation:CreateStack`

**Solution:**
```bash
# Verify IAM permissions
aws iam get-user

# Ensure your IAM user has CloudFormation, Lambda, DynamoDB, S3, IAM permissions
# See AWS documentation for required policies
```

### Issue: Lambda Cannot Access DynamoDB

**Error:** `User: arn:aws:sts::... is not authorized to perform: dynamodb:PutItem`

**Solution:**
```bash
# Verify Lambda execution role has DynamoDB permissions
aws iam get-role-policy \
  --role-name OnboardAI-Lambda-Role-dev \
  --policy-name DynamoDBAccess
```

### Issue: API Gateway CORS Error

**Error:** `Access to XMLHttpRequest blocked by CORS policy`

**Solution:**
```bash
# Verify CORS is enabled in CloudFormation
aws apigateway get-stage \
  --rest-api-id {api-id} \
  --stage-name dev \
  --query 'methodSettings'
```

### Issue: S3 Access Denied

**Error:** `AccessDenied: Access Denied`

**Solution:**
```bash
# Verify Lambda role has S3 permissions
aws iam get-role-policy \
  --role-name OnboardAI-Lambda-Role-dev \
  --policy-name S3Access
```

---

## ✅ Post-Deployment Verification

After successful deployment, verify:

- [ ] All 4 Lambda functions deployed
- [ ] All 7 DynamoDB tables created
- [ ] S3 bucket created with versioning
- [ ] API Gateway endpoint accessible
- [ ] Frontend loads without errors
- [ ] All 5 tiles render correctly
- [ ] Tile 1: User info submission works
- [ ] Tile 2: Document upload works
- [ ] Tile 4: KYC verification works
- [ ] Tile 5: Policy recommendations work
- [ ] CloudWatch logs show successful invocations
- [ ] DynamoDB tables receive data
- [ ] S3 bucket receives document uploads
- [ ] No errors in browser console
- [ ] No errors in CloudWatch logs

---

## 📦 Deployment Environments

### Development (Your Machine + AWS)
```bash
npm run deploy:dev
# Frontend: http://localhost:4200
# Backend: AWS API Gateway dev stage
```

### Staging (AWS Only)
```bash
npm run deploy:staging
# Frontend: S3 staging bucket
# Backend: AWS API Gateway staging stage
```

### Production (AWS Only)
```bash
npm run deploy:prod
# Frontend: CloudFront CDN + S3
# Backend: AWS API Gateway production stage
```

---

## 📝 Sign-Off

**Deployment Completed:** _______________  (Date/Time)
**Deployed By:** _______________  (Name)
**Environment:** Development / Staging / Production
**AWS Account ID:** _______________
**Region:** _______________
**API Endpoint:** _______________
**S3 Bucket:** _______________

---

## 📞 Support

For issues or questions:
1. Check `/BACKEND_INTEGRATION_GUIDE.md`
2. Check `/COMPLETE_SETUP_GUIDE.md`
3. Review Lambda logs: `aws logs tail /aws/lambda/onboard-ai-*-dev --follow`
4. Check DynamoDB tables: `aws dynamodb scan --table-name users-dev`
5. Test API endpoint with curl

---

**Last Updated:** December 15, 2025
**Version:** 1.0.0
**Status:** Ready for Deployment ✅
