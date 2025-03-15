import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { getYoutubeId } from '@/utils/getYoutubeId';

const DEBUG_PREFIX = '🎵 [PLAYLIST]';

// Helper function to convert GCS URL to proxied URL
function getProxiedUrl(gcsUrl: string): string {
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || '';
  return `${baseUrl}/api/youtube/audio-proxy?url=${encodeURIComponent(gcsUrl)}`;
}

export async function GET(request: Request) {
  try {
    console.log(`${DEBUG_PREFIX} Playlist request received`);
    const url = new URL(request.url);
    const videoUrl = url.searchParams.get('videoId');

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
      console.log(`${DEBUG_PREFIX} Error: Video not found`);
      return new NextResponse('Video not found', { status: 404 });
    }

    // Generate M3U8 content
    let m3u8Content = '#EXTM3U\n';
    m3u8Content += '#EXT-X-VERSION:3\n';
    m3u8Content += '#EXT-X-ALLOW-CACHE:YES\n';
    m3u8Content += '#EXT-X-PLAYLIST-TYPE:VOD\n';
    m3u8Content += '#EXT-X-TARGETDURATION:30\n';
    m3u8Content += '#EXT-X-MEDIA-SEQUENCE:0\n';

    video.segments.forEach((segment) => {
      const duration = segment.endTime - segment.startTime;
      // Convert to proxied URL
      const proxiedUrl = getProxiedUrl(segment.url);
      console.log(`${DEBUG_PREFIX} Converting URL:`, {
        original: segment.url,
        proxied: proxiedUrl
      });
      
      m3u8Content += `#EXTINF:${duration.toFixed(3)},\n`;
      m3u8Content += `${proxiedUrl}\n`;
    });

    m3u8Content += '#EXT-X-ENDLIST\n';

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
export async function OPTIONS(request: Request) {
  return new NextResponse(null, {
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Range',
      'Access-Control-Expose-Headers': 'Content-Range, Content-Length',
    },
  });
} 