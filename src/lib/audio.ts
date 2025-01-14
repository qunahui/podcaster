import { exec } from 'child_process';

/**
 * getAudioDuration - Runs ffprobe locally to get the duration (in seconds) of a remote audio file.
 * @param audioUrl - The publicly accessible URL of the audio file (e.g. a GCS bucket URL).
 */
export const getAudioDuration = async (audioUrl: string): Promise<number> => {
    try {
      if (!audioUrl) {
        throw new Error('Missing audioUrl');
      }
  
      // We'll return a Promise so we can use async/await.
      const duration = await new Promise<number>((resolve, reject) => {
        // The ffprobe command with JSON output
        const cmd = `ffprobe -v quiet -print_format json -show_format "${audioUrl}"`;
  
        exec(cmd, (err, stdout, stderr) => {
          if (err) {
            console.error('Error running ffprobe:', err, stderr);
            return reject(new Error(`Failed to run ffprobe: ${err.message}`));
          }
  
          try {
            const info = JSON.parse(stdout);
            if (!info.format || !info.format.duration) {
              return reject(new Error('ffprobe output missing duration'));
            }
            const parsedDuration = parseFloat(info.format.duration);
            resolve(parsedDuration);
          } catch (parseErr: any) {
            console.error('Error parsing ffprobe output:', parseErr);
            reject(new Error(`Failed to parse ffprobe output: ${parseErr.message}`));
          }
        });
      });
  
      return duration;
    } catch (error) {
      console.error('Error in getAudioDuration:', error);
      throw error;
    }
  };