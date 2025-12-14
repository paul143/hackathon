#!/bin/bash

# OnboardAI Deployment Script
# Deploys both Angular frontend and AWS backend infrastructure

set -e

ENVIRONMENT=$1
REGION=${2:-"us-east-1"}

if [ -z "$ENVIRONMENT" ]; then
  echo "Usage: ./deploy.sh [dev|staging|production] [region]"
  exit 1
fi

echo "=========================================="
echo "OnboardAI Deployment Script"
echo "Environment: $ENVIRONMENT"
echo "Region: $REGION"
echo "=========================================="

# 1. Deploy Backend Infrastructure
echo ""
echo "Step 1: Deploying AWS Infrastructure..."
cd backend
npm install
npm run deploy:${ENVIRONMENT}
cd ..

# 2. Build Angular Frontend
echo ""
echo "Step 2: Building Angular Application..."
npm run build -- --configuration ${ENVIRONMENT}

# 3. Deploy Frontend to S3
echo ""
echo "Step 3: Deploying Frontend to S3..."
BUCKET_NAME="onboard-ai-frontend-${ENVIRONMENT}"
aws s3 sync dist/agentic-ai-onboarding s3://${BUCKET_NAME}/ --delete --region ${REGION}

# 4. Invalidate CloudFront Cache
echo ""
echo "Step 4: Invalidating CloudFront Cache..."
DISTRIBUTION_ID=$(aws cloudfront list-distributions --region ${REGION} --query "Distributions[?Origins[0].DomainName=='${BUCKET_NAME}.s3.amazonaws.com'].Id" --output text)
if [ ! -z "$DISTRIBUTION_ID" ]; then
  aws cloudfront create-invalidation --distribution-id ${DISTRIBUTION_ID} --paths "/*" --region ${REGION}
fi

# 5. Output endpoints
echo ""
echo "=========================================="
echo "Deployment Complete!"
echo "=========================================="
echo "Frontend URL: https://${BUCKET_NAME}.s3.${REGION}.amazonaws.com"
echo "API Endpoint: Check AWS API Gateway console"
echo "=========================================="
