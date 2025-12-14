// Backend Integration Guide for OnboardAI

import { Component, OnInit } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { OnboardAIBackendService } from '../services/onboard-ai-backend.service';

@Component({
  selector: 'app-onboarding-backend-integration',
  templateUrl: './onboarding.component.html',
  styleUrls: ['./onboarding.component.scss']
})
export class OnboardingBackendIntegrationComponent implements OnInit {
  
  // Form references
  userInfoForm!: FormGroup;
  
  // Backend service tracking
  customerId: string | null = null;
  applicationId: string | null = null;
  
  // UI state
  isUserInfoSubmitted = false;
  isDocumentsSubmitted = false;
  isProcessingUserInfo = false;
  isProcessingDocuments = false;
  userInfoProgress = 0;
  uploadProgress = 0;
  
  selectedAgent: 'AWS_TEXTRACT' | 'GOOGLE_VISION' | 'AZURE_FORM_RECOGNIZER' | 'CUSTOM_AGENT' = 'AWS_TEXTRACT';
  
  constructor(
    private fb: FormBuilder,
    private backendService: OnboardAIBackendService
  ) {
    this.initializeForm();
  }

  ngOnInit(): void {
    // Load persisted data from localStorage
    const persistedCustomerId = localStorage.getItem('customerId');
    if (persistedCustomerId) {
      this.customerId = persistedCustomerId;
    }
  }

  initializeForm(): void {
    this.userInfoForm = this.fb.group({
      email: ['', [Validators.required, this.emailValidator]],
      firstName: ['', [Validators.required, Validators.minLength(2)]],
      lastName: ['', [Validators.required, Validators.minLength(2)]],
      dateOfBirth: ['', Validators.required],
      phoneNumber: ['', [Validators.required, this.phoneValidator]]
    });
  }

  // ============================================
  // TILE 1: Submit User Information
  // ============================================

  /**
   * Submit user information to backend
   * Calls: submitUserInfo Lambda
   */
  async submitUserInfo(): Promise<void> {
    if (!this.userInfoForm.valid) {
      alert('Please fill in all required fields correctly');
      return;
    }

    try {
      this.isProcessingUserInfo = true;
      
      // Simulate progress bar (5 seconds)
      const progressInterval = setInterval(() => {
        if (this.userInfoProgress < 100) {
          this.userInfoProgress += Math.random() * 20;
        }
      }, 50);

      // Call backend API
      const response = await this.backendService.submitUserInfo({
        email: this.userInfoForm.get('email')?.value,
        firstName: this.userInfoForm.get('firstName')?.value,
        lastName: this.userInfoForm.get('lastName')?.value,
        dateOfBirth: this.userInfoForm.get('dateOfBirth')?.value,
        phoneNumber: this.userInfoForm.get('phoneNumber')?.value
      }).toPromise();

      // Stop progress
      clearInterval(progressInterval);
      this.userInfoProgress = 100;

      if (response?.success) {
        // Store customerId for subsequent API calls
        this.customerId = response.customerId;
        localStorage.setItem('customerId', response.customerId);
        localStorage.setItem('userName', response.customerId);
        
        this.isUserInfoSubmitted = true;
        console.log('✓ User info submitted successfully', response);
      }
    } catch (error) {
      console.error('Error submitting user info:', error);
      alert('Failed to submit user information. Please try again.');
    } finally {
      this.isProcessingUserInfo = false;
    }
  }

  // ============================================
  // TILE 2: Process Documents
  // ============================================

