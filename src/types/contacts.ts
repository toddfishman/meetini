export interface Contact {
  name: string;
  email: string;
  source: 'email' | 'phone' | 'linkedin' | 'facebook';
  confidence: number;
  lastContact?: string;
  reason?: string;
}
