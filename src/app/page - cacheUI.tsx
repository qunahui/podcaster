'use client';
import { useState, useEffect, useRef } from 'react';
import Hls from 'hls.js';
import { fetchJson } from '@/lib/service';
import { toast } from 'react-toastify';
import { getYoutubeId } from '@/utils/getYoutubeId';

export default function YouTubeTranslatorPage() {
  const [transcript, setTranscript] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [youtubeUrl, setYoutubeUrl] = useState(
    'https://www.youtube.com/watch?v=3ks5wUy7Zlc'
  );
  const [m3u8Url, setM3u8Url] = useState<string>('');

  const audioRef = useRef<HTMLAudioElement | null>(null);

  const handleSubmit = async () => {
    if (!youtubeUrl.trim()) {
      alert('Please enter a valid YouTube URL');
      return;
    }

    try {
      setLoading(true);
      const response = await fetchJson('/api/youtube/process/', {
        method: 'POST',
        body: JSON.stringify({ url: youtubeUrl }),
      });

      if (response) {
        setLoading(false);
        setTranscript((response as any).transcript);
      }
    } catch (error) {
      console.error('Error:', error);
      toast.error('Error: ' + error);
    }
  };

  useEffect(() => {
    if (m3u8Url && audioRef.current) {
      // Check if Hls.js is supported by the browser
      if (Hls.isSupported()) {
        const hls = new Hls();
        hls.loadSource(m3u8Url);
        hls.attachMedia(audioRef.current);

        // Optional: once the manifest is parsed, we can attempt auto-play
        hls.on(Hls.Events.MANIFEST_PARSED, () => {
          audioRef.current
            ?.play()
            .catch((err) => console.log('Autoplay was prevented:', err));
        });

        // Cleanup Hls.js instance when component unmounts or URL changes
        return () => {
          hls.destroy();
        };
      } else if (
        audioRef.current.canPlayType('application/vnd.apple.mpegurl')
      ) {
        // If the browser supports HLS natively (like Safari), just set the src
        audioRef.current.src = m3u8Url;
        audioRef.current.addEventListener('loadedmetadata', () => {
          audioRef.current
            ?.play()
            .catch((err) => console.log('Autoplay was prevented:', err));
        });
      }
    }
  }, [m3u8Url]);

  const skipSeconds = (seconds: number) => {
    if (audioRef.current) {
      audioRef.current.currentTime += seconds;
    }
  };

  return (
    <div className="container mx-auto">
      <h1 className="text-2xl font-bold mb-4">YouTube Translator</h1>

      {/* Input for YouTube URL */}
      <label htmlFor="youtubeUrl" className="block mb-2">
        Enter YouTube URL:
      </label>
      <input
        type="text"
        id="youtubeUrl"
        value={youtubeUrl}
        onChange={(e) => setYoutubeUrl(e.target.value)}
        placeholder="https://www.youtube.com/watch?v=example"
        className="w-full p-2.5 mb-2.5 rounded border border-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500"
      />

      <button
        onClick={handleSubmit}
        className="bg-blue-600 text-white px-5 py-2.5 rounded hover:bg-blue-700 transition-colors cursor-pointer"
        disabled={loading}
      >
        {loading && <span>Loading...</span>}
        {!loading && <span>Translate</span>}
      </button>

      {transcript && <div>{transcript}</div>}

      {/* Render the audio player once we have an m3u8Url */}
      {m3u8Url && (
        <div className="mt-8">
          <h2 className="text-xl font-semibold mb-4">HLS Audio Player</h2>
          <audio ref={audioRef} controls className="w-full mb-4" />

          {/* Example skip buttons */}
          <div className="flex gap-2.5">
            <button
              onClick={() => skipSeconds(-5)}
              className="px-4 py-2 bg-gray-200 rounded hover:bg-gray-300 transition-colors"
            >
              Backward 5s
            </button>
            <button
              onClick={() => skipSeconds(5)}
              className="px-4 py-2 bg-gray-200 rounded hover:bg-gray-300 transition-colors"
            >
              Forward 5s
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
