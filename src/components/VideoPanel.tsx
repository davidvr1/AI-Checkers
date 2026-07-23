import { useEffect, useRef, useState } from 'react';
import { useLang } from '../i18n';
import type { VideoState } from '../net/useVideo';

/**
 * Shows the opponent's camera (with a small mirrored self-view) and camera / mic
 * controls. Renders nothing for spectators or where the camera can't run
 * (video.available is false). The <video> srcObjects are wired imperatively --
 * MediaStream can't be passed as a React prop. An "enlarge" button puts the
 * stage into the browser's full-screen view.
 */
export function VideoPanel({ video }: { video: VideoState }) {
  const { t } = useLang();
  const stageRef = useRef<HTMLDivElement>(null);
  const remoteRef = useRef<HTMLVideoElement>(null);
  const localRef = useRef<HTMLVideoElement>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);

  useEffect(() => {
    if (remoteRef.current) remoteRef.current.srcObject = video.remoteStream;
  }, [video.remoteStream]);

  useEffect(() => {
    if (localRef.current) localRef.current.srcObject = video.localStream;
  }, [video.localStream]);

  useEffect(() => {
    const onChange = () => setIsFullscreen(document.fullscreenElement === stageRef.current);
    document.addEventListener('fullscreenchange', onChange);
    return () => document.removeEventListener('fullscreenchange', onChange);
  }, []);

  if (!video.available) return null;

  const fullscreenSupported = typeof document !== 'undefined' && document.fullscreenEnabled;

  const toggleFullscreen = () => {
    if (document.fullscreenElement) void document.exitFullscreen();
    else void stageRef.current?.requestFullscreen?.();
  };

  return (
    <div className="video">
      <div className="video-title">{t.video.title}</div>
      <div className="video-stage" dir="ltr" ref={stageRef}>
        <video ref={remoteRef} className="video-remote" autoPlay playsInline />
        {!video.remoteStream && (
          <div className={`video-hint${video.connection === 'failed' ? ' error' : ''}`}>
            {video.connection === 'failed'
              ? t.video.connectFailed
              : video.connection === 'connecting'
                ? t.video.connecting
                : t.video.waitingOpponent}
          </div>
        )}
        {video.localStream && (
          <video ref={localRef} className="video-local" autoPlay playsInline muted />
        )}
        {fullscreenSupported && (
          <button
            type="button"
            className="video-enlarge"
            onClick={toggleFullscreen}
            aria-label={isFullscreen ? t.video.shrink : t.video.enlarge}
            title={isFullscreen ? t.video.shrink : t.video.enlarge}
          >
            {isFullscreen ? '✕' : '⛶'}
          </button>
        )}
      </div>
      {video.error && <div className="video-error">{t.video.errors[video.error]}</div>}
      <div className="video-controls">
        <button type="button" className="video-toggle" onClick={video.toggleCamera}>
          {video.cameraOn ? t.video.turnOff : t.video.turnOn}
        </button>
        {video.cameraOn && (
          <button type="button" className="video-toggle" onClick={video.toggleMic}>
            {video.micOn ? t.video.mute : t.video.unmute}
          </button>
        )}
      </div>
    </div>
  );
}
