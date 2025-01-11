"use client";
import React, { useState } from 'react';

export default function AudioLengthPage() {
  const [audioUrl, setAudioUrl] = useState(
    'http://podcaster_storage_1.storage.googleapis.com/batch_0.mp3'
  );
  const [duration, setDuration] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleCheckDuration() {
    setDuration(null);
    setError(null);

    try {
      const response = await fetch('/api/youtube/audio-length', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ audioUrl }),
      });

      if (!response.ok) {
        const errData = await response.json();
        throw new Error(errData.error || 'Request failed');
      }

      const data = await response.json();
      setDuration(data.duration);
    } catch (err: any) {
      console.error(err);
      setError(err.message || 'Unknown error occurred');
    }
  }

  return (
    <div style={{ padding: '20px' }}>
      <h1>Check Audio Duration</h1>
      <label htmlFor="audioUrl">Enter Audio URL:</label>
      <input
        id="audioUrl"
        type="text"
        value={audioUrl}
        onChange={e => setAudioUrl(e.target.value)}
        style={{ width: '100%', margin: '10px 0' }}
      />

      <button onClick={handleCheckDuration}>
        Get Duration
      </button>

      {duration !== null && (
        <p style={{ marginTop: '10px' }}>
          Audio duration: <strong>{duration.toFixed(2)} seconds</strong>
        </p>
      )}

      {error && <p style={{ color: 'red' }}>Error: {error}</p>}
    </div>
  );
}