  /**
   * Upload and process documents with selected AI agent
   * Calls: processDocuments Lambda
   */
  async submitDocuments(files: File[]): Promise<void> {
    if (!this.customerId) {
      alert('Please complete user information first');
      return;
    }

    if (files.length === 0) {
      alert('Please select at least one document');
      return;
    }

    try {
      this.isProcessingDocuments = true;
      
      // Simulate progress bar (15 seconds)
      const progressInterval = setInterval(() => {
        if (this.uploadProgress < 100) {
          this.uploadProgress += Math.random() * 10;
        }
      }, 100);

      // Prepare documents array
      const documents = files.map(file => ({
        fileName: file.name,
        type: this.detectDocumentType(file.name)
      }));

      // Call backend API
      const response = await this.backendService.processDocuments({
        customerId: this.customerId,
        documents,
        selectedAgent: this.selectedAgent
      }).toPromise();

      // Stop progress
      clearInterval(progressInterval);
      this.uploadProgress = 100;

      if (response) {
        // Store applicationId for subsequent API calls
        this.applicationId = response.applicationId;
        localStorage.setItem('applicationId', response.applicationId);
        
        this.isDocumentsSubmitted = true;
        console.log('✓ Documents processed successfully', response);
        console.log('AI Extraction Results:', response.aiResults);
        console.log('Overall Confidence:', response.confidence);
      }
    } catch (error) {
      console.error('Error processing documents:', error);
      alert('Failed to process documents. Please try again.');
    } finally {
      this.isProcessingDocuments = false;
    }
  }

  // ============================================
  // TILE 4: Perform KYC Verification
  // ============================================

  /**
   * Perform KYC verification (called after Tile 3)
   * Calls: performKYC Lambda
   */
  async performKYCVerification(extractedData: any): Promise<void> {
    if (!this.customerId || !this.applicationId) {
      alert('Missing required data. Please complete previous tiles.');
      return;
    }

    try {
      console.log('Starting KYC verification...');
      
      const response = await this.backendService.performKYCVerification({
        customerId: this.customerId,
        applicationId: this.applicationId,
        extractedData
      }).toPromise();

      if (response) {
        console.log('✓ KYC Verification Complete', response);
        console.log('KYC Status:', response.kycStatus);
        console.log('Risk Level:', response.riskLevel);
        console.log('Requires Human Review:', response.requiresHumanReview);
        
        // Display verification results to user
        this.displayKYCResults(response);
      }
    } catch (error) {
      console.error('KYC verification error:', error);
      alert('KYC verification failed. Please try again.');
    }
  }

  displayKYCResults(response: any): void {
    let message = `KYC Status: ${response.kycStatus}\n`;
    message += `Risk Level: ${response.riskLevel}\n`;
    message += `Requires Review: ${response.requiresHumanReview ? 'Yes' : 'No'}\n\n`;
    message += 'Checks Performed:\n';
    
    response.checks.forEach((check: any) => {
      message += `- ${check.checkType}: ${check.passed ? '✓ PASSED' : '✗ FAILED'}\n`;
    });
    
    console.log(message);
  }

  // ============================================
  // TILE 5: Generate Policy Recommendations
  // ============================================

  /**
   * Get personalized policy recommendations
   * Calls: generatePolicyRecommendations Lambda
   */
  async generatePolicyRecommendations(extractedData: any): Promise<void> {
    if (!this.customerId || !this.applicationId) {
      alert('Missing required data. Please complete previous tiles.');
      return;
    }

    try {
      console.log('Generating policy recommendations...');
      
      const response = await this.backendService.getPolicyRecommendations({
        customerId: this.customerId,
        applicationId: this.applicationId,
        extractedData,
        userProfile: {
          dateOfBirth: this.userInfoForm.get('dateOfBirth')?.value,
          familySize: 1 // Can be expanded based on extracted data
        }
      }).toPromise();

      if (response) {
        console.log('✓ Policy Recommendations Generated', response);
        console.log('Risk Profile:', response.riskProfile);
        console.log('Recommendations:', response.recommendations);
        
        // Display recommendations to user
        this.displayPolicyRecommendations(response.recommendations);
      }
    } catch (error) {
      console.error('Policy recommendation error:', error);
      alert('Failed to generate recommendations. Please try again.');
    }
  }

  displayPolicyRecommendations(recommendations: any[]): void {
    console.log('Top Policy Recommendations:\n');
    recommendations.slice(0, 5).forEach((rec: any, index: number) => {
      console.log(`${index + 1}. ${rec.name}`);
      console.log(`   Type: ${rec.type}`);
      console.log(`   Coverage: $${rec.coverage.toLocaleString()}`);
      console.log(`   Price: $${rec.adjustedPrice}/month`);
      console.log(`   Fit Score: ${rec.fitScore}%`);
      console.log('');
    });
  }

