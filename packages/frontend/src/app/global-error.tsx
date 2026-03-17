'use client';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html>
      <body>
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            minHeight: '100vh',
            padding: '1rem',
            fontFamily: 'sans-serif',
          }}
        >
          <h2>Something went wrong</h2>
          <p style={{ color: '#666', fontSize: '0.875rem', marginTop: '0.5rem' }}>
            {error.message || 'An unexpected error occurred.'}
          </p>
          <button
            onClick={reset}
            style={{
              marginTop: '1rem',
              padding: '0.5rem 1rem',
              cursor: 'pointer',
              borderRadius: '0.5rem',
              border: '1px solid #ddd',
              background: '#fff',
            }}
          >
            Try again
          </button>
        </div>
      </body>
    </html>
  );
}
