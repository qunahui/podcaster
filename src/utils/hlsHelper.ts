// src/utils/hlsHelper.ts
import { Segment } from '@prisma/client';

interface ProxiedSegment {
  id: number;
  startTime: number;
  endTime: number;
  url: string;
  proxiedUrl: string;
}

/**
 * Convert direct GCS URLs to proxied URLs for HLS playback
 */
export const getProxiedUrl = (
  segment: { url: string; id: number },
  baseUrl?: string
): string => {
  // Ensure we have a full URL with domain
  const host =
    typeof window !== 'undefined'
      ? window.location.origin
      : baseUrl || process.env.NEXT_PUBLIC_BASE_URL || '';

  // Use segment ID instead of direct URL to ensure we always go through the proxy
  return `${host}/api/youtube/audio-proxy?segmentId=${segment.id}`;
};

/**
 * Generate M3U8 content for HLS player
 */
export const generateM3U8 = (
  segments: Array<{
    id: number;
    url: string;
    startTime: number;
    endTime: number;
  }>,
  allSegmentsProcessed: boolean = false,
  baseUrl?: string
): string => {
  if (!segments.length) {
    return '#EXTM3U\n#EXT-X-VERSION:3\n#EXT-X-TARGETDURATION:10\n#EXT-X-MEDIA-SEQUENCE:0\n#EXT-X-PLAYLIST-TYPE:EVENT\n';
  }

  let m3u8Content = '#EXTM3U\n';
  m3u8Content += '#EXT-X-VERSION:3\n';
  m3u8Content += '#EXT-X-ALLOW-CACHE:NO\n'; // Prevent caching
  m3u8Content += '#EXT-X-PLAYLIST-TYPE:EVENT\n'; // Allow updates

  // Find the max duration for target duration (rounded up to nearest integer + 1 for safety)
  const maxDuration = Math.max(
    ...segments.map((seg) => seg.endTime - seg.startTime)
  );
  m3u8Content += `#EXT-X-TARGETDURATION:${Math.ceil(maxDuration) + 1}\n`;

  // Use the first segment's ID as the media sequence number
  m3u8Content += `#EXT-X-MEDIA-SEQUENCE:${segments[0].id}\n`;

  segments.forEach((seg) => {
    const duration = seg.endTime - seg.startTime;
    const proxiedUrl = getProxiedUrl(
      {
        url: seg.url,
        id: seg.id,
      },
      baseUrl
    );

    m3u8Content += `#EXTINF:${duration.toFixed(3)},\n`;
    m3u8Content += `${proxiedUrl}\n`;
  });

  // Only add ENDLIST if all segments are processed
  if (allSegmentsProcessed) {
    m3u8Content += '#EXT-X-ENDLIST\n';
  }

  return m3u8Content;
};

/**
 * Prepare segments for the frontend with proxied URLs
 */
export const prepareSegmentsForClient = (
  segments: Segment[],
  baseUrl?: string
): ProxiedSegment[] => {
  return segments.map((seg) => ({
    id: seg.id,
    startTime: seg.startTime,
    endTime: seg.endTime,
    url: seg.url,
    proxiedUrl: getProxiedUrl(seg, baseUrl),
  }));
};
