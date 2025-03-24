import { signIn } from 'next-auth/react';

export default function SignIn() {
  return (
    <div className="signin-container">
      <h1>Sign In</h1>
      <div className="signin-buttons">
        <button onClick={() => signIn('facebook', { callbackUrl: '/' })}>
          Sign in with Facebook
        </button>
        <button onClick={() => signIn('linkedin', { callbackUrl: '/' })}>
          Sign in with LinkedIn
        </button>
      </div>
    </div>
  );
}
