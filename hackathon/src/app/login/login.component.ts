import { Component, OnInit } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { AuthService } from '../services/auth.service';

@Component({
  selector: 'app-login',
  templateUrl: './login.component.html',
  styleUrls: ['./login.component.scss']
})
export class LoginComponent implements OnInit {
  loginForm: FormGroup;
  error = '';

  constructor(private fb: FormBuilder, private auth: AuthService, private router: Router) {
    this.loginForm = this.fb.group({
      username: ['', Validators.required],
      password: ['', Validators.required]
    });
  }

  ngOnInit(): void {}

  submit(): void {
    this.error = '';
    const { username, password } = this.loginForm.value;
    // simple client-side feedback + persist via AuthService
    const ok = this.auth.login(username, password);
    if (ok) {
      // small delay for UX (simulate network)
      setTimeout(() => this.router.navigate(['/onboarding']), 200);
    } else {
      this.error = 'Invalid credentials. Use username: admin and password: admin';
    }
  }

  onSocialClick(provider: string, event?: Event): void {
    event?.preventDefault();
    // Placeholder: replace with actual OAuth/SSO flow
    console.log(`${provider} login placeholder`);
    // Optionally show a UI message to the user in future
  }
}
