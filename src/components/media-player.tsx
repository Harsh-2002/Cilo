"use client";
import { apiNamespacePattern } from "@/lib/paths";
import { useCallback, useRef, useState, useSyncExternalStore } from "react";
import {
  FileAudio,
  FileVideo,
  Loader2,
  Maximize,
  Pause,
  Play,
  Volume2,
  VolumeX,
} from "lucide-react";
import { Button } from "./ui/button";
import { Slider } from "./ui/slider";
import { Popover, PopoverContent, PopoverTrigger } from "./ui/popover";
export function mediaTime(seconds: number) {
  const value = Number.isFinite(seconds) ? Math.max(0, Math.floor(seconds)) : 0;
  const hours = Math.floor(value / 3600);
  const minutes = Math.floor(value / 60) % 60;
  const rest = String(value % 60).padStart(2, "0");
  return hours
    ? `${hours}:${String(minutes).padStart(2, "0")}:${rest}`
    : `${minutes}:${rest}`;
}
function safeMediaSource(value: string) {
  try {
    return ["http:", "https:"].includes(
      new URL(value, "https://nivra.invalid").protocol,
    )
      ? value
      : undefined;
  } catch {
    return undefined;
  }
}
const playbackFailure = "This file could not be played. Try again.";
const subscribeFullscreen = (notify: () => void) => {
  document.addEventListener("fullscreenchange", notify);
  return () => document.removeEventListener("fullscreenchange", notify);
};
export function MediaPlayer({
  src,
  kind,
  name,
}: {
  src: string;
  kind: "audio" | "video";
  name: string;
}) {
  const source = safeMediaSource(src);
  const media = useRef<HTMLMediaElement>(null);
  const pendingPlayback = useRef<{ volume: number; muted: boolean } | null>(
    null,
  );
  const [attempt, setAttempt] = useState(0);
  const [playbackSource, setPlaybackSource] = useState(source);
  const container = useRef<HTMLDivElement>(null);
  const [playing, setPlaying] = useState(false);
  const [duration, setDuration] = useState(0);
  const [position, setPosition] = useState(0);
  const [volume, setVolume] = useState(1);
  const [muted, setMuted] = useState(false);
  const [waiting, setWaiting] = useState(false);
  const [error, setError] = useState(
    source ? "" : "This file link is unsupported.",
  );
  const [failed, setFailed] = useState(false);
  const [volumeOpen, setVolumeOpen] = useState(false);
  const attachMedia = useCallback((node: HTMLMediaElement | null) => {
    media.current = node;
    if (node) {
      setDuration(Number.isFinite(node.duration) ? node.duration : 0);
      setPosition(node.currentTime);
      setPlaying(!node.paused);
      setVolume(node.volume);
      setMuted(node.muted);
      if (pendingPlayback.current) {
        node.volume = pendingPlayback.current.volume;
        node.muted = pendingPlayback.current.muted;
        pendingPlayback.current = null;
        void node.play().catch(() => {
          if (media.current === node)
            setError("Playback could not start. Try again.");
        });
      }
      if (node.error) {
        setFailed(true);
        setError(playbackFailure);
      }
    }
  }, []);
  const fullscreenAvailable = useSyncExternalStore(
    subscribeFullscreen,
    () => document.fullscreenEnabled,
    () => false,
  );
  const fullscreen = useSyncExternalStore(
    subscribeFullscreen,
    () => !!document.fullscreenElement,
    () => false,
  );
  const Media = kind === "video" ? "video" : "audio";
  const Icon = kind === "video" ? FileVideo : FileAudio;
  const toggle = async () => {
    const node = media.current;
    if (!node) return;
    // Firefox keeps paused false after a failed load, so retry must win.
    if (!failed && !node.paused) {
      node.pause();
      return;
    }
    setError("");
    try {
      if (failed) {
        setFailed(false);
        const url = new URL(src, window.location.href);
        if (
          url.origin === window.location.origin &&
          new RegExp(
            String.raw`^/api/${apiNamespacePattern}/(?:files/|artifacts/[^/]+/file|published/[a-f0-9]{48}/files/)`,
          ).test(url.pathname)
        ) {
          url.searchParams.set("_retry", String(Date.now()));
          setPlaybackSource(url.href);
        }
        pendingPlayback.current = { volume: node.volume, muted: node.muted };
        setAttempt((value) => value + 1);
        return;
      }
      if (node.ended) node.currentTime = 0;
      await node.play();
    } catch {
      if (media.current !== node) return;
      setWaiting(false);
      setError("Playback could not start. Try again.");
    }
  };
  return (
    <div
      ref={container}
      className={`media-player media-${kind}`}
      contentEditable={false}
      role="group"
      aria-label={`${name || kind} player`}
    >
      <Media
        key={attempt}
        ref={attachMedia}
        src={playbackSource}
        preload="metadata"
        playsInline
        aria-label={name || kind}
        onLoadedMetadata={(event) => {
          const value = event.currentTarget.duration;
          setDuration(Number.isFinite(value) ? value : 0);
          setFailed(false);
        }}
        onDurationChange={(event) => {
          const value = event.currentTarget.duration;
          setDuration(Number.isFinite(value) ? value : 0);
        }}
        onTimeUpdate={(event) => setPosition(event.currentTarget.currentTime)}
        onPlay={() => setPlaying(true)}
        onPlaying={() => setWaiting(false)}
        onWaiting={() => setWaiting(true)}
        onPause={() => {
          setPlaying(false);
          setWaiting(false);
        }}
        onEnded={() => {
          setPlaying(false);
          setWaiting(false);
        }}
        onVolumeChange={(event) => {
          setVolume(event.currentTarget.volume);
          setMuted(event.currentTarget.muted);
        }}
        onError={(event) => {
          if (
            event.currentTarget !== media.current ||
            !event.currentTarget.error
          )
            return;
          setFailed(true);
          setWaiting(false);
          setPlaying(false);
          setError(playbackFailure);
        }}
      />
      <div className="media-controls">
        <div className="media-control-row">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label={`${playing ? "Pause" : failed ? "Retry" : "Play"} ${kind}`}
            disabled={!source}
            onClick={() => void toggle()}
          >
            {waiting ? (
              <Loader2 className="animate-spin" />
            ) : playing ? (
              <Pause />
            ) : (
              <Play />
            )}
          </Button>
          <span className="media-name">
            <Icon size={14} />
            <span title={name}>
              {name || (kind === "audio" ? "Audio" : "Video")}
            </span>
          </span>
          <span className="media-time">
            {mediaTime(position)} / {mediaTime(duration)}
          </span>
          <Popover open={volumeOpen} onOpenChange={setVolumeOpen}>
            <PopoverTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label="Volume"
              >
                {muted || volume === 0 ? <VolumeX /> : <Volume2 />}
              </Button>
            </PopoverTrigger>
            <PopoverContent
              className="media-volume"
              collisionPadding={12}
              aria-label="Volume"
            >
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label={muted ? "Unmute" : "Mute"}
                onClick={() => {
                  if (media.current) media.current.muted = !muted;
                }}
              >
                {muted ? <VolumeX /> : <Volume2 />}
              </Button>
              <Slider
                aria-label="Volume level"
                min={0}
                max={1}
                step={0.05}
                value={[muted ? 0 : volume]}
                onValueChange={([value]) => {
                  if (media.current) {
                    media.current.muted = false;
                    media.current.volume = value;
                  }
                }}
              />
            </PopoverContent>
          </Popover>
          {kind === "video" && fullscreenAvailable && (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label={fullscreen ? "Exit fullscreen" : "Fullscreen"}
              onClick={() => {
                const action =
                  document.fullscreenElement === container.current
                    ? document.exitFullscreen()
                    : container.current?.requestFullscreen();
                void action?.catch(() =>
                  setError("Fullscreen is unavailable in this browser."),
                );
              }}
            >
              <Maximize />
            </Button>
          )}
        </div>
        <Slider
          aria-label="Playback position"
          aria-valuetext={`${mediaTime(position)} of ${mediaTime(duration)}`}
          min={0}
          max={duration || 1}
          step={0.1}
          value={[Math.min(position, duration)]}
          disabled={!duration || failed}
          onValueChange={([value]) => {
            if (media.current) {
              media.current.currentTime = value;
              setPosition(value);
            }
          }}
        />
        {error && (
          <p className="media-error" role="alert">
            {error}{" "}
            {source && (
              <a href={source} target="_blank" rel="noopener noreferrer">
                Open file
              </a>
            )}
          </p>
        )}
        {source && (
          <noscript>
            <a href={source}>Open {name || kind}</a>
          </noscript>
        )}
      </div>
    </div>
  );
}