  /**
   * Submit final policy selection
   */
  async submitPolicySelection(selectedPolicyId: string): Promise<void> {
    if (!this.customerId || !this.applicationId) {
      return;
    }

    try {
      const response = await this.backendService.submitPolicySelection(
        this.customerId,
        this.applicationId,
        selectedPolicyId
      ).toPromise();

      console.log('✓ Policy selected successfully', response);
      // Redirect to Thank You page
      // this.router.navigate(['/thank-you']);
    } catch (error) {
      console.error('Policy selection error:', error);
      alert('Failed to select policy. Please try again.');
    }
  }

  // ============================================
  // Helper Methods
  // ============================================

  /**
   * Email validation regex
   */
  emailValidator(control: any) {
    const email = control.value;
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email) ? null : { invalidEmail: true };
  }

  /**
   * Phone validation regex
   */
  phoneValidator(control: any) {
    const phone = control.value;
    const phoneRegex = /^[\d\s\-\+\(\)]{10,}$/;
    return phoneRegex.test(phone) ? null : { invalidPhone: true };
  }

  /**
   * Detect document type from filename
   */
  detectDocumentType(fileName: string): string {
    const lowerName = fileName.toLowerCase();
    
    if (lowerName.includes('license') || lowerName.includes('id')) {
      return 'ID_DOCUMENT';
    } else if (lowerName.includes('passport')) {
      return 'PASSPORT';
    } else if (lowerName.includes('medical') || lowerName.includes('health')) {
      return 'MEDICAL_RECORD';
    } else if (lowerName.includes('w2') || lowerName.includes('form1099')) {
      return 'TAX_DOCUMENT';
    } else if (lowerName.includes('paystub') || lowerName.includes('payslip')) {
      return 'INCOME_DOCUMENT';
    } else if (lowerName.includes('address') || lowerName.includes('utility')) {
      return 'ADDRESS_PROOF';
    }
    
    return 'OTHER_DOCUMENT';
  }

  /**
   * Get application status
   */
  async checkApplicationStatus(): Promise<void> {
    if (!this.applicationId) {
      return;
    }

    try {
      const status = await this.backendService.getApplicationStatus(
        this.applicationId
      ).toPromise();

      console.log('Application Status:', status);
    } catch (error) {
      console.error('Error checking application status:', error);
    }
  }

  /**
   * Get user progress
   */
  async checkUserProgress(): Promise<void> {
    if (!this.customerId) {
      return;
    }

    try {
      const progress = await this.backendService.getUserProgress(
        this.customerId
      ).toPromise();

      console.log('User Progress:', progress);
    } catch (error) {
      console.error('Error checking user progress:', error);
    }
  }
}

/**
 * Usage in Template:
 * 
 * <!-- Tile 1: User Info -->
 * <button (click)="submitUserInfo()" [disabled]="!userInfoForm.valid">
 *   Submit & Continue (Calls Lambda)
 * </button>
 * 
 * <!-- Tile 2: Documents -->
 * <select [(ngModel)]="selectedAgent">
 *   <option value="AWS_TEXTRACT">AWS Textract (Best for IDs)</option>
 *   <option value="GOOGLE_VISION">Google Vision (Best for Handwritten)</option>
 *   <option value="AZURE_FORM_RECOGNIZER">Azure Forms (Best for Forms)</option>
 *   <option value="CUSTOM_AGENT">Custom Agent (Specialized)</option>
 * </select>
 * <button (click)="submitDocuments(uploadedFiles)">
 *   Process Documents (Calls Lambda)
 * </button>
 * 
 * <!-- Tile 4: KYC -->
 * <button (click)="performKYCVerification(extractedData)">
 *   Verify Identity (Calls Lambda)
 * </button>
 * 
 * <!-- Tile 5: Policy Recommendations -->
 * <button (click)="generatePolicyRecommendations(extractedData)">
 *   Get Recommendations (Calls Lambda)
 * </button>
 */
