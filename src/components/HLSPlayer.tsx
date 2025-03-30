// src/components/HLSPlayer.tsx
'use client';

import Hls from 'hls.js';
import React, { useEffect, useRef, useState } from 'react';

interface HLSPlayerProps {
  playlistUrl: string;
  onTimeUpdate?: (currentTime: number) => void;
  onPlayerReady?: () => void;
  onError?: (error: Error) => void;
  className?: string;
}

const HLSPlayer: React.FC<HLSPlayerProps> = ({
  playlistUrl,
  onTimeUpdate,
  onPlayerReady,
  onError,
  className = '',
}) => {
  const audioRef = useRef<HTMLAudioElement>(null);
  const hlsRef = useRef<Hls | null>(null);
  const [isReady, setIsReady] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);

  // Setup HLS.js player
  useEffect(() => {
    if (!playlistUrl || !audioRef.current) return;

    // Cleanup existing HLS instance
    if (hlsRef.current) {
      hlsRef.current.destroy();
      hlsRef.current = null;
    }

    const setupHls = async () => {
      try {
        if (Hls.isSupported()) {
          const hls = new Hls({
            debug: false,
            enableWorker: true,
            lowLatencyMode: false,
            backBufferLength: 90,
          });

          hls.loadSource(playlistUrl);
          hls.attachMedia(audioRef.current!);
          hlsRef.current = hls;

          hls.on(Hls.Events.MANIFEST_PARSED, () => {
            console.log('HLS manifest parsed successfully');
            setIsReady(true);
            onPlayerReady?.();
          });

          hls.on(Hls.Events.ERROR, (_, data) => {
            console.error('HLS Error:', data);
            if (data.fatal) {
              switch (data.type) {
                case Hls.ErrorTypes.NETWORK_ERROR:
                  console.log('Fatal network error, attempting recovery...');
                  hls.startLoad();
                  break;
                case Hls.ErrorTypes.MEDIA_ERROR:
                  console.log('Fatal media error, attempting recovery...');
                  hls.recoverMediaError();
                  break;
                default:
                  console.log('Fatal error, cannot recover');
                  hls.destroy();
                  onError?.(new Error(`HLS fatal error: ${data.details}`));
                  break;
              }
            }
          });
        } else if (
          audioRef.current.canPlayType('application/vnd.apple.mpegurl')
        ) {
          // For browsers with native HLS support (Safari)
          audioRef.current.src = playlistUrl;
          audioRef.current.addEventListener('loadedmetadata', () => {
            setIsReady(true);
            onPlayerReady?.();
          });
        } else {
          onError?.(new Error('HLS is not supported in this browser'));
        }
      } catch (error) {
        console.error('Error setting up HLS player:', error);
        onError?.(
          error instanceof Error
            ? error
            : new Error('Unknown error setting up HLS player')
        );
      }
    };

    setupHls();

    // Cleanup function
    return () => {
      if (hlsRef.current) {
        hlsRef.current.destroy();
        hlsRef.current = null;
      }
    };
  }, [playlistUrl]);

  // Handle time update
  const handleTimeUpdate = () => {
    if (audioRef.current) {
      const newTime = audioRef.current.currentTime;
      setCurrentTime(newTime);
      onTimeUpdate?.(newTime);
    }
  };

  // Handle duration change
  const handleDurationChange = () => {
    if (audioRef.current && !isNaN(audioRef.current.duration)) {
      setDuration(audioRef.current.duration);
    }
  };

  // Handle play/pause
  const togglePlayPause = () => {
    if (!audioRef.current || !isReady) return;

    if (isPlaying) {
      audioRef.current.pause();
    } else {
      audioRef.current.play().catch((err) => {
        console.error('Play error:', err);
        onError?.(err);
      });
    }
  };

  // Handle seeking
  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!audioRef.current || !isReady) return;

    const newTime = parseFloat(e.target.value);
    audioRef.current.currentTime = newTime;
    setCurrentTime(newTime);
  };

  // Format time
  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
  };

  // Skip forward/backward
  const skip = (seconds: number) => {
    if (!audioRef.current || !isReady) return;

    const newTime = Math.min(
      Math.max(0, currentTime + seconds),
      duration || Number.MAX_SAFE_INTEGER
    );

    audioRef.current.currentTime = newTime;
    setCurrentTime(newTime);
  };

  return (
    <div className={`hls-player ${className}`}>
      <audio
        ref={audioRef}
        onTimeUpdate={handleTimeUpdate}
        onDurationChange={handleDurationChange}
        onPlay={() => setIsPlaying(true)}
        onPause={() => setIsPlaying(false)}
        onError={(e) => onError?.(new Error('Audio playback error'))}
        style={{ display: 'none' }}
      />

      <div className="controls bg-gray-100 p-4 rounded-lg">
        <div className="flex items-center gap-4 mb-4">
          <button
            onClick={togglePlayPause}
            disabled={!isReady}
            className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 disabled:opacity-50"
          >
            {isPlaying ? 'Pause' : 'Play'}
          </button>

          <div className="time-display text-sm">
            {formatTime(currentTime)} /{' '}
            {duration ? formatTime(duration) : '--:--'}
          </div>
        </div>

        <div className="seek-bar mb-4 w-full">
          <input
            type="range"
            min="0"
            max={duration || 100}
            value={currentTime}
            onChange={handleSeek}
            disabled={!isReady || duration === 0}
            className="w-full"
          />
        </div>

        <div className="flex gap-4 justify-center">
          <button
            onClick={() => skip(-10)}
            disabled={!isReady}
            className="bg-gray-200 px-4 py-2 rounded hover:bg-gray-300 disabled:opacity-50"
          >
            -10s
          </button>
          <button
            onClick={() => skip(10)}
            disabled={!isReady}
            className="bg-gray-200 px-4 py-2 rounded hover:bg-gray-300 disabled:opacity-50"
          >
            +10s
          </button>
        </div>
      </div>
    </div>
  );
};

export default HLSPlayer;
