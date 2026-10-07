"use client";
import type { ComponentProps } from "react";
import {
  createAudioBlockConfig,
  createVideoBlockConfig,
  audioParse,
  videoParse,
} from "@blocknote/core";
import {
  createReactBlockSpec,
  FileBlockWrapper,
  ResizableFileBlockWrapper,
  AudioToExternalHTML,
  VideoToExternalHTML,
  useResolveUrl,
} from "@blocknote/react";
import { FileAudio, FileVideo } from "lucide-react";
import { MediaPlayer } from "./media-player";
import { mediaUrl } from "@/lib/media-url";
function Preview({
  src,
  kind,
  name,
}: {
  src: string;
  kind: "audio" | "video";
  name: string;
}) {
  const resolved = useResolveUrl(src);
  const url = mediaUrl(
    resolved.loadingState === "loading" ? src : resolved.downloadUrl || src,
  );
  return <MediaPlayer key={url} src={url} kind={kind} name={name} />;
}
export const audioBlockSpec = createReactBlockSpec(createAudioBlockConfig, {
  meta: { fileBlockAccept: ["audio/*"] },
  parse: audioParse(),
  runsBefore: ["file"],
  toExternalHTML: AudioToExternalHTML,
  render: (props) => (
    <FileBlockWrapper
      {...(props as unknown as ComponentProps<typeof FileBlockWrapper>)}
      buttonIcon={<FileAudio size={24} />}
    >
      <Preview
        src={props.block.props.url}
        kind="audio"
        name={props.block.props.name}
      />
    </FileBlockWrapper>
  ),
})();
export const videoBlockSpec = createReactBlockSpec(createVideoBlockConfig, {
  meta: { fileBlockAccept: ["video/*"] },
  parse: videoParse({}),
  runsBefore: ["file"],
  toExternalHTML: VideoToExternalHTML,
  render: (props) => (
    <ResizableFileBlockWrapper
      {...(props as unknown as ComponentProps<
        typeof ResizableFileBlockWrapper
      >)}
      buttonIcon={<FileVideo size={24} />}
    >
      <Preview
        src={props.block.props.url}
        kind="video"
        name={props.block.props.name}
      />
    </ResizableFileBlockWrapper>
  ),
})();
