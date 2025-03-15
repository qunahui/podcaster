import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

const DEBUG_PREFIX = '🎵 [AUDIO-PROXY]';

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    let audioUrl = url.searchParams.get('url');
    const segmentId = url.searchParams.get('segmentId');
    const retryCount = parseInt(url.searchParams.get('retry') || '0');

    // Handle direct segment ID access
    if (segmentId) {
      console.log(`${DEBUG_PREFIX} Fetching segment by ID:`, segmentId);
      
      const segment = await prisma.segment.findUnique({
        where: { id: parseInt(segmentId) },
        include: { video: true }
      });
      
      if (!segment) {
        console.error(`${DEBUG_PREFIX} Segment not found:`, segmentId);
        return new NextResponse('Segment not found', { status: 404 });
      }
      
      if (!segment.isProcessed) {
        console.log(`${DEBUG_PREFIX} Segment not processed yet, triggering processing`);
        
        // Trigger processing of this segment and return a retry response
        try {
          // Call next-segments to process this segment
          const processResponse = await fetch(`${process.env.NEXT_PUBLIC_BASE_URL || ''}/api/youtube/process/next-segments`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              videoId: segment.video.youtubeVideoId,
              currentTimestamp: 0,
              count: 1
            }),
          });
          
          if (!processResponse.ok) {
            throw new Error(`Failed to process segment: ${processResponse.statusText}`);
          }
          
          // Return a response that tells the client to retry
          return new NextResponse(JSON.stringify({
            status: 'processing',
            message: 'Segment is being processed, please retry',
            retryAfter: 2
          }), {
            status: 202,
            headers: {
              'Content-Type': 'application/json',
              'Retry-After': '2',
            },
          });
        } catch (error) {
          console.error(`${DEBUG_PREFIX} Error triggering segment processing:`, error);
          return new NextResponse('Error processing segment', { status: 500 });
        }
      }
      
      // If we have a processed segment, use its URL
      audioUrl = segment.url;
    }

    if (!audioUrl) {
      console.error(`${DEBUG_PREFIX} No audio URL provided`);
      return new NextResponse('Audio URL is required', { status: 400 });
    }

    console.log(`${DEBUG_PREFIX} Proxying request for:`, audioUrl);

    const response = await fetch(audioUrl, {
      // Add retry and timeout options
      headers: {
        'Origin': process.env.NEXT_PUBLIC_BASE_URL || '',
      },
    });
    
    if (!response.ok) {
      console.error(`${DEBUG_PREFIX} Failed to fetch audio:`, {
        status: response.status,
        statusText: response.statusText
      });
      
      // If we've retried less than 3 times, suggest a retry
      if (retryCount < 3) {
        return new NextResponse(JSON.stringify({
          status: 'error',
          message: 'Failed to fetch audio, please retry',
          retryAfter: 1
        }), {
          status: 503,
          headers: {
            'Content-Type': 'application/json',
            'Retry-After': '1',
          },
        });
      }
      
      return new NextResponse('Failed to fetch audio', { status: response.status });
    }

    // Get the audio data as an array buffer
    const audioData = await response.arrayBuffer();

    // Forward the response with appropriate headers
    return new NextResponse(audioData, {
      headers: {
        'Content-Type': 'audio/mpeg',
        'Content-Length': audioData.byteLength.toString(),
        'Accept-Ranges': 'bytes',
        'Cache-Control': 'public, max-age=31536000',
      },
    });
  } catch (error) {
    console.error(`${DEBUG_PREFIX} Error proxying audio:`, error);
    return new NextResponse('Internal Server Error', { status: 500 });
  }
}