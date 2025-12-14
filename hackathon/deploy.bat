@echo off
REM OnboardAI Deployment Script for Windows
REM Deploys both Angular frontend and AWS backend infrastructure

setlocal enabledelayedexpansion

set ENVIRONMENT=%1
set REGION=%2

if "%REGION%"=="" (
  set REGION=us-east-1
)

if "%ENVIRONMENT%"=="" (
  echo Usage: deploy.bat [dev^|staging^|production] [region]
  exit /b 1
)

echo.
echo ==========================================
echo OnboardAI Deployment Script
echo Environment: %ENVIRONMENT%
echo Region: %REGION%
echo ==========================================
echo.

REM 1. Deploy Backend Infrastructure
echo Step 1: Deploying AWS Infrastructure...
cd backend
call npm install
call npm run deploy:%ENVIRONMENT%
cd ..

REM 2. Build Angular Frontend
echo.
echo Step 2: Building Angular Application...
call npm run build -- --configuration %ENVIRONMENT%

REM 3. Deploy Frontend to S3
echo.
echo Step 3: Deploying Frontend to S3...
set BUCKET_NAME=onboard-ai-frontend-%ENVIRONMENT%
aws s3 sync dist\agentic-ai-onboarding s3://%BUCKET_NAME%/ --delete --region %REGION%

REM 4. Output endpoints
echo.
echo ==========================================
echo Deployment Complete!
echo ==========================================
echo Frontend S3 Bucket: %BUCKET_NAME%
echo API Endpoint: Check AWS API Gateway console
echo ==========================================
echo.

endlocal
