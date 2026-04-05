import React from 'react';

export class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  render() {
    if (this.state.error) {
      return (
        <div style={{
          fontFamily: 'monospace',
          padding: '2rem',
          maxWidth: '700px',
          margin: '4rem auto',
          background: '#fff5f5',
          border: '1px solid #fc8181',
          borderRadius: '8px',
        }}>
          <h2 style={{ color: '#c53030', marginBottom: '1rem' }}>Something went wrong</h2>
          <pre style={{
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-word',
            fontSize: '0.85rem',
            color: '#742a2a',
            background: '#fff',
            padding: '1rem',
            borderRadius: '4px',
            border: '1px solid #fed7d7',
          }}>
            {this.state.error.message}
            {'\n\n'}
            {this.state.error.stack}
          </pre>
          <button
            onClick={() => window.location.reload()}
            style={{
              marginTop: '1rem',
              padding: '0.5rem 1.25rem',
              background: '#c53030',
              color: '#fff',
              border: 'none',
              borderRadius: '6px',
              cursor: 'pointer',
              fontSize: '0.875rem',
            }}
          >
            Reload page
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
