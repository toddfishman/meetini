import React from 'react';
import { signIn, signOut, useSession } from 'next-auth/react';

interface LoginButtonProps {
  provider: string;
  onClick: () => void;
}

export const LoginButton: React.FC<LoginButtonProps> = ({ provider, onClick }) => {
  return (
    <button
      onClick={onClick}
      className="login-button"
      style={{
        padding: '10px 20px',
        margin: '5px',
        borderRadius: '4px',
        border: '1px solid #ccc',
        backgroundColor: '#fff',
        cursor: 'pointer',
        display: 'flex',
        alignItems: 'center',
        gap: '10px',
        fontSize: '16px'
      }}
    >
      Sign in with {provider}
    </button>
  );
};

export function LoginButtonContainer() {
  const { data: session } = useSession();

  if (session) {
    return (
      <div>
        Signed in as {session.user?.email} <br />
        <LoginButton provider="email" onClick={() => signOut()} />
      </div>
    );
  }
  return (
    <div>
      <LoginButton provider="Facebook" onClick={() => signIn('facebook')} />
      <LoginButton provider="LinkedIn" onClick={() => signIn('linkedin')} />
    </div>
  );
}
