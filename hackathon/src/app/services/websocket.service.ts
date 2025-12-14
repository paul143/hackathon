/**
 * WebSocket Service for Real-Time Updates
 * Handles WebSocket connection and subscribes to Kafka events
 */

import { Injectable } from '@angular/core';
import { Subject, Observable } from 'rxjs';

export interface WebSocketEvent {
  type: string;
  data: any;
  timestamp: string;
}

export interface ConnectionStatus {
  connected: boolean;
  connectionId?: string;
  connectedAt?: string;
}

@Injectable({
  providedIn: 'root'
})
export class WebSocketService {
  private websocket: WebSocket | null = null;
  private eventSubject = new Subject<WebSocketEvent>();
  private connectionStatusSubject = new Subject<ConnectionStatus>();
  private customerId: string = '';
  private wsEndpoint: string = '';
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private reconnectDelay = 3000; // 3 seconds

  public events$: Observable<WebSocketEvent> = this.eventSubject.asObservable();
  public connectionStatus$: Observable<ConnectionStatus> = 
    this.connectionStatusSubject.asObservable();

  constructor() {
    // Initialize WebSocket endpoint from environment
    this.wsEndpoint = this.getWebSocketEndpoint();
  }

  /**
   * Connect to WebSocket server
   */
  public connect(customerId: string): Promise<void> {
    return new Promise((resolve, reject) => {
      this.customerId = customerId;
      const connectionUrl = `${this.wsEndpoint}?customerId=${customerId}`;

      try {
        this.websocket = new WebSocket(connectionUrl);

        this.websocket.onopen = () => {
          console.log('✓ WebSocket connected for customerId:', customerId);
          this.reconnectAttempts = 0;
          this.connectionStatusSubject.next({
            connected: true,
            connectionId: undefined
          });
          resolve();
        };

        this.websocket.onmessage = (event) => {
          this.handleMessage(event.data);
        };

        this.websocket.onerror = (error) => {
          console.error('WebSocket error:', error);
          this.connectionStatusSubject.next({ connected: false });
          reject(error);
        };

        this.websocket.onclose = () => {
          console.warn('WebSocket disconnected');
          this.connectionStatusSubject.next({ connected: false });
          this.attemptReconnect();
        };
      } catch (error) {
        reject(error);
      }
    });
  }

  /**
   * Disconnect from WebSocket
   */
  public disconnect(): void {
    if (this.websocket) {
      this.websocket.close();
      this.websocket = null;
    }
  }

  /**
   * Send a message through WebSocket
   */
  public send(message: any): void {
    if (this.websocket && this.websocket.readyState === WebSocket.OPEN) {
      this.websocket.send(JSON.stringify(message));
    } else {
      console.warn('WebSocket is not connected');
    }
  }

  /**
   * Broadcast a custom message
   */
  public broadcast(messageType: string, data: any): void {
    this.send({
      action: 'broadcast',
      messageType,
      data
    });
  }

  /**
   * Get connection status
   */
  public getConnectionStatus(): ConnectionStatus {
    return {
      connected: this.websocket?.readyState === WebSocket.OPEN,
      connectionId: undefined
    };
  }

  /**
   * Check if connected
   */
  public isConnected(): boolean {
    return this.websocket?.readyState === WebSocket.OPEN;
  }

  // ============================================
  // Private Methods
  // ============================================

  private handleMessage(data: string): void {
    try {
      const message = JSON.parse(data);
      
      console.log('WebSocket message received:', message.type, message);

      // Emit the event
      this.eventSubject.next({
        type: message.type,
        data: message.data || message,
        timestamp: message.timestamp || new Date().toISOString()
      });

      // Handle specific event types
      this.handleEventType(message.type, message);
    } catch (error) {
      console.error('Failed to parse WebSocket message:', error);
    }
  }

  private handleEventType(eventType: string, message: any): void {
    switch (eventType) {
      case 'USER_INFO_SUBMITTED':
        console.log('User info submitted event received');
        break;
      case 'DOCUMENTS_PROCESSED':
        console.log('Documents processed event received');
        break;
      case 'KYC_VERIFIED':
        console.log('KYC verified event received');
        break;
      case 'POLICY_RECOMMENDED':
        console.log('Policy recommendations received');
        break;
      case 'WORKFLOW_COMPLETED':
        console.log('Workflow completed event received');
        break;
      case 'WORKFLOW_ERROR':
        console.error('Workflow error event received:', message.data);
        break;
      case 'ECHO':
        console.log('Echo message:', message.message);
        break;
      default:
        console.log('Unknown event type:', eventType);
    }
  }

  private attemptReconnect(): void {
    if (this.reconnectAttempts < this.maxReconnectAttempts) {
      this.reconnectAttempts++;
      console.log(`Attempting to reconnect (${this.reconnectAttempts}/${this.maxReconnectAttempts})...`);
      
      setTimeout(() => {
        this.connect(this.customerId).catch((error) => {
          console.error('Reconnection failed:', error);
        });
      }, this.reconnectDelay);
    } else {
      console.error('Max reconnection attempts reached');
    }
  }

  private getWebSocketEndpoint(): string {
    // Get from environment or configuration
    const endpoint = (window as any).__WS_ENDPOINT__ || 
                     localStorage.getItem('wsEndpoint') ||
                     'wss://your-websocket-endpoint.execute-api.us-east-1.amazonaws.com/dev';
    return endpoint;
  }
}
