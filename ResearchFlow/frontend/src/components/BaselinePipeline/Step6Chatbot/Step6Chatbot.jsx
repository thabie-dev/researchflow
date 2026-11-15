import React from 'react';

export default function Step6Chatbot({ status }) {
  return (
    <div>
      <h3 style={{ margin: '0 0 0.5rem 0', color: 'var(--primary)' }}>Chatbot Interaction</h3>
      <p style={{ fontSize: '0.85rem', color: 'var(--muted)', margin: '0 0 1.5rem 0' }}>Interact with your generated corpus</p>
      
      <div className="assistant-result" style={{ textAlign: 'center', borderLeftColor: 'var(--secondary)' }}>
        <h3 style={{ marginBottom: '8px' }}>Chat with your Corpus</h3>
        <div style={{ display: 'flex', gap: '10px', maxWidth: '500px', margin: '0 auto' }}>
          <input placeholder="Ask a question about the corpus..." disabled={status === 'Locked'} style={{ flex: 1 }} />
          <button className="primary" disabled={status === 'Locked'}>Ask Model</button>
        </div>
      </div>
    </div>
  );
}