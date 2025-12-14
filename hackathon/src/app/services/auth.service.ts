import { Injectable } from '@angular/core';

@Injectable({
  providedIn: 'root'
})
export class AuthService {
  private storageKey = 'agentic.authenticated';

  constructor() {
    // Nothing to do here — auth state is read from localStorage on demand
  }

  login(username: string, password: string): boolean {
    if (username === 'admin' && password === 'admin') {
      localStorage.setItem(this.storageKey, 'true');
      return true;
    }
    localStorage.removeItem(this.storageKey);
    return false;
  }

  logout(): void {
    localStorage.removeItem(this.storageKey);
  }

  isAuthenticated(): boolean {
    return localStorage.getItem(this.storageKey) === 'true';
  }
}
