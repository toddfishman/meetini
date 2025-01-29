import { startAuthentication, startRegistration } from '@simplewebauthn/browser';
import type { 
  PublicKeyCredentialRequestOptionsJSON,
} from '@simplewebauthn/typescript-types';

export async function registerBiometrics(): Promise<boolean> {
  try {
    // Get registration options from server
    const optionsRes = await fetch('/api/auth/webauthn/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    });
    
    if (!optionsRes.ok) {
      throw new Error('Failed to get registration options');
    }

    const options = await optionsRes.json();
    
    // Create credentials
    const attResp = await startRegistration(options);
    
    // Verify registration with server
    const verificationRes = await fetch('/api/auth/webauthn/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(attResp),
    });
    
    if (!verificationRes.ok) {
      throw new Error('Failed to verify registration');
    }

    const verification = await verificationRes.json();
    return verification.verified;
  } catch (error) {
    console.error('Failed to register biometrics:', error);
    return false;
  }
}

export async function handleBiometricAuth(): Promise<{ verified: boolean }> {
  try {
    // First, get the authentication options from the server
    const optionsRes = await fetch('/api/auth/webauthn/options');
    if (!optionsRes.ok) {
      throw new Error('Failed to get authentication options');
    }
    
    const options: PublicKeyCredentialRequestOptionsJSON = await optionsRes.json();
    
    // Ensure options are properly formatted
    if (!options || !options.challenge) {
      throw new Error('Invalid authentication options received');
    }

    // Perform authentication
    const authResp = await startAuthentication({
      optionsJSON: options,
      useBrowserAutofill: false,
    });

    // Verify authentication with server
    const verificationRes = await fetch('/api/auth/webauthn/verify', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(authResp),
    });

    if (!verificationRes.ok) {
      throw new Error('Failed to verify authentication');
    }

    return await verificationRes.json();
  } catch (error) {
    console.error('Biometric authentication failed:', error);
    throw error;
  }
}

export function isBiometricsAvailable(): boolean {
  return typeof window !== 'undefined' && 
         window.PublicKeyCredential !== undefined && 
         typeof window.PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable === 'function';
} 