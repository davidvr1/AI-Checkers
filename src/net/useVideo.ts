import { useCallback, useEffect, useRef, useState } from 'react';
import type { ConnectionStatus } from './useOnlineGame';
import type { Role } from './protocol';

export type VideoError = 'denied' | 'no-device' | 'unsupported' | 'failed';

export interface VideoState {
  /** True only for a seated player on a browser that supports WebRTC + camera. */
  available: boolean;
  cameraOn: boolean;
  /** Whether this client's microphone is live (only meaningful while cameraOn). */
  micOn: boolean;
  localStream: MediaStream | null;
  remoteStream: MediaStream | null;
  /** The peer connection's state, so the UI can show connecting/failed distinctly. */
  connection: RTCPeerConnectionState | null;
  error: VideoError | null;
  toggleCamera: () => void;
  toggleMic: () => void;
}

interface UseVideoParams {
  role: Role | null;
  /** Both seats filled -- there is an opponent to connect video with. */
  opponentPresent: boolean;
  /** The game socket's status, so video can resync (ICE restart) after a reconnect. */
  status: ConnectionStatus;
  sendSignal: (data: unknown) => void;
  onSignal: (handler: (from: Role, data: unknown) => void) => () => void;
}

/** The opaque signaling payloads exchanged over the game's WebSocket. */
type SignalData = { description?: RTCSessionDescriptionInit; candidate?: RTCIceCandidateInit | null };

const supported = (): boolean =>
  typeof RTCPeerConnection !== 'undefined' && !!navigator.mediaDevices?.getUserMedia;

/**
 * Peer-to-peer camera between the two seated players, using the game's WebSocket
 * only for signaling (SDP/ICE) -- the video itself flows browser-to-browser.
 * Implements the WebRTC "perfect negotiation" pattern so simultaneous offers
 * (both players enabling the camera at once) resolve without glare; Red is the
 * polite peer, Black the impolite one. STUN servers are configured (see
 * createPeer) so the two browsers can find a working path on real home networks;
 * a network that blocks direct device-to-device traffic would need a TURN relay.
 *
 * Invariants that guard against the lifecycle traps: a peer connection exists
 * ONLY during an active call (seated + opponent present); the camera is stopped
 * whenever there is no active call (privacy -- never capture with the panel
 * hidden); incoming signals are processed one-at-a-time on a promise queue so a
 * burst of offer+candidates can't interleave and drop early candidates.
 */
