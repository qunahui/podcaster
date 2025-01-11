import type { NextApiRequest, NextApiResponse } from 'next';
import {
  findVideoByYoutubeId,
  findSegmentsByVideoId,
  appendToVideoTable,
  VideoRecord,
} from '../../../lib/database';

/**
 * Helper function to generate .m3u8 content from a list of segments.
 */
function generateM3U8(segments: { startTime: number; endTime: number; url: string }[]): string {
  let m3u8Content = '#EXTM3U\n';

  segments.forEach((seg) => {
    const duration = seg.endTime - seg.startTime;
    m3u8Content += `#EXTINF:${duration.toFixed(2)},\n`;
    m3u8Content += `${seg.url}\n`;
  });

  // Mark the end of the playlist
  m3u8Content += '#EXT-X-ENDLIST\n';
  return m3u8Content;
}

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  const { videoId } = req.query;
  if (!videoId || Array.isArray(videoId)) {
    return res.status(400).json({ error: 'Invalid videoId param' });
  }

  if (req.method === 'GET') {
    // 1) Check if the video exists
    const video = findVideoByYoutubeId(videoId);
    if (!video) {
      return res.status(404).json({ error: 'Video not found' });
    }

    // 2) Gather segments
    const segments = findSegmentsByVideoId(video.id);

    // 3) Generate .m3u8
    const m3u8 = generateM3U8(segments);

    // 4) Return as plain text
    res.setHeader('Content-Type', 'audio/mpegurl');
    return res.status(200).send(m3u8);
  }

  if (req.method === 'POST') {
    // Create a new video if not found
    const existing = findVideoByYoutubeId(videoId);
    if (existing) {
      return res.status(200).json({
        message: 'Video already exists',
        video: existing,
      });
    }

    // Construct a new VideoRecord
    const newVideo: VideoRecord = {
      id: Date.now(), // or some other unique ID strategy
      youtubeVideoId: videoId,
      processedIndexCharacter: 0,
      fullTranscript: '',
    };

    appendToVideoTable(newVideo);

    return res.status(201).json({
      message: 'Video created',
      video: newVideo,
    });
  }

  // If not GET or POST
  return res.status(405).json({ error: 'Method Not Allowed' });
}
