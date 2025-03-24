import { useSearchParams } from 'react-router-dom';

export default function ErrorPage() {
  const [searchParams] = useSearchParams();
  const error = searchParams.get('error');

  return (
    <div className="error-container">
      <h1>Error</h1>
      <div className="error-message">
        {error === 'Configuration' && (
          <p>There is a problem with the server configuration.</p>
        )}
        {error === 'AccessDenied' && (
          <p>You do not have permission to sign in.</p>
        )}
        {error === 'Verification' && (
          <p>The sign in link is no longer valid.</p>
        )}
        {!error && (
          <p>An unknown error occurred.</p>
        )}
      </div>
      <a href="/">Return to home page</a>
    </div>
  );
}