export function useVideo({ role, opponentPresent, status, sendSignal, onSignal }: UseVideoParams): VideoState {
  const [cameraOn, setCameraOn] = useState(false);
  const [micOn, setMicOn] = useState(true);
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const [connection, setConnection] = useState<RTCPeerConnectionState | null>(null);
  const [error, setError] = useState<VideoError | null>(null);

  const pcRef = useRef<RTCPeerConnection | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const makingOffer = useRef(false);
  const ignoreOffer = useRef(false);
  const opponentPresentRef = useRef(opponentPresent);
  const signalQueue = useRef<Promise<void>>(Promise.resolve());
  const prevStatus = useRef<ConnectionStatus>(status);

  const seated = role === 'red' || role === 'black';
  const polite = role === 'red';
  const available = seated && supported();

  useEffect(() => {
    opponentPresentRef.current = opponentPresent;
  }, [opponentPresent]);

  const createPeer = useCallback((): RTCPeerConnection => {
    // STUN helps the two browsers find a working path on real networks (many home
    // routers won't connect two devices on host/mDNS candidates alone). It needs
    // internet; if there's none, ICE still falls back to host candidates. For a
    // network that blocks device-to-device entirely (guest WiFi / client
    // isolation) a TURN relay would be required -- see deferred-work.
    const pc = new RTCPeerConnection({
      iceServers: [{ urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] }],
    });
    pc.oniceconnectionstatechange = () =>
      console.debug('[video] iceConnectionState:', pc.iceConnectionState);
    pc.onnegotiationneeded = async () => {
      try {
        makingOffer.current = true;
        await pc.setLocalDescription();
        sendSignal({ description: pc.localDescription ?? undefined });
      } catch {
        /* transient; a later negotiation can recover */
      } finally {
        makingOffer.current = false;
      }
    };
    pc.onicecandidate = ({ candidate }) => {
      if (candidate) sendSignal({ candidate: candidate.toJSON() });
    };
    pc.ontrack = ({ streams }) => setRemoteStream(streams[0] ?? null);
    pc.onconnectionstatechange = () => {
      console.debug('[video] connectionState:', pc.connectionState);
      setConnection(pc.connectionState);
      if (pc.connectionState === 'failed') {
        pc.restartIce(); // best-effort recovery (won't help true unreachability, e.g. AP isolation)
      }
    };
    return pc;
  }, [sendSignal]);

  const ensurePc = useCallback((): RTCPeerConnection => {
    if (!pcRef.current) {
      const pc = createPeer();
      // Attach the local camera (if already on) so a freshly-created peer -- e.g.
      // when the opponent arrives after you enabled your camera -- offers it.
      const stream = localStreamRef.current;
      if (stream) for (const track of stream.getTracks()) pc.addTrack(track, stream);
      pcRef.current = pc;
    }
    return pcRef.current;
  }, [createPeer]);

  const teardownPc = useCallback(() => {
    pcRef.current?.close();
    pcRef.current = null;
    makingOffer.current = false;
    ignoreOffer.current = false;
    signalQueue.current = Promise.resolve();
    setRemoteStream(null);
    setConnection(null);
  }, []);

  const releaseCamera = useCallback(() => {
    localStreamRef.current?.getTracks().forEach((track) => track.stop());
    localStreamRef.current = null;
    setLocalStream(null);
    setCameraOn(false);
  }, []);

  // A peer connection (and the camera) live only during an active call. When
  // there's no opponent -- or we've been demoted to spectator on a reconnect --
  // close the peer AND stop the camera, so it never keeps capturing with the
  // panel hidden and no toggle.
  useEffect(() => {
    if (available && opponentPresent) {
      ensurePc();
    } else {
      teardownPc();
      releaseCamera();
    }
  }, [available, opponentPresent, ensurePc, teardownPc, releaseCamera]);

  // After a game-socket reconnect, signaling sent during the gap was dropped;
  // nudge ICE to regenerate candidates so a call started mid-drop can complete.
  useEffect(() => {
    if (prevStatus.current !== 'open' && status === 'open' && pcRef.current) {
      pcRef.current.restartIce();
    }
    prevStatus.current = status;
  }, [status]);

  // Perfect-negotiation signaling, serialized on a promise queue.
  useEffect(() => {
    if (!available) return;
    return onSignal((_from, raw) => {
      const data = (raw ?? {}) as SignalData;
      signalQueue.current = signalQueue.current
        .then(async () => {
          if (!opponentPresentRef.current) return; // ignore late signals after the opponent left
          const pc = ensurePc();
          if (data.description) {
            const offerCollision =
              data.description.type === 'offer' && (makingOffer.current || pc.signalingState !== 'stable');
            ignoreOffer.current = !polite && offerCollision;
            if (ignoreOffer.current) return;
            if (offerCollision) {
              // Polite peer yields: explicit rollback (compatible with engines
              // that lack implicit rollback, e.g. older iOS Safari) then accept.
              await Promise.all([
                pc.setLocalDescription({ type: 'rollback' }).catch(() => undefined),
                pc.setRemoteDescription(data.description),
              ]);
            } else {
              await pc.setRemoteDescription(data.description);
            }
            if (data.description.type === 'offer') {
              await pc.setLocalDescription();
              sendSignal({ description: pc.localDescription ?? undefined });
            }
          } else if (data.candidate) {
            try {
              await pc.addIceCandidate(data.candidate);
            } catch (err) {
              if (!ignoreOffer.current) throw err;
            }
          }
        })
        .catch(() => {
          /* swallow -- a bad/late signal must not break the queue for later ones */
        });
    });
  }, [available, polite, ensurePc, sendSignal, onSignal]);

  const startCamera = useCallback(async () => {
    if (!available) {
      setError('unsupported');
      return;
    }
    setError(null);
    try {
      // Audio with echo cancellation so speaker output isn't fed back into the
      // mic (the self-view <video> is muted, so no local feedback either).
      const stream = await navigator.mediaDevices.getUserMedia({
        video: true,
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });
      localStreamRef.current = stream;
      setLocalStream(stream);
      setCameraOn(true);
      setMicOn(true);
      // Add tracks to an already-open peer (opponent present) -> renegotiation ->
      // offer. If there's no peer yet (still waiting), ensurePc will attach these
      // tracks when it creates the peer on the opponent's arrival. NOTE: we do NOT
      // create a peer here -- doing so while alone strands a dropped offer.
      const pc = pcRef.current;
      if (pc) {
        for (const track of stream.getTracks()) {
          if (!pc.getSenders().some((sender) => sender.track === track)) pc.addTrack(track, stream);
        }
      }
    } catch (err) {
      const name = (err as { name?: string })?.name;
      if (name === 'NotAllowedError' || name === 'SecurityError') setError('denied');
      else if (name === 'NotFoundError' || name === 'OverconstrainedError' || name === 'NotReadableError')
        setError('no-device');
      else setError('failed');
    }
  }, [available]);

  const stopCamera = useCallback(() => {
    releaseCamera();
    const pc = pcRef.current;
    if (pc) for (const sender of pc.getSenders()) if (sender.track) pc.removeTrack(sender); // -> renegotiate
  }, [releaseCamera]);

  const toggleCamera = useCallback(() => {
    if (cameraOn) stopCamera();
    else void startCamera();
  }, [cameraOn, startCamera, stopCamera]);

  // Mute/unmute the mic by toggling the audio track's `enabled` -- the opponent
  // hears silence with no renegotiation, and the track is kept ready to unmute.
  const toggleMic = useCallback(() => {
    const stream = localStreamRef.current;
    if (!stream) return;
    setMicOn((prev) => {
      const next = !prev;
      for (const track of stream.getAudioTracks()) track.enabled = next;
      return next;
    });
  }, []);

  // Stop the camera and close the peer on unmount (leaving the online screen).
  useEffect(
    () => () => {
      localStreamRef.current?.getTracks().forEach((track) => track.stop());
      pcRef.current?.close();
    },
    [],
  );

  return { available, cameraOn, micOn, localStream, remoteStream, connection, error, toggleCamera, toggleMic };
}
