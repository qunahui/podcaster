import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { getYoutubeId } from '@/utils/getYoutubeId';
import { synthesize_segment } from '@/lib/tts';
import { getAudioDuration } from '@/lib/audio';
import { makePublicityGoogleCloudURL } from '@/utils/getPublicictyURL';

const DEBUG_PREFIX = '🎵 [NEXT-SEGMENTS]';

const generateM3U8 = (segments: Array<{ url: string; startTime: number; endTime: number }>): string => {
  let m3u8Content = '#EXTM3U\n';
  segments.forEach((seg) => {
    const duration = seg.endTime - seg.startTime;
    m3u8Content += `#EXTINF:${duration.toFixed(2)},\n`;
    m3u8Content += `${seg.url}\n`;
  });
  m3u8Content += '#EXT-X-ENDLIST\n';
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
      console.error(`${DEBUG_PREFIX} Video not found:`, youtubeId);
      return new NextResponse('Video not found', { status: 404 });
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

    // Generate new M3U8 with all processed segments
    const m3u8Content = generateM3U8(updatedProcessedSegments);

    return new NextResponse(JSON.stringify({
      success: true,
      message: `Processed ${nextSegmentsToProcess.length} segments`,
      processedSegments: updatedProcessedSegments.length,
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