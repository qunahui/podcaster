import { exec } from 'child_process';

export async function POST(req: Request): Promise<Response> {
  try {
    const body = await req.json();
    const { audioUrl } = body;

    if (!audioUrl) {
      return new Response(
        JSON.stringify({ error: 'Missing audioUrl in request body' }),
        { status: 400 }
      );
    }

    const cmd = `ffprobe -v quiet -print_format json -show_format "${audioUrl}"`;

    return new Promise((resolve) => {
      exec(cmd, (err, stdout, stderr) => {
        if (err) {
          console.error('Error running ffprobe:', err, stderr);
          resolve(
            new Response(
              JSON.stringify({
                error: 'Failed to run ffprobe',
                details: err.message,
              }),
              { status: 500 }
            )
          );
          return;
        }

        try {
          // Parse the JSON output from ffprobe
          const info = JSON.parse(stdout);
          if (!info.format || !info.format.duration) {
            resolve(
              new Response(
                JSON.stringify({ error: 'ffprobe output missing duration' }),
                { status: 500 }
              )
            );
            return;
          }

          // The duration is in seconds (float)
          const duration = parseFloat(info.format.duration);
          resolve(new Response(JSON.stringify({ duration }), { status: 200 }));
        } catch (parseErr) {
          console.error('Error parsing ffprobe output:', parseErr);
          resolve(
            new Response(
              JSON.stringify({
                error: 'Failed to parse ffprobe output',
                details: (parseErr as Error).message,
              }),
              { status: 500 }
            )
          );
        }
      });
    });
  } catch (error: any) {
    console.error('Unexpected error:', error);
    return new Response(
      JSON.stringify({ error: 'Unexpected error', details: error.message }),
      { status: 500 }
    );
  }
}
