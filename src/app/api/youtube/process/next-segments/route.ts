import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { getYoutubeId } from '@/utils/getYoutubeId';
import { synthesize_segment } from '@/lib/tts';
import { getAudioDuration } from '@/lib/audio';
import { makePublicityGoogleCloudURL } from '@/utils/getPublicictyURL';

const DEBUG_PREFIX = '🎵 [NEXT-SEGMENTS]';

// Helper function to convert segment to proxied URL
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

const generateM3U8 = (
  segments: Array<{ id: number; url: string; startTime: number; endTime: number }>,
  allSegmentsProcessed: boolean = false
): string => {
  let m3u8Content = '#EXTM3U\n';
  m3u8Content += '#EXT-X-VERSION:3\n';
  m3u8Content += '#EXT-X-ALLOW-CACHE:NO\n'; // Prevent caching
  m3u8Content += '#EXT-X-PLAYLIST-TYPE:EVENT\n'; // Allow updates
  m3u8Content += '#EXT-X-TARGETDURATION:30\n';
  m3u8Content += '#EXT-X-MEDIA-SEQUENCE:0\n';
  
  segments.forEach((seg) => {
    const duration = seg.endTime - seg.startTime;
    const proxiedUrl = getProxiedUrl({
      url: seg.url,
      id: seg.id
    });
    
    m3u8Content += `#EXTINF:${duration.toFixed(2)},\n`;
    m3u8Content += `${proxiedUrl}\n`;
  });
  
  // Only add ENDLIST if all segments are processed
  if (allSegmentsProcessed) {
    m3u8Content += '#EXT-X-ENDLIST\n';
  }
  
  return m3u8Content;
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { videoId, currentTimestamp, count = 5 } = body;

    if (!videoId) {
      console.error(`${DEBUG_PREFIX} No video ID provided`);
      return new NextResponse('Video ID is required', { status: 400 });
    }

    console.log(`${DEBUG_PREFIX} Processing next segments:`, {
      videoId,
      currentTimestamp,
      count
    });

    const youtubeId = getYoutubeId(videoId);
    
    // Find the video and all its segments
    const video = await prisma.video.findUnique({
      where: { youtubeVideoId: youtubeId },
      include: {
        segments: {
          orderBy: { id: 'asc' },
        }
      }
    });

    if (!video) {
      console.error(`${DEBUG_PREFIX} Video not found, triggering initial processing:`, youtubeId);
      
      // Instead of returning 404, trigger initial processing
      try {
        // Call the process endpoint to create and start processing the video
        const processResponse = await fetch(`${process.env.NEXT_PUBLIC_BASE_URL || ''}/api/youtube/process`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ url: videoId }),
        });
        
        if (!processResponse.ok) {
          throw new Error(`Failed to process video: ${processResponse.statusText}`);
        }
        
        const processResult = await processResponse.json();
        
        return new NextResponse(JSON.stringify({
          success: true,
          message: 'Video created and initial segments processed',
          initialProcessing: true,
          processResult
        }), {
          headers: {
            'Content-Type': 'application/json',
          },
        });
      } catch (error) {
        console.error(`${DEBUG_PREFIX} Error triggering initial processing:`, error);
        return new NextResponse('Video not found and processing failed', { status: 500 });
      }
    }

    // Get all segments and filter processed ones
    const segments = video.segments;
    const processedSegments = segments.filter(seg => seg.isProcessed);
    console.log(`${DEBUG_PREFIX} Found ${processedSegments.length} processed segments`);

    // Get unprocessed segments
    const unprocessedSegments = segments.filter(seg => !seg.isProcessed);
    const nextSegmentsToProcess = unprocessedSegments.slice(0, count);
    console.log(`${DEBUG_PREFIX} Will process next ${nextSegmentsToProcess.length} segments`);

    // Get the last processed segment's end time to use as starting point
    const lastProcessedSegment = processedSegments[processedSegments.length - 1];
    let currentTime = lastProcessedSegment ? lastProcessedSegment.endTime : 0;

    // Process the next batch of segments
    for (const segment of nextSegmentsToProcess) {
      try {
        // Synthesize => get GCS URL
        const audioUrl = await synthesize_segment(segment.transcript, segment.id.toString());
        const publicityAudioURL = makePublicityGoogleCloudURL(audioUrl);
        
        // Measure duration
        const duration = await getAudioDuration(publicityAudioURL);

        // Update DB
        await prisma.segment.update({
          where: { id: segment.id },
          data: {
            url: publicityAudioURL,
            isProcessed: true,
            startTime: currentTime,
            endTime: currentTime + duration,
          },
        });

        console.log(`${DEBUG_PREFIX} Processed segment:`, {
          id: segment.id,
          startTime: currentTime,
          endTime: currentTime + duration,
          url: publicityAudioURL
        });

        currentTime += duration;
      } catch (error) {
        console.error(`${DEBUG_PREFIX} Error processing segment ${segment.id}:`, error);
        throw error;
      }
    }

    // Get all processed segments again to generate updated M3U8
    const updatedProcessedSegments = await prisma.segment.findMany({
      where: {
        videoId: video.id,
        isProcessed: true
      },
      orderBy: {
        startTime: 'asc'
      }
    });

    // Check if all segments are processed
    const totalSegmentsCount = await prisma.segment.count({
      where: { videoId: video.id }
    });
    
    const allSegmentsProcessed = updatedProcessedSegments.length === totalSegmentsCount;
    
    // Generate new M3U8 with all processed segments
    const m3u8Content = generateM3U8(updatedProcessedSegments, allSegmentsProcessed);

    // If all segments are processed, update the video's processedIndexCharacter to indicate completion
    if (allSegmentsProcessed && updatedProcessedSegments.length > 0) {
      await prisma.video.update({
        where: { id: video.id },
        data: {
          processedIndexCharacter: totalSegmentsCount
        }
      });
      
      console.log(`${DEBUG_PREFIX} All segments processed, updated video status`);
    }

    return new NextResponse(JSON.stringify({
      success: true,
      message: `Processed ${nextSegmentsToProcess.length} segments`,
      processedSegments: updatedProcessedSegments.length,
      totalSegments: totalSegmentsCount,
      allSegmentsProcessed,
      segments: updatedProcessedSegments,
      m3u8Content
    }), {
      headers: {
        'Content-Type': 'application/json',
      },
    });
  } catch (error) {
    console.error(`${DEBUG_PREFIX} Error processing next segments:`, error);
    return new NextResponse('Internal Server Error', { status: 500 });
  }
} 