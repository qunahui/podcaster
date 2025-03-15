import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { getYoutubeId } from '@/utils/getYoutubeId';

const DEBUG_PREFIX = '🎵 [PLAYLIST]';

// Helper function to convert GCS URL or segment ID to proxied URL
function getProxiedUrl(segment: { url: string; id: number }): string {
  // Ensure we have a full URL with domain
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || '';
  
  // For server-side, we need to use an absolute URL
  // In Next.js API routes, we're always on the server side
  const host = process.env.VERCEL_URL || process.env.HOST || 'localhost:3000';
  const protocol = host.startsWith('localhost') ? 'http' : 'https';
  const fullBaseUrl = baseUrl || `${protocol}://${host}`;
  
  // Use segment ID instead of direct URL to ensure we always go through the proxy
  return `${fullBaseUrl}/api/youtube/audio-proxy?segmentId=${segment.id}`;
}

export async function GET(request: Request) {
  try {
    console.log(`${DEBUG_PREFIX} Playlist request received`);
    const url = new URL(request.url);
    const videoUrl = url.searchParams.get('videoId');
    // Add timestamp to prevent caching (used in URL generation)
    const _timestamp = url.searchParams.get('t') || Date.now().toString();

    console.log(`${DEBUG_PREFIX} Video URL:`, videoUrl);

    if (!videoUrl) {
      console.log(`${DEBUG_PREFIX} Error: No video ID provided`);
      return new NextResponse('Video ID is required', { status: 400 });
    }

    const youtubeId = getYoutubeId(videoUrl);
    console.log(`${DEBUG_PREFIX} YouTube ID:`, youtubeId);
    
    // Find the video and its processed segments
    const video = await prisma.video.findUnique({
      where: { youtubeVideoId: youtubeId },
      include: {
        segments: {
          where: { isProcessed: true },
          orderBy: { startTime: 'asc' }
        }
      }
    });

    console.log(`${DEBUG_PREFIX} Found video:`, video?.id);
    console.log(`${DEBUG_PREFIX} Number of segments:`, video?.segments?.length);

    if (!video) {
      console.log(`${DEBUG_PREFIX} Video not found, triggering processing`);
      
      // Instead of returning 404, trigger processing
      try {
        // Call the process endpoint to create and start processing the video
        const processResponse = await fetch(`${process.env.NEXT_PUBLIC_BASE_URL || ''}/api/youtube/process`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ url: videoUrl }),
        });
        
        if (!processResponse.ok) {
          throw new Error(`Failed to process video: ${processResponse.statusText}`);
        }
        
        // Return an empty playlist that will be refreshed
        return new NextResponse(
          '#EXTM3U\n#EXT-X-VERSION:3\n#EXT-X-TARGETDURATION:10\n#EXT-X-MEDIA-SEQUENCE:0\n#EXT-X-PLAYLIST-TYPE:EVENT\n',
          {
            headers: {
              'Content-Type': 'application/vnd.apple.mpegurl',
              'Access-Control-Allow-Origin': '*',
              'Cache-Control': 'no-cache, no-store, must-revalidate',
              'Pragma': 'no-cache',
              'Expires': '0',
            },
          }
        );
      } catch (error) {
        console.error(`${DEBUG_PREFIX} Error triggering processing:`, error);
        return new NextResponse('Video not found and processing failed', { status: 404 });
      }
    }

    // Generate M3U8 content
    let m3u8Content = '#EXTM3U\n';
    m3u8Content += '#EXT-X-VERSION:3\n';
    m3u8Content += '#EXT-X-ALLOW-CACHE:NO\n'; // Changed to NO to prevent caching
    m3u8Content += '#EXT-X-PLAYLIST-TYPE:EVENT\n'; // Changed to EVENT to allow updates
    m3u8Content += '#EXT-X-TARGETDURATION:30\n';
    m3u8Content += '#EXT-X-MEDIA-SEQUENCE:0\n';

    video.segments.forEach((segment) => {
      const duration = segment.endTime - segment.startTime;
      // Convert to proxied URL using segment ID
      const proxiedUrl = getProxiedUrl({
        url: segment.url,
        id: segment.id
      });
      console.log(`${DEBUG_PREFIX} Converting URL:`, {
        original: segment.url,
        segmentId: segment.id,
        proxied: proxiedUrl
      });
      
      m3u8Content += `#EXTINF:${duration.toFixed(3)},\n`;
      m3u8Content += `${proxiedUrl}\n`;
    });

    // Check if all segments are processed before adding ENDLIST
    const totalSegmentsCount = await prisma.segment.count({
      where: { videoId: video.id }
    });
    
    // Only add ENDLIST if all segments are processed
    if (video.segments.length === totalSegmentsCount) {
      m3u8Content += '#EXT-X-ENDLIST\n';
      console.log(`${DEBUG_PREFIX} All segments processed, adding ENDLIST tag`);
    } else {
      console.log(`${DEBUG_PREFIX} Not all segments processed (${video.segments.length}/${totalSegmentsCount}), omitting ENDLIST tag`);
    }

    console.log(`${DEBUG_PREFIX} Generated M3U8 content:`, m3u8Content);

    // Return with proper headers
    return new NextResponse(m3u8Content, {
      headers: {
        'Content-Type': 'application/vnd.apple.mpegurl',
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'no-cache',
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Range',
        'Access-Control-Expose-Headers': 'Content-Range, Content-Length',
      },
    });
  } catch (error) {
    console.error(`${DEBUG_PREFIX} Error generating playlist:`, error);
    return new NextResponse('Internal Server Error', { status: 500 });
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