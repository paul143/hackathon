import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';

export interface SubmitUserInfoRequest {
  email: string;
  firstName: string;
  lastName: string;
  dateOfBirth: string;
  phoneNumber: string;
}

export interface SubmitUserInfoResponse {
  success: boolean;
  customerId: string;
  message: string;
  tileProgress: {
    tile1: string;
    tile2: string;
    tile3: string;
    tile4: string;
    tile5: string;
  };
}

export interface Document {
  fileName: string;
  type: string;
}

export interface ProcessDocumentsRequest {
  customerId: string;
  documents: Document[];
  selectedAgent: 'AWS_TEXTRACT' | 'GOOGLE_VISION' | 'AZURE_FORM_RECOGNIZER' | 'CUSTOM_AGENT';
}

export interface AIResult {
  documentName: string;
  agent: string;
  extractedFields: Record<string, any>;
  confidence: number;
  processingTime: string;
}

export interface ProcessDocumentsResponse {
  applicationId: string;
  status: string;
  aiResults: AIResult[];
  confidence: number;
  nextStep: string;
}

export interface KYCVerifyRequest {
  customerId: string;
  applicationId: string;
  extractedData: Record<string, any>;
}

export interface KYCCheck {
  checkType: string;
  passed: boolean;
  details: string;
  confidence?: number;
  riskLevel?: string;
}

export interface KYCVerifyResponse {
  applicationId: string;
  kycStatus: 'APPROVED' | 'REQUIRES_REVIEW';
  riskLevel: 'LOW' | 'MEDIUM' | 'HIGH';
  requiresHumanReview: boolean;
  checks: KYCCheck[];
}

export interface PolicyRecommendation {
  id: string;
  name: string;
  type: string;
  coverage: number;
  basePrice: number;
  adjustedPrice: number;
  fitScore: number;
  features: string[];
}

export interface PolicyRecommendRequest {
  customerId: string;
  applicationId: string;
  extractedData: Record<string, any>;
  userProfile: Record<string, any>;
}

export interface PolicyRecommendResponse {
  applicationId: string;
  riskProfile: Record<string, any>;
  recommendations: PolicyRecommendation[];
  message: string;
}

@Injectable({
  providedIn: 'root'
})
export class OnboardAIBackendService {
  private apiUrl = environment.apiUrl || 'https://api.onboard-ai.com/dev';

  constructor(private http: HttpClient) {}

  /**
   * Submit user information (Tile 1)
   */
  submitUserInfo(request: SubmitUserInfoRequest): Observable<SubmitUserInfoResponse> {
    return this.http.post<SubmitUserInfoResponse>(
      `${this.apiUrl}/api/user/submit`,
      request,
      this.getHttpOptions()
    );
  }

  /**
   * Process documents with selected AI agent (Tile 2)
   */
  processDocuments(request: ProcessDocumentsRequest): Observable<ProcessDocumentsResponse> {
    return this.http.post<ProcessDocumentsResponse>(
      `${this.apiUrl}/api/documents/process`,
      request,
      this.getHttpOptions()
    );
  }

  /**
   * Perform KYC verification (Tile 4)
   */
  performKYCVerification(request: KYCVerifyRequest): Observable<KYCVerifyResponse> {
    return this.http.post<KYCVerifyResponse>(
      `${this.apiUrl}/api/kyc/verify`,
      request,
      this.getHttpOptions()
    );
  }

  /**
   * Generate policy recommendations (Tile 5)
   */
  getPolicyRecommendations(request: PolicyRecommendRequest): Observable<PolicyRecommendResponse> {
    return this.http.post<PolicyRecommendResponse>(
      `${this.apiUrl}/api/policy/recommend`,
      request,
      this.getHttpOptions()
    );
  }

  /**
   * Upload document to S3 (via Lambda)
   */
  uploadDocument(customerId: string, file: File): Observable<any> {
    const formData = new FormData();
    formData.append('customerId', customerId);
    formData.append('file', file);

    return this.http.post(
      `${this.apiUrl}/api/documents/upload`,
      formData
    );
  }

  /**
   * Get user progress
   */
  getUserProgress(customerId: string): Observable<any> {
    return this.http.get(
      `${this.apiUrl}/api/user/${customerId}/progress`,
      this.getHttpOptions()
    );
  }

  /**
   * Get application status
   */
  getApplicationStatus(applicationId: string): Observable<any> {
    return this.http.get(
      `${this.apiUrl}/api/applications/${applicationId}/status`,
      this.getHttpOptions()
    );
  }

  /**
   * Submit policy selection (final step)
   */
  submitPolicySelection(
    customerId: string,
    applicationId: string,
    selectedPolicyId: string
  ): Observable<any> {
    return this.http.post(
      `${this.apiUrl}/api/policy/select`,
      {
        customerId,
        applicationId,
        selectedPolicyId
      },
      this.getHttpOptions()
    );
  }

  /**
   * Helper method to get HTTP options with headers
   */
  private getHttpOptions() {
    return {
      headers: new HttpHeaders({
        'Content-Type': 'application/json',
        'X-API-Version': '1.0'
      })
    };
  }
}
