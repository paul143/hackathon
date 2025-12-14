import { Component, OnInit } from '@angular/core';
import { FormBuilder, FormGroup } from '@angular/forms';
import { HttpClient } from '@angular/common/http';

@Component({
  selector: 'app-onboarding',
  templateUrl: './onboarding.component.html',
  styleUrls: ['./onboarding.component.scss']
})
export class OnboardingComponent implements OnInit {
  kycForm: FormGroup;
  userName: string = '';
  isUserInfoSubmitted: boolean = false;
  isDocumentsSubmitted: boolean = false;
  selectedAgent: string = '';
  uploadedFiles: FileList | null = null;
  isProcessingDocuments: boolean = false;
  uploadProgress: number = 0;
  isProcessingUserInfo: boolean = false;
  userInfoProgress: number = 0;
  
  // Validation messages
  userInfoValidationMessage: string = '';
  documentValidationMessage: string = '';
  kycValidationMessage: string = '';
  policyValidationMessage: string = '';

  constructor(private fb: FormBuilder, private http: HttpClient) {
    this.kycForm = this.fb.group({
      name: [''],
      dob: ['']
    });
  }

  ngOnInit(): void {
    this.startOnboardingProcess();
  }

  startOnboardingProcess(): void {
    console.log('Onboarding process started.');
  }

  submitUserInfo(): void {
    if (!this.userName || this.userName.trim() === '') {
      this.userInfoValidationMessage = 'Please enter your email';
      setTimeout(() => {
        this.userInfoValidationMessage = '';
      }, 3000);
      return;
    }
    
    // Email validation regex
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(this.userName)) {
      this.userInfoValidationMessage = 'Please enter a valid email address';
      setTimeout(() => {
        this.userInfoValidationMessage = '';
      }, 3000);
      return;
    }
    
    // Start processing with progress bar
    this.isProcessingUserInfo = true;
    this.userInfoProgress = 0;
    
    // Simulate progress over 5 seconds
    const totalDuration = 5000; // 5 seconds
    const intervalTime = 50; // Update every 50ms
    const increment = (intervalTime / totalDuration) * 100;
    
    const progressInterval = setInterval(() => {
      this.userInfoProgress += increment;
      
      if (this.userInfoProgress >= 100) {
        this.userInfoProgress = 100;
        clearInterval(progressInterval);
        
        // After reaching 100%, mark as submitted
        setTimeout(() => {
          this.isUserInfoSubmitted = true;
          this.isProcessingUserInfo = false;
          this.userInfoValidationMessage = '';
          localStorage.setItem('userName', this.userName);
          console.log('User name submitted:', this.userName);
        }, 500);
      }
    }, intervalTime);
  }

  submitDocuments(): void {
    this.documentValidationMessage = '';
    if (!this.selectedAgent) {
      this.documentValidationMessage = 'Please select a verification agent';
      setTimeout(() => this.documentValidationMessage = '', 3000);
      return;
    }
    if (!this.uploadedFiles || this.uploadedFiles.length === 0) {
      this.documentValidationMessage = 'Please upload at least one document';
      setTimeout(() => this.documentValidationMessage = '', 3000);
      return;
    }
    
    // Start processing with progress bar
    this.isProcessingDocuments = true;
    this.uploadProgress = 0;
    
    // Simulate progress over 15 seconds
    const totalDuration = 15000; // 15 seconds
    const intervalTime = 100; // Update every 100ms
    const increment = (intervalTime / totalDuration) * 100;
    
    const progressInterval = setInterval(() => {
      this.uploadProgress += increment;
      
      if (this.uploadProgress >= 100) {
        this.uploadProgress = 100;
        clearInterval(progressInterval);
        
        // After reaching 100%, mark as submitted
        setTimeout(() => {
          this.isDocumentsSubmitted = true;
          this.isProcessingDocuments = false;
          console.log('Documents submitted for verification with agent:', this.selectedAgent);
        }, 500);
      }
    }, intervalTime);
  }

  onVerificationAgentChange(event: any): void {
    const agent = event.target.value;
    this.selectedAgent = agent;
    console.log('Selected verification agent:', agent);
    // Add logic to configure the selected agent
  }

  handleFileUpload(event: any): void {
    const files = event.target.files;
    
    // Validate that all files are zip format
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      if (!file.name.toLowerCase().endsWith('.zip')) {
        this.documentValidationMessage = 'Only ZIP files are allowed';
        setTimeout(() => {
          this.documentValidationMessage = '';
        }, 3000);
        event.target.value = ''; // Clear the file input
        this.uploadedFiles = null;
        return;
      }
    }
    
    this.uploadedFiles = files;
    console.log('Uploaded files:', files);
    this.verifyDocuments(files);
  }

  verifyDocuments(files: FileList): void {
    // Simulate document verification API call
    console.log('Verifying documents...');
    this.http.post('/api/verify-documents', files).subscribe(response => {
      console.log('Document verification response:', response);
    });
  }

  submitKYC(): void {
    if (this.kycForm.invalid || !this.kycForm.value.name || !this.kycForm.value.dob) {
      this.kycValidationMessage = 'Please fill in all required fields';
      setTimeout(() => {
        this.kycValidationMessage = '';
      }, 3000);
      return;
    }
    this.kycValidationMessage = '';
    console.log('KYC Form Data:', this.kycForm.value);
    this.http.post('/api/submit-kyc', this.kycForm.value).subscribe(
      response => {
        console.log('KYC submission response:', response);
      },
      error => {
        this.kycValidationMessage = 'Error submitting KYC. Please try again.';
        setTimeout(() => {
          this.kycValidationMessage = '';
        }, 3000);
      }
    );
  }

  recommendPolicy(): void {
    if (!this.userName || this.userName.trim() === '') {
      this.policyValidationMessage = 'Please submit user information first';
      setTimeout(() => {
        this.policyValidationMessage = '';
      }, 3000);
      return;
    }
    this.policyValidationMessage = '';
    console.log('Recommending policies based on user data.');
    this.http.get('/api/recommend-policy').subscribe(
      response => {
        console.log('Policy recommendation:', response);
      },
      error => {
        this.policyValidationMessage = 'Error fetching policy recommendations. Please try again.';
        setTimeout(() => {
          this.policyValidationMessage = '';
        }, 3000);
      }
    );
  }

  trackOnboardingProgress(): void {
    console.log('Tracking onboarding progress in real-time.');
    this.http.get('/api/track-progress').subscribe(progress => {
      console.log('Onboarding progress:', progress);
    });
  }
}
