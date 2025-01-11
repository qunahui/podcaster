export const getYoutubeId = (url: string) => {
  const videoId = url.split('v=')[1];
  return videoId;
};
