// src/app/api/youtube/playlist/route.ts
import prisma from '@/lib/prisma';
import { getYoutubeId } from '@/utils/getYoutubeId';
import { generateM3U8 } from '@/utils/hlsHelper';
import { NextResponse } from 'next/server';

const DEBUG_PREFIX = '🎵 [PLAYLIST]';

export async function GET(request: Request) {
  try {
    console.log(`${DEBUG_PREFIX} Playlist request received`);
    const url = new URL(request.url);
    const videoUrl = url.searchParams.get('videoId');
    // Add timestamp to prevent caching
    const debug = url.searchParams.get('debug') === 'true';

    console.log(`${DEBUG_PREFIX} Video URL:`, videoUrl);

    if (!videoUrl) {
      console.log(`${DEBUG_PREFIX} Error: No video ID provided`);
      return new NextResponse('Video ID is required', { status: 400 });
    }

    const youtubeId = getYoutubeId(videoUrl);
    if (!youtubeId) {
      console.log(`${DEBUG_PREFIX} Error: Invalid YouTube URL`);
      return new NextResponse('Invalid YouTube URL', { status: 400 });
    }

    console.log(`${DEBUG_PREFIX} YouTube ID:`, youtubeId);

    // Find the video and its processed segments
    const video = await prisma.video.findUnique({
      where: { youtubeVideoId: youtubeId },
      include: {
        segments: {
          where: { isProcessed: true },
          orderBy: { startTime: 'asc' },
        },
      },
    });

    console.log(`${DEBUG_PREFIX} Found video:`, video?.id);
    console.log(
      `${DEBUG_PREFIX} Number of processed segments:`,
      video?.segments?.length
    );

    // If no processed segments found but we have a video, return an empty playlist instead of error
    if (video && (!video.segments || video.segments.length === 0)) {
      console.log(`${DEBUG_PREFIX} Video found but no processed segments yet`);

      // Return an empty playlist that will be refreshed
      return new NextResponse(
        '#EXTM3U\n#EXT-X-VERSION:3\n#EXT-X-TARGETDURATION:10\n#EXT-X-MEDIA-SEQUENCE:0\n#EXT-X-PLAYLIST-TYPE:EVENT\n',
        {
          headers: {
            'Content-Type': 'application/vnd.apple.mpegurl',
            'Access-Control-Allow-Origin': '*',
            'Cache-Control': 'no-cache, no-store, must-revalidate',
            Pragma: 'no-cache',
            Expires: '0',
          },
        }
      );
    }

    if (!video) {
      console.log(`${DEBUG_PREFIX} Video not found, triggering processing`);

      // Instead of returning 404, trigger processing
      try {
        // Determine base URL for API calls
        const baseUrl =
          process.env.NEXT_PUBLIC_BASE_URL ||
          `${request.headers.get('x-forwarded-proto') || 'http'}://${request.headers.get('host')}`;

        // Call the process endpoint to create and start processing the video
        const processResponse = await fetch(`${baseUrl}/api/youtube/process`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ url: videoUrl }),
        });

        console.log(
          `${DEBUG_PREFIX} Process API response status:`,
          processResponse.status
        );

        if (!processResponse.ok) {
          throw new Error(
            `Failed to process video: ${processResponse.statusText}`
          );
        }

        // Return an empty playlist that will be refreshed
        return new NextResponse(
          '#EXTM3U\n#EXT-X-VERSION:3\n#EXT-X-TARGETDURATION:10\n#EXT-X-MEDIA-SEQUENCE:0\n#EXT-X-PLAYLIST-TYPE:EVENT\n',
          {
            headers: {
              'Content-Type': 'application/vnd.apple.mpegurl',
              'Access-Control-Allow-Origin': '*',
              'Cache-Control': 'no-cache, no-store, must-revalidate',
              Pragma: 'no-cache',
              Expires: '0',
            },
          }
        );
      } catch (error) {
        console.error(`${DEBUG_PREFIX} Error triggering processing:`, error);
        return new NextResponse('Video not found and processing failed', {
          status: 404,
        });
      }
    }

    // Check if all segments are processed before adding ENDLIST
    const totalSegmentsCount = await prisma.segment.count({
      where: { videoId: video.id },
    });

    // Only add ENDLIST if all segments are processed
    const allSegmentsProcessed = video.segments.length === totalSegmentsCount;

    // Determine the base URL for generating proxied URLs
    const baseUrl =
      process.env.NEXT_PUBLIC_BASE_URL ||
      `${request.headers.get('x-forwarded-proto') || 'http'}://${request.headers.get('host')}`;

    // Validate URLs before generating the playlist
    for (const segment of video.segments) {
      if (!segment.url) {
        console.error(`${DEBUG_PREFIX} Segment ${segment.id} has no URL!`);
      }
    }

    // Generate M3U8 content using helper
    const m3u8Content = generateM3U8(
      video.segments,
      allSegmentsProcessed,
      baseUrl
    );

    console.log(
      `${DEBUG_PREFIX} Generated M3U8 content with ${video.segments.length} segments`
    );

    // If debug mode is on, also log the full M3U8 content (be careful with large playlists)
    if (debug) {
      console.log(`${DEBUG_PREFIX} Full M3U8 content:\n${m3u8Content}`);
    }

    if (allSegmentsProcessed) {
      console.log(`${DEBUG_PREFIX} All segments processed, adding ENDLIST tag`);
    } else {
      console.log(
        `${DEBUG_PREFIX} Not all segments processed (${video.segments.length}/${totalSegmentsCount}), omitting ENDLIST tag`
      );
    }

    // Return with proper headers
    return new NextResponse(m3u8Content, {
      headers: {
        'Content-Type': 'application/vnd.apple.mpegurl',
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        Pragma: 'no-cache',
        Expires: '0',
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Range',
        'Access-Control-Expose-Headers': 'Content-Range, Content-Length',
      },
    });
  } catch (error) {
    console.error(`${DEBUG_PREFIX} Error generating playlist:`, error);
    return new NextResponse(
      `Internal Server Error: ${error instanceof Error ? error.message : 'Unknown error'}`,
      { status: 500 }
    );
  }
}

// Add OPTIONS handler for CORS preflight requests
export async function OPTIONS(_request: Request) {
  return new NextResponse(null, {
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Range',
      'Access-Control-Expose-Headers': 'Content-Range, Content-Length',
    },
  });
}
