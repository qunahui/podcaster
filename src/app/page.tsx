'use client';
import { fetchJson } from '@/lib/service';
import Hls from 'hls.js';
import { useEffect, useRef, useState } from 'react';
import { toast } from 'react-toastify';

interface Segment {
  start: number;
  end: number;
}

interface DBSegment {
  startTime: number;
  endTime: number;
  url: string;
}

interface SegmentsResponse {
  segments?: DBSegment[];
  error?: string;
}

interface ProcessNextSegmentsResponse {
  success: boolean;
  message: string;
  processedSegments: number;
  segments: DBSegment[];
  m3u8Content: string;
}

const DEBUG_PREFIX = '🔍 [DEBUG]';

export default function YouTubeTranslatorPage() {
  const [transcript, setTranscript] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [youtubeUrl, setYoutubeUrl] = useState(
    'https://www.youtube.com/watch?v=3ks5wUy7Zlc'
  );
  const [currentTime, setCurrentTime] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [availableSegments, setAvailableSegments] = useState<Segment[]>([]);
  const [isAudioReady, setIsAudioReady] = useState(false);
  const [processingStatus, setProcessingStatus] = useState<
    'idle' | 'processing' | 'ready' | 'error'
  >('idle');
  const [isProcessing, setIsProcessing] = useState(false);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const hlsRef = useRef<Hls | null>(null);
  const lastProcessCallTimeRef = useRef<number>(0);
  const processingTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const PROCESS_INTERVAL = 1000; // 1 second interval
  const PROCESS_COOLDOWN = 1000; // 1 second cooldown

  // Add debug logging for audio ref
  useEffect(() => {
    console.log(`${DEBUG_PREFIX} Audio element reference:`, {
      exists: !!audioRef.current,
      element: audioRef.current,
    });
  }, [audioRef.current]);

  const initializeHls = async () => {
    console.log(`${DEBUG_PREFIX} initializeHls called with:`, {
      url: youtubeUrl,
      audioRef: !!audioRef.current,
      audioElement: audioRef.current,
    });

    if (!youtubeUrl) {
      console.log(`${DEBUG_PREFIX} initializeHls early return - missing URL`);
      return;
    }

    if (!audioRef.current) {
      console.log(
        `${DEBUG_PREFIX} Audio element not initialized, creating new one`
      );
      const audio = new Audio();
      audio.controls = false;
      audioRef.current = audio;
    }

    try {
      // Clean up existing HLS instance
      if (hlsRef.current) {
        console.log(`${DEBUG_PREFIX} Cleaning up existing HLS instance`);
        hlsRef.current.destroy();
        hlsRef.current = null;
      }

      console.log(`${DEBUG_PREFIX} Checking for available segments...`);
      // Check if we have any processed segments first
      const segmentsResponse = (await fetchJson(
        '/api/youtube/segments/available',
        {
          method: 'POST',
          body: JSON.stringify({
            videoId: youtubeUrl,
            timestamp: 0,
          }),
        }
      )) as SegmentsResponse;

      console.log(`${DEBUG_PREFIX} Segments response:`, segmentsResponse);

      if (!segmentsResponse?.segments?.length) {
        console.log(
          `${DEBUG_PREFIX} No segments available, setting status to processing`
        );
        setProcessingStatus('processing');

        // Start polling for segments immediately
        checkAvailableSegments(0);
        return;
      }

      console.log(
        `${DEBUG_PREFIX} Found ${segmentsResponse.segments.length} segments, setting status to ready`
      );
      setProcessingStatus('ready');
      setAvailableSegments(mapSegments(segmentsResponse.segments));

      if (Hls.isSupported()) {
        console.log(`${DEBUG_PREFIX} HLS is supported by browser`);
        // Create a reference to track if this is the initial load
        const initialLoadRef = { value: true };

        const hls = new Hls({
          debug: true,
          enableWorker: true,
          startPosition: 0, // Force start at the beginning of the playlist
          manifestLoadingTimeOut: 10000,
          manifestLoadingMaxRetry: 3,
          manifestLoadingRetryDelay: 500,
          // Add proper seeking capabilities by enabling accurate seeking
          liveSyncDuration: 0,
          liveMaxLatencyDuration: Infinity,
          liveDurationInfinity: true,
          // Enable lowLatency mode to improve seeking
          lowLatencyMode: true,
          xhrSetup: function (xhr, url) {
            console.log(`${DEBUG_PREFIX} XHR Setup for URL:`, url);
            // Allow redirects
            xhr.withCredentials = false;
            // Add additional headers if needed
            xhr.setRequestHeader('Origin', window.location.origin);
            // Log the request
            xhr.addEventListener('load', () => {
              console.log(`${DEBUG_PREFIX} XHR Load:`, {
                url,
                status: xhr.status,
                response: xhr.response,
                headers: xhr.getAllResponseHeaders(),
              });
            });
            // Log errors
            xhr.addEventListener('error', (e) => {
              console.error(`${DEBUG_PREFIX} XHR Error:`, {
                url,
                error: e,
                status: xhr.status,
              });
            });
          },
        });

        // Construct playlist URL
        const playlistUrl = `/api/youtube/playlist?videoId=${encodeURIComponent(youtubeUrl)}&t=${Date.now()}`;
        console.log(`${DEBUG_PREFIX} Loading playlist from:`, playlistUrl);

        // Add more detailed error handling for loadSource
        try {
          console.log(`${DEBUG_PREFIX} Attempting to load source...`);
          hls.loadSource(playlistUrl);
          console.log(`${DEBUG_PREFIX} Source loaded successfully`);
        } catch (loadError) {
          console.error(`${DEBUG_PREFIX} Error loading source:`, loadError);
          throw loadError;
        }

        // Add more detailed error handling for attachMedia
        try {
          console.log(`${DEBUG_PREFIX} Attempting to attach media...`);
          hls.attachMedia(audioRef.current);
          console.log(`${DEBUG_PREFIX} Media attached successfully`);
        } catch (attachError) {
          console.error(`${DEBUG_PREFIX} Error attaching media:`, attachError);
          throw attachError;
        }

        hlsRef.current = hls;

        // Add more specific error handling
        hls.on(Hls.Events.ERROR, (event, data) => {
          console.error(`${DEBUG_PREFIX} HLS Error Event:`, {
            event,
            type: data.type,
            details: data.details,
            fatal: data.fatal,
            response: data.response,
            error: data.error,
            url: data.context?.url,
          });

          if (data.fatal) {
            switch (data.type) {
              case Hls.ErrorTypes.NETWORK_ERROR:
                console.log(
                  `${DEBUG_PREFIX} Fatal network error, attempting recovery...`
                );
                if (data.details === Hls.ErrorDetails.MANIFEST_LOAD_ERROR) {
                  console.log(
                    `${DEBUG_PREFIX} Manifest load error, retrying...`
                  );
                  setTimeout(() => hls.loadSource(playlistUrl), 1000);
                } else {
                  hls.startLoad();
                }
                break;
              case Hls.ErrorTypes.MEDIA_ERROR:
                console.log(
                  `${DEBUG_PREFIX} Fatal media error, attempting recovery...`
                );
                hls.recoverMediaError();
                break;
              default:
                console.log(
                  `${DEBUG_PREFIX} Fatal error, cannot recover:`,
                  data
                );
                hls.destroy();
                setProcessingStatus('error');
                toast.error('Failed to load audio. Please try again.');
                break;
            }
          }
        });

        // Add manifest loaded event to enable seeking
        hls.on(Hls.Events.MANIFEST_LOADED, (event, data) => {
          console.log(`${DEBUG_PREFIX} HLS Event: Manifest loaded`, {
            event,
            data,
            url: data.url,
          });

          // Enable seeking now that we have a manifest
          if (audioRef.current) {
            audioRef.current.seekable = true;
          }
        });

        hls.on(Hls.Events.MANIFEST_PARSED, () => {
          console.log(
            `${DEBUG_PREFIX} HLS Event: Manifest parsed successfully`
          );
          setIsAudioReady(true);

          // Now that the manifest is parsed, mark the audio as ready for seeking
          if (audioRef.current) {
            // Force the audio element to update its duration and seekable range
            setTimeout(() => {
              if (audioRef.current) {
                audioRef.current.currentTime = 0;
              }
            }, 100);
          }
        });

        // Add level loaded handler to better control starting position
        hls.on(Hls.Events.LEVEL_LOADED, (event, data) => {
          console.log(`${DEBUG_PREFIX} Level loaded:`, {
            details: data.details,
            id: data.level,
            startSN: data.details.startSN,
            endSN: data.details.endSN,
          });

          // Force start at the first segment if this is the initial load
          if (initialLoadRef.value && audioRef.current) {
            initialLoadRef.value = false;
            console.log(
              `${DEBUG_PREFIX} Initial load - forcing start position to 0`
            );
            audioRef.current.currentTime = 0;
          }
        });
      } else if (
        audioRef.current.canPlayType('application/vnd.apple.mpegurl')
      ) {
        console.log(`${DEBUG_PREFIX} Using native HLS support (Safari)`);
        const playlistUrl = `/api/youtube/playlist?videoId=${encodeURIComponent(youtubeUrl)}&t=${Date.now()}`;
        audioRef.current.src = playlistUrl;
        setIsAudioReady(true);
      } else {
        console.log(`${DEBUG_PREFIX} HLS not supported by browser`);
        setProcessingStatus('error');
        toast.error('HLS playback is not supported in your browser');
      }
    } catch (error) {
      console.error(`${DEBUG_PREFIX} Error in initializeHls:`, error);
      setProcessingStatus('error');
      toast.error('Failed to initialize audio player');
    }
  };

  const handleSubmit = async () => {
    console.log(`${DEBUG_PREFIX} handleSubmit called with URL:`, youtubeUrl);
    if (!youtubeUrl.trim()) {
      console.log(`${DEBUG_PREFIX} Empty URL provided`);
      toast.error('Please enter a valid YouTube URL');
      return;
    }

    try {
      console.log(`${DEBUG_PREFIX} Starting processing...`);
      setLoading(true);
      setProcessingStatus('processing');
      setIsAudioReady(false);

      console.log(`${DEBUG_PREFIX} Calling process endpoint...`);
      const response = await fetchJson('/api/youtube/process/', {
        method: 'POST',
        body: JSON.stringify({ url: youtubeUrl }),
      });

      console.log(`${DEBUG_PREFIX} Process response:`, response);

      if (response) {
        setTranscript((response as any).transcript);
        console.log(`${DEBUG_PREFIX} Initializing HLS after processing...`);

        // Don't show success toast until segments are actually available
        // Instead, wait for HLS initialization to complete
        await initializeHls();

        // Only show success toast if we have segments ready
        if (processingStatus === 'ready' && availableSegments.length > 0) {
          toast.success('Translation complete and ready to play');
        }
      }
    } catch (error) {
      console.error(`${DEBUG_PREFIX} Error in handleSubmit:`, error);
      setProcessingStatus('error');
      toast.error('Error: ' + error);
    } finally {
      setLoading(false);
    }
  };

  // Helper to convert DB segments to frontend format
  const mapSegments = (segments: DBSegment[]): Segment[] => {
    return segments.map((seg) => ({
      start: seg.startTime,
      end: seg.endTime,
    }));
  };

  // Process next segments with cooldown
  const processNextSegments = async (timestamp: number) => {
    // If already processing, skip
    if (isProcessing) {
      console.log(
        `${DEBUG_PREFIX} Skipping next-segments call, processing in progress`
      );
      return;
    }

    console.log(
      `${DEBUG_PREFIX} Processing next segments at timestamp:`,
      timestamp
    );
    setIsProcessing(true);

    try {
      const processResponse = (await fetchJson(
        '/api/youtube/process/next-segments',
        {
          method: 'POST',
          body: JSON.stringify({
            videoId: youtubeUrl,
            currentTimestamp: timestamp,
            count: 5,
          }),
        }
      )) as ProcessNextSegmentsResponse;

      console.log(
        `${DEBUG_PREFIX} Next segments processing response:`,
        processResponse
      );

      if (processResponse.m3u8Content) {
        console.log(
          `${DEBUG_PREFIX} Received new M3U8 content, updating player...`
        );

        // Create a Blob with the new M3U8 content
        const blob = new Blob([processResponse.m3u8Content], {
          type: 'application/vnd.apple.mpegurl',
        });
        const m3u8Url = URL.createObjectURL(blob);

        // Update HLS player with new M3U8 while preserving playback position
        if (hlsRef.current && audioRef.current) {
          // Store current playback position and state
          const currentTime = audioRef.current.currentTime || 0;
          const wasPlaying = !audioRef.current.paused;

          console.log(`${DEBUG_PREFIX} Loading new M3U8 URL:`, m3u8Url, {
            currentTime,
            wasPlaying,
          });

          // Load the new source
          hlsRef.current.loadSource(m3u8Url);

          // After manifest is parsed, seek to the previous position and restore playback state
          hlsRef.current.once(Hls.Events.MANIFEST_PARSED, () => {
            console.log(
              `${DEBUG_PREFIX} New manifest parsed, restoring position to:`,
              currentTime
            );
            if (audioRef.current) {
              audioRef.current.currentTime = currentTime;

              // Restore playback state if it was playing
              if (wasPlaying) {
                console.log(
                  `${DEBUG_PREFIX} Restoring playback state to playing`
                );
                audioRef.current.play().catch((error) => {
                  console.error(
                    `${DEBUG_PREFIX} Error restoring playback:`,
                    error
                  );
                });
              }
            }
          });

          hlsRef.current.startLoad();
        }

        // Clean up the old URL after a delay
        setTimeout(() => URL.revokeObjectURL(m3u8Url), 1000);
      }

      // Update available segments with the new processed ones
      if (processResponse.segments) {
        setAvailableSegments(mapSegments(processResponse.segments));
      }
    } catch (processError) {
      console.error(
        `${DEBUG_PREFIX} Error processing next segments:`,
        processError
      );
      toast.warning(
        'Failed to load next segments. Playback might be interrupted.'
      );
    } finally {
      // Set up cooldown timer
      processingTimeoutRef.current = setTimeout(() => {
        setIsProcessing(false);
        console.log(`${DEBUG_PREFIX} Processing cooldown complete`);
      }, PROCESS_COOLDOWN);
    }
  };

  // Cleanup processing timeout on unmount or URL change
  useEffect(() => {
    return () => {
      if (processingTimeoutRef.current) {
        clearTimeout(processingTimeoutRef.current);
      }
    };
  }, [youtubeUrl]);

  // Check available segments and reinitialize if needed
  const checkAvailableSegments = async (timestamp: number) => {
    // Prevent excessive API calls by implementing a cooldown
    const now = Date.now();
    if (now - lastProcessCallTimeRef.current < PROCESS_INTERVAL) {
      console.log(`${DEBUG_PREFIX} Skipping segment check due to cooldown`);
      return;
    }

    lastProcessCallTimeRef.current = now;

    try {
      console.log(`${DEBUG_PREFIX} Checking segments at timestamp:`, timestamp);
      const response = (await fetchJson('/api/youtube/segments/available', {
        method: 'POST',
        body: JSON.stringify({
          videoId: youtubeUrl,
          timestamp,
        }),
      })) as SegmentsResponse;

      console.log(`${DEBUG_PREFIX} Available segments response:`, response);

      if (response?.segments) {
        setAvailableSegments(mapSegments(response.segments));

        // Check if we need to process more segments
        // Only process next segments if we're near the end of available content
        const hasUpcomingSegments = response.segments.some(
          (segment) => segment.endTime > timestamp + 5 // Look ahead 5 seconds
        );

        if (!hasUpcomingSegments && !isProcessing) {
          console.log(
            `${DEBUG_PREFIX} No upcoming segments found and not in cooldown, processing next batch...`
          );
          await processNextSegments(timestamp);
        } else if (!hasUpcomingSegments) {
          console.log(
            `${DEBUG_PREFIX} No upcoming segments found but processing is in cooldown`
          );
        }
      }
    } catch (error) {
      console.error(`${DEBUG_PREFIX} Error checking segments:`, error);
    }
  };

  // Poll for segments while processing
  useEffect(() => {
    let pollInterval: NodeJS.Timeout;

    if (processingStatus === 'processing') {
      console.log(`${DEBUG_PREFIX} Starting segment polling...`);
      pollInterval = setInterval(() => {
        console.log(`${DEBUG_PREFIX} Polling for segments...`);
        checkAvailableSegments(0);
      }, 5000); // Poll every 5 seconds
    }

    return () => {
      if (pollInterval) {
        console.log(`${DEBUG_PREFIX} Cleaning up segment polling`);
        clearInterval(pollInterval);
      }
    };
  }, [processingStatus]);

  // Handle time update
  const handleTimeUpdate = () => {
    if (audioRef.current) {
      const newTime = audioRef.current.currentTime;
      setCurrentTime(newTime);

      // Check if we're approaching the end of any available segment (within 2 seconds of end)
      const isNearEndOfSegment = availableSegments.some(
        (segment) => newTime >= segment.end - 2 && newTime <= segment.end
      );

      // Check if we need more segments
      if (isNearEndOfSegment) {
        console.log(
          `${DEBUG_PREFIX} Near end of segment, checking for more segments`
        );
        checkAvailableSegments(newTime);
      }
    }
  };

  // Custom play/pause handler
  const handlePlayPause = () => {
    if (audioRef.current) {
      console.log(
        `${DEBUG_PREFIX} Play/Pause button clicked, current state:`,
        isPlaying
      );

      if (isPlaying) {
        audioRef.current.pause();
        setIsPlaying(false);
      } else {
        // First update state, then play to avoid race conditions
        setIsPlaying(true);

        // Use setTimeout to ensure state update completes before playing
        setTimeout(() => {
          audioRef.current?.play().catch((error) => {
            console.error(`${DEBUG_PREFIX} Playback failed:`, error);
            toast.error('Playback failed. Please try again.');
            setIsPlaying(false);
          });
        }, 50);
      }
    }
  };

  // Custom seek handler
  const skipSeconds = (seconds: number) => {
    if (audioRef.current) {
      const newTime = currentTime + seconds;
      seekToPosition(newTime);
    }
  };

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (hlsRef.current) {
        hlsRef.current.destroy();
      }
    };
  }, []);

  // Add these functions to your component

  // Calculate the total duration based on available segments
  const getMaxDuration = (): number => {
    if (!availableSegments.length) return 0;

    // Find the segment with the latest end time
    const lastSegment = availableSegments.reduce((latest, current) => {
      return current.end > latest.end ? current : latest;
    }, availableSegments[0]);

    return lastSegment.end;
  };

  // Handle direct seeking via range input
  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newTime = parseFloat(e.target.value);
    seekToPosition(newTime);
  };

  // Centralized seek function used by both range slider and skip buttons
  const seekToPosition = (newTime: number) => {
    if (!audioRef.current || !isAudioReady) return;

    console.log(`${DEBUG_PREFIX} Attempting to seek to position:`, newTime);

    // Check if seeking is within available segments
    const isAvailable = availableSegments.some(
      (segment) => newTime >= segment.start && newTime <= segment.end
    );

    if (isAvailable) {
      try {
        // Set seeking state for the UI
        setCurrentTime(newTime);

        // Apply the new time to the audio element
        audioRef.current.currentTime = newTime;

        console.log(`${DEBUG_PREFIX} Successfully seeked to:`, newTime);

        // If HLS instance exists, manually seek there too to ensure sync
        if (hlsRef.current) {
          hlsRef.current.trigger(Hls.Events.SEEKING, { targetTime: newTime });
        }
      } catch (error) {
        console.error(`${DEBUG_PREFIX} Error seeking to position:`, error);
        toast.error('Error while seeking. Please try again.');
      }
    } else {
      toast.warning('Cannot seek to that position - segment not available yet');
    }
  };

  return (
    <div className="container mx-auto p-4">
      {/* Hidden native audio element - Move it to top level */}
      <audio
        ref={audioRef}
        onTimeUpdate={handleTimeUpdate}
        onPlay={() => {
          console.log(`${DEBUG_PREFIX} Audio play event triggered`);
          setIsPlaying(true);
        }}
        onPause={() => {
          console.log(`${DEBUG_PREFIX} Audio pause event triggered`);
          setIsPlaying(false);
        }}
        onSeeking={() => {
          console.log(`${DEBUG_PREFIX} Audio seeking event triggered`);
        }}
        onSeeked={() => {
          console.log(`${DEBUG_PREFIX} Audio seeked event triggered`);
          // After seeking completes, ensure we can play from this point
          if (isPlaying && audioRef.current && audioRef.current.paused) {
            audioRef.current.play().catch((err) => {
              console.error(
                `${DEBUG_PREFIX} Failed to resume after seek:`,
                err
              );
            });
          }
        }}
        onCanPlay={() => {
          console.log(`${DEBUG_PREFIX} Audio canplay event triggered`);
          // Mark audio as ready for playback and seeking
          setIsAudioReady(true);
        }}
        onError={(e) => {
          console.error(`${DEBUG_PREFIX} Audio error:`, e);
          toast.error('Audio playback error occurred');
          setIsPlaying(false);
        }}
        preload="auto"
        controls={false}
        style={{ display: 'none' }}
      />

      <h1 className="text-2xl font-bold mb-4">YouTube Translator</h1>

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

      {transcript && (
        <div className="mb-4 p-4 bg-gray-50 rounded">
          <h2 className="text-lg font-semibold mb-2">Transcript:</h2>
          <p>{transcript}</p>
        </div>
      )}

      {processingStatus !== 'idle' && (
        <div className="mt-8">
          <h2 className="text-xl font-semibold mb-4">Audio Player</h2>

          {processingStatus === 'processing' && (
            <div className="bg-yellow-50 p-4 rounded-lg mb-4">
              <p className="text-yellow-700">
                Processing audio segments... This may take a few minutes.
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

          {processingStatus === 'ready' && (
            <>
              <div className="bg-gray-100 p-4 rounded-lg">
                <div className="flex items-center justify-between mb-4">
                  <button
                    onClick={handlePlayPause}
                    disabled={!isAudioReady}
                    className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 disabled:opacity-50"
                  >
                    {isPlaying ? 'Pause' : 'Play'}
                  </button>
                  <span className="text-sm">
                    Current Time: {Math.floor(currentTime)}s
                  </span>
                </div>

                {/* Add a custom seek bar */}
                <div className="mb-4">
                  <input
                    type="range"
                    min="0"
                    max={getMaxDuration()}
                    value={currentTime}
                    step="0.1"
                    onChange={handleSeek}
                    disabled={!isAudioReady}
                    className="w-full h-2 bg-gray-300 rounded-lg appearance-none cursor-pointer disabled:opacity-50"
                  />
                </div>

                <div className="flex gap-4 justify-center">
                  <button
                    onClick={() => skipSeconds(-5)}
                    disabled={!isAudioReady}
                    className="bg-gray-200 px-4 py-2 rounded hover:bg-gray-300 disabled:opacity-50"
                  >
                    -5s
                  </button>
                  <button
                    onClick={() => skipSeconds(5)}
                    disabled={!isAudioReady}
                    className="bg-gray-200 px-4 py-2 rounded hover:bg-gray-300 disabled:opacity-50"
                  >
                    +5s
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
