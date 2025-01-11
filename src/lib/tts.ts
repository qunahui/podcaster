export const translateTranscript = async (transcripts: string) => {
  try {
    const response = await fetch(
      'https://asia-northeast1-starry-compiler-439208-m6.cloudfunctions.net/preprocess_transcript_function',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ transcripts }),
      }
    );

    const data = await response.json();
    return data.processed_transcript;
  } catch (error) {
    console.error('Error translating transcript:', error);
    throw error;
  }
};
