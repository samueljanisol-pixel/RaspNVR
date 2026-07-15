/** Config hls.js pour le live distant via tunnel Cloudflare (plus de marge réseau). */
export function hlsLiveConfig(withAudio = false) {
  return {
    lowLatencyMode: true,
    enableWorker: true,
    liveSyncDuration: withAudio ? 3 : 2.5,
    liveMaxLatencyDuration: withAudio ? 15 : 12,
    maxLiveSyncPlaybackRate: 1.2,
    maxBufferLength: 15,
    maxMaxBufferLength: 25,
    backBufferLength: 8,
    liveBackBufferLength: 0,
    fragLoadingTimeOut: 20_000,
    manifestLoadingTimeOut: 15_000,
    levelLoadingTimeOut: 15_000,
    fragLoadingMaxRetry: 8,
    fragLoadingRetryDelay: 750,
    manifestLoadingMaxRetry: 6,
    manifestLoadingRetryDelay: 1000,
  };
}
