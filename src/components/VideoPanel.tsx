import { useEffect, useRef } from 'react';
import { useLang } from '../i18n';
import type { VideoState } from '../net/useVideo';

/**
 * Shows the opponent's camera (with a small mirrored self-view) and a camera
 * on/off toggle. Renders nothing for spectators or where the camera can't run
 * (video.available is false). The <video> srcObjects are wired imperatively --
 * MediaStream can't be passed as a React prop.
 */
export function VideoPanel({ video }: { video: VideoState }) {
  const { t } = useLang();
  const remoteRef = useRef<HTMLVideoElement>(null);
  const localRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (remoteRef.current) remoteRef.current.srcObject = video.remoteStream;
  }, [video.remoteStream]);

  useEffect(() => {
    if (localRef.current) localRef.current.srcObject = video.localStream;
  }, [video.localStream]);

  if (!video.available) return null;

  return (
    <div className="video">
      <div className="video-title">{t.video.title}</div>
      <div className="video-stage" dir="ltr">
        <video ref={remoteRef} className="video-remote" autoPlay playsInline />
        {!video.remoteStream && <div className="video-hint">{t.video.waitingOpponent}</div>}
        {video.localStream && (
          <video ref={localRef} className="video-local" autoPlay playsInline muted />
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
