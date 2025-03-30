'use client';
import HLSPlayer from '@/components/HLSPlayer';
import { fetchJson } from '@/lib/service';
import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'react-toastify';

// Segment data structure
interface Segment {
  id: number;
  startTime: number;
  endTime: number;
  transcript: string;
}

export default function YouTubeTranslatorPage() {
  const [transcript, setTranscript] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [youtubeUrl, setYoutubeUrl] = useState(
    'https://www.youtube.com/watch?v=3ks5wUy7Zlc'
  );
  const [processingStatus, setProcessingStatus] = useState<
    'idle' | 'processing' | 'ready' | 'error'
  >('idle');
  const [playlistUrl, setPlaylistUrl] = useState<string>('');
  const [currentSegments, setCurrentSegments] = useState<Segment[]>([]);
  const [progress, setProgress] = useState<{
    processed: number;
    total: number;
  }>({ processed: 0, total: 0 });
  const [currentTime, setCurrentTime] = useState(0);
  const refreshIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const pollingIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const segmentPollingTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const lastCheckTimeRef = useRef<number>(0);
  const [useNativePlayer, setUseNativePlayer] = useState(false);

  // Clean up intervals on unmount
  useEffect(() => {
    return () => {
      if (refreshIntervalRef.current) {
        clearInterval(refreshIntervalRef.current);
      }
      if (pollingIntervalRef.current) {
        clearInterval(pollingIntervalRef.current);
      }
      if (segmentPollingTimeoutRef.current) {
        clearTimeout(segmentPollingTimeoutRef.current);
      }
    };
  }, []);

  // Check for segments and updates the playlist
  const checkForNewSegments = useCallback(async () => {
    if (processingStatus !== 'ready' && processingStatus !== 'processing')
      return;

    try {
      const response = await fetchJson('/api/youtube/segments/available', {
        method: 'POST',
        body: JSON.stringify({
          videoId: youtubeUrl,
          timestamp: currentTime,
        }),
      });

      if (response && response.segments) {
        setCurrentSegments(response.segments);

        // Update progress if we have new information
        if (response.processed !== undefined && response.total !== undefined) {
          setProgress({
            processed: response.processed,
            total: response.total,
          });

          // If all segments are processed, change status to ready
          if (response.processed === response.total && response.total > 0) {
            setProcessingStatus('ready');
          }
        }

        // Check if we need to process more segments
        const upcomingSegments = response.segments.filter(
          (segment: Segment) => segment.endTime > currentTime + 10 // Look ahead 10 seconds
        );

        if (
          upcomingSegments.length === 0 &&
          new Date().getTime() - lastCheckTimeRef.current > 5000
        ) {
          // We need more segments and haven't called recently
          lastCheckTimeRef.current = new Date().getTime();
          processNextSegments();
        }
      }
    } catch (error) {
      console.error('Error checking for segments:', error);
    }
  }, [youtubeUrl, currentTime, processingStatus]);

  // Process next segments
  const processNextSegments = async () => {
    if (processingStatus !== 'ready' && processingStatus !== 'processing')
      return;

    try {
      const response = await fetchJson('/api/youtube/process/next-segments', {
        method: 'POST',
        body: JSON.stringify({
          videoId: youtubeUrl,
          currentTimestamp: currentTime,
          count: 3, // Process 3 segments at a time
        }),
      });

      if (response && response.success) {
        // Update the playlist URL with new timestamp to force refresh
        refreshPlaylist();

        // Update progress
        if (
          response.processedSegments !== undefined &&
          response.totalSegments !== undefined
        ) {
          setProgress({
            processed: response.processedSegments,
            total: response.totalSegments,
          });
        }

        // Update transcript if needed
        if (response.transcript) {
          setTranscript(response.transcript);
        }
      }
    } catch (error) {
      console.error('Error processing next segments:', error);
    }
  };

  // Force refresh the playlist URL
  const refreshPlaylist = useCallback(() => {
    const timestamp = Date.now();
    setPlaylistUrl(
      `/api/youtube/playlist?videoId=${encodeURIComponent(youtubeUrl)}&t=${timestamp}`
    );
  }, [youtubeUrl]);

  // Start polling for segments when processing
  useEffect(() => {
    if (processingStatus === 'processing') {
      if (pollingIntervalRef.current) {
        clearInterval(pollingIntervalRef.current);
      }

      // Poll for segments every 5 seconds while processing
      pollingIntervalRef.current = setInterval(() => {
        checkForNewSegments();
      }, 5000);
    } else if (processingStatus === 'ready') {
      // Stop polling once ready, we'll check based on currentTime instead
      if (pollingIntervalRef.current) {
        clearInterval(pollingIntervalRef.current);
        pollingIntervalRef.current = null;
      }
    }

    return () => {
      if (pollingIntervalRef.current) {
        clearInterval(pollingIntervalRef.current);
      }
    };
  }, [processingStatus, checkForNewSegments]);

  // Setup auto-refresh for playlist to load new segments
  useEffect(() => {
    if (processingStatus === 'ready' || processingStatus === 'processing') {
      // Initial load
      refreshPlaylist();

      // Refresh playlist every 15 seconds while processing
      if (refreshIntervalRef.current) {
        clearInterval(refreshIntervalRef.current);
      }

      refreshIntervalRef.current = setInterval(() => {
        refreshPlaylist();
      }, 15000);
    }

    return () => {
      if (refreshIntervalRef.current) {
        clearInterval(refreshIntervalRef.current);
      }
    };
  }, [processingStatus, refreshPlaylist]);

  // Handle time updates from the player
  const handleTimeUpdate = (time: number) => {
    setCurrentTime(time);

    // Check for new segments when near the end of current segment or every 5 seconds
    const isNearSegmentEnd = currentSegments.some(
      (segment) => time >= segment.endTime - 3 && time <= segment.endTime
    );

    if (
      isNearSegmentEnd ||
      new Date().getTime() - lastCheckTimeRef.current > 5000
    ) {
      // Debounce the check to avoid too many API calls
      if (segmentPollingTimeoutRef.current) {
        clearTimeout(segmentPollingTimeoutRef.current);
      }

      segmentPollingTimeoutRef.current = setTimeout(() => {
        lastCheckTimeRef.current = new Date().getTime();
        checkForNewSegments();
      }, 300);
    }
  };

  // Handle initial submission of YouTube URL
  const handleSubmit = async () => {
    if (!youtubeUrl.trim()) {
      toast.error('Please enter a valid YouTube URL');
      return;
    }

    try {
      setLoading(true);
      setProcessingStatus('processing');
      setTranscript('');
      setCurrentSegments([]);
      setProgress({ processed: 0, total: 0 });

      console.log('Starting video processing for:', youtubeUrl);

      // Start processing the video
      const response = await fetchJson('/api/youtube/process/', {
        method: 'POST',
        body: JSON.stringify({ url: youtubeUrl }),
      });

      console.log('Process API response:', response);

      if (response) {
        setTranscript((response as any).transcript || '');

        // Check if we have any segments processed
        if (
          (response as any).segments &&
          (response as any).segments.length > 0
        ) {
          // Set the playlist URL with a timestamp to prevent caching
          refreshPlaylist();

          // Start checking for segments
          await checkForNewSegments();
        } else {
          // Start a polling loop to wait for first segments
          startInitialSegmentPolling();
        }
      }
    } catch (error) {
      console.error('Error in handleSubmit:', error);
      setProcessingStatus('error');

      // More detailed error reporting
      if (error instanceof Error) {
        toast.error(`Error: ${error.message}`);
      } else if (typeof error === 'object' && error !== null) {
        toast.error(`Error: ${JSON.stringify(error)}`);
      } else {
        toast.error('Unknown error occurred');
      }
    } finally {
      setLoading(false);
    }
  };

  // 2. Add a new function to poll for initial segments
  const startInitialSegmentPolling = () => {
    let attempts = 0;
    const maxAttempts = 10;

    const pollForSegments = async () => {
      attempts++;
      console.log(
        `Polling for initial segments - attempt ${attempts}/${maxAttempts}`
      );

      try {
        const response = await fetchJson('/api/youtube/segments/available', {
          method: 'POST',
          body: JSON.stringify({
            videoId: youtubeUrl,
            timestamp: 0,
          }),
        });

        console.log('Segment polling response:', response);

        if (response && response.segments && response.segments.length > 0) {
          console.log('Initial segments found:', response.segments.length);
          refreshPlaylist();
          setCurrentSegments(response.segments);
          return; // Success, stop polling
        }

        if (attempts < maxAttempts) {
          // Continue polling with exponential backoff
          setTimeout(pollForSegments, 3000 * Math.min(2, attempts / 2));
        } else {
          console.error(
            'Failed to get initial segments after maximum attempts'
          );
          toast.warning(
            'Taking longer than expected to process. Please be patient or try again.'
          );
        }
      } catch (error) {
        console.error('Error polling for segments:', error);
        if (attempts < maxAttempts) {
          setTimeout(pollForSegments, 3000 * Math.min(2, attempts / 2));
        } else {
          setProcessingStatus('error');
          toast.error('Failed to process video segments');
        }
      }
    };

    // Start polling
    pollForSegments();
  };

  // Calculate progress percentage for display
  const progressPercentage =
    progress.total > 0
      ? Math.round((progress.processed / progress.total) * 100)
      : 0;

  return (
    <div className="container mx-auto p-4">
      <h1 className="text-2xl font-bold mb-4">YouTube Audio Translator</h1>

      <div className="mb-4">
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
          disabled={loading}
          className="bg-blue-600 text-white px-5 py-2.5 rounded hover:bg-blue-700 transition-colors disabled:opacity-50"
        >
          {loading ? 'Processing...' : 'Translate'}
        </button>
      </div>

      {(processingStatus === 'processing' || processingStatus === 'ready') && (
        <div className="mb-4 bg-gray-50 p-4 rounded">
          <h2 className="text-lg font-semibold mb-2">Processing Status:</h2>
          <div className="w-full bg-gray-200 rounded-full h-2.5 mb-2">
            <div
              className="bg-blue-600 h-2.5 rounded-full"
              style={{ width: `${progressPercentage}%` }}
            ></div>
          </div>
          <p className="text-sm text-gray-600">
            {progress.processed} of {progress.total} segments processed (
            {progressPercentage}%)
          </p>
        </div>
      )}

      {transcript && (
        <div className="mb-4 p-4 bg-gray-50 rounded">
          <h2 className="text-lg font-semibold mb-2">Vietnamese Transcript:</h2>
          <p className="text-gray-800">{transcript}</p>
        </div>
      )}

      {processingStatus !== 'idle' && (
        <div className="mt-8">
          <h2 className="text-xl font-semibold mb-4">Audio Player</h2>

          {processingStatus === 'processing' && !playlistUrl && (
            <div className="bg-yellow-50 p-4 rounded-lg mb-4">
              <p className="text-yellow-700">
                Processing audio segments... This may take a few minutes. The
                player will appear when the first segments are ready.
              </p>
            </div>
          )}

          {processingStatus === 'error' && (
            <div className="bg-red-50 p-4 rounded-lg mb-4">
              <p className="text-red-700">
                Error loading audio player. Please try again.
              </p>
            </div>
          )}

          {playlistUrl && (
            <div>
              <HLSPlayer
                playlistUrl={playlistUrl}
                onTimeUpdate={handleTimeUpdate}
                onError={(error) => {
                  console.error('Player error details:', {
                    message: error.message,
                    stack: error.stack,
                    name: error.name,
                  });

                  // Try to recover by refreshing the playlist
                  setTimeout(() => {
                    console.log('Attempting to recover by refreshing playlist');
                    refreshPlaylist();
                  }, 2000);

                  toast.error(
                    `Playback error: ${error.message}. Attempting to recover...`
                  );
                }}
                onPlayerReady={() => {
                  // When player is ready, check for segments
                  checkForNewSegments();
                }}
                className="mb-4"
              />
              {playlistUrl && processingStatus === 'error' && (
                <div className="mt-4">
                  <button
                    onClick={() => setUseNativePlayer(true)}
                    className="bg-blue-600 text-white px-4 py-2 rounded"
                  >
                    Try Simple Player Instead
                  </button>

                  {useNativePlayer && (
                    <div className="mt-4">
                      <p className="mb-2 text-sm">
                        Using basic audio player (limited features):
                      </p>
                      <audio
                        src={`/api/youtube/audio-proxy?segmentId=1`}
                        controls
                        className="w-full"
                      />
                    </div>
                  )}
                </div>
              )}
              {processingStatus === 'processing' && (
                <p className="text-sm text-gray-600 mt-2">
                  More segments are being processed in the background and will
                  be added automatically.
                </p>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
