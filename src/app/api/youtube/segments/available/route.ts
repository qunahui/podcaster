// src/app/api/youtube/segments/available/route.ts
import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { getYoutubeId } from '@/utils/getYoutubeId';
import { prepareSegmentsForClient } from '@/utils/hlsHelper';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { videoId: url, timestamp } = body;

    if (!url || typeof timestamp !== 'number') {
      return NextResponse.json(
        { error: 'Invalid parameters' },
        { status: 400 }
      );
    }

    const youtubeId = getYoutubeId(url);
    
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

    if (!video) {
      return NextResponse.json(
        { error: 'Video not found' },
        { status: 404 }
      );
    }

    // Get the total number of segments for progress reporting
    const totalSegmentsCount = await prisma.segment.count({
      where: { videoId: video.id }
    });

    // Determine base URL for proxied URLs
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || '';
    
    // Get proxied URLs for segments using the helper
    const preparedSegments = prepareSegmentsForClient(video.segments, baseUrl);

    // Return all available segments with progress info
    return NextResponse.json({
      segments: preparedSegments.map(segment => ({
        id: segment.id,
        start: segment.startTime,
        end: segment.endTime,
        url: segment.proxiedUrl
      })),
      processed: video.segments.length,
      total: totalSegmentsCount
    });
  } catch (error) {
    console.error('Error checking available segments:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}