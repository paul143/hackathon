import { Component } from '@angular/core';
import { Router } from '@angular/router';
import { AuthService } from './services/auth.service';

interface ChatMessage {
  sender: 'user' | 'bot';
  text: string;
  time: string;
}

@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.scss']
})
export class AppComponent {
  title = 'agentic-ai-onboarding';
  isChatOpen = false;
  chatInput = '';
  chatMessages: ChatMessage[] = [
    {
      sender: 'bot',
      text: 'Hello! 👋 I\'m your AI assistant. I can help you with:\n\n• Understanding the onboarding portal\n• Uploading documents\n• Verification process\n• KYC requirements\n• Policy recommendations\n\nWhat would you like to know?',
      time: this.getCurrentTime()
    }
  ];

  private knowledgeBase = {
    'what is this portal': '📋 This portal is an Agentic AI Onboarding Assistant that automates the entire customer onboarding process.\n\n💡 Suggestion: Start by entering your email in the User Information tile to begin your journey!',
    'how to start': '🚀 Getting Started:\n1. Enter your email in User Information tile\n2. Upload documents (ZIP format only)\n3. Select verification agent\n4. Complete KYC form\n5. Get policy recommendations\n\n💡 Tip: Make sure to have all your documents ready in ZIP format!',
    'document format': '📁 Document Requirements:\n• Format: ZIP files only\n• Multiple files: Allowed\n• File naming: Use clear, descriptive names\n\n💡 Suggestion: Compress all your documents into a single ZIP file for faster upload!',
    'verification agents': '🤖 Available AI Verification Agents:\n• Amazon Textract - Best for forms and tables\n• Google Vision AI - Excellent for image quality\n• Azure Form Recognizer - Great for structured documents\n• Custom Agent - Tailored solution\n\n💡 Recommendation: Choose Amazon Textract for insurance documents!',
    'kyc': '👤 KYC (Know Your Customer):\n• Required for compliance\n• Verifies your identity\n• Protects against fraud\n\n💡 Tip: Have your ID and date of birth ready before filling the form!',
    'processing time': '⏱️ Processing Timeline:\n• User Info: ~5 seconds\n• Document Upload: ~15 seconds\n• Email notification sent upon completion\n\n💡 Suggestion: While processing, you can prepare your KYC information!',
    'help': '🆘 How I Can Help:\n• Portal features & navigation\n• Document upload guidelines\n• Verification agent selection\n• KYC process steps\n• Processing time estimates\n\n💡 Just ask me anything! Try "how to start" or "document format"',
    'logout': '🚪 Logout Process:\n• Click "Logout" button (top-right)\n• Session ends safely\n• Redirected to thank you page\n\n💡 Tip: Make sure to complete your onboarding before logging out!',
    'email notification': '📧 Email Notifications:\n• Sent to your registered email\n• Contains verification status\n• Includes next steps\n\n💡 Suggestion: Check your spam folder if you don\'t receive it within 30 minutes!',
    'tiles': '🎯 Portal Navigation (5 Tiles):\n1. User Information - Enter email\n2. Document Collection - Upload ZIP files\n3. Verification - AI processing status\n4. KYC - Personal details\n5. Policy Recommendation - Get suggestions\n\n💡 Follow the tiles in order for smooth onboarding!'
  };

  constructor(private authService: AuthService, private router: Router) {}

  isAuthenticated(): boolean {
    return this.authService.isAuthenticated();
  }

  getUserName(): string {
    return localStorage.getItem('userName') || '';
  }

  logout(): void {
    this.authService.logout();
    localStorage.removeItem('userName');
    this.router.navigate(['/thank-you']);
  }

  toggleChat(): void {
    this.isChatOpen = !this.isChatOpen;
  }

  sendMessage(): void {
    if (!this.chatInput.trim()) return;

    // Add user message
    this.chatMessages.push({
      sender: 'user',
      text: this.chatInput,
      time: this.getCurrentTime()
    });

    const userQuery = this.chatInput.toLowerCase();
    this.chatInput = '';

    // Simulate bot thinking
    setTimeout(() => {
      const botResponse = this.getBotResponse(userQuery);
      this.chatMessages.push({
        sender: 'bot',
        text: botResponse,
        time: this.getCurrentTime()
      });
    }, 500);
  }

  private getBotResponse(query: string): string {
    // Check knowledge base for matching keywords
    for (const [key, value] of Object.entries(this.knowledgeBase)) {
      if (query.includes(key)) {
        return value;
      }
    }

    // Default responses for common patterns
    if (query.includes('thank')) {
      return '🙏 You\'re welcome! Feel free to ask if you need anything else.\n\n💡 Suggestion: Type "help" to see all available topics!';
    }
    if (query.includes('hi') || query.includes('hello')) {
      return '👋 Hello! How can I assist you with the onboarding portal today?\n\n💡 Quick tips:\n• Type "how to start" for getting started\n• Type "tiles" to understand navigation\n• Type "help" for all options';
    }

    return '🤔 I\'m here to help! Here are some suggestions:\n\n💡 Try asking about:\n• "what is this portal"\n• "how to start"\n• "document format"\n• "verification agents"\n• "kyc"\n• "processing time"\n\nWhat would you like to know?';
  }

  private getCurrentTime(): string {
    const now = new Date();
    return now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
  }
}
