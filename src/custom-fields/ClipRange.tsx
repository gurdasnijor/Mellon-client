import { useEffect, useRef, useState } from 'react';

import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Slider from '@mui/material/Slider';
import Typography from '@mui/material/Typography';

import config from '../../app.config';
import { FieldProps } from '../components/NodeContent';
import FileBrowserField from '../fields/FileBrowserField';
import { useFlowStore } from '../stores/useFlowStore';
import { useLinked } from './useLinked';

/**
 * A video file field with in and out marks (`display: "custom.ClipRange"`). It picks the clip as the file browser
 * does, and writes the selection to two int params of the same node, in frames at `fieldOptions.fps`:
 * `fieldOptions.firstFrame` (default `first_frame`), the in mark, and `fieldOptions.frames` (default `frames`), the
 * marks' distance, or 0 when the out mark is the clip's end.
 *
 * With `fieldOptions.clip`, it names a linked input instead and plays the clip the linking node previews; with
 * `fieldOptions.cuts`, another linked input whose node shows its cuts (frames) in a ui field, drawn on the track.
 */
export default function ClipRange(props: FieldProps) {
  const fps: number = props.fieldOptions?.fps ?? 24;
  const firstKey: string = props.fieldOptions?.firstFrame ?? 'first_frame';
  const framesKey: string = props.fieldOptions?.frames ?? 'frames';
  const first: number = useFlowStore(s => s.nodes.find(n => n.id === props.nodeId)?.data.params[firstKey]?.value ?? 0);
  const count: number = useFlowStore(s => s.nodes.find(n => n.id === props.nodeId)?.data.params[framesKey]?.value ?? 0);
  const linkedClip = useLinked(props.nodeId, props.fieldOptions?.clip, 'ui_video');
  const linkedCuts = useLinked(props.nodeId, props.fieldOptions?.cuts, 'ui_text');
  const source = ([linkedClip].flat()[0] as string | undefined) || undefined;
  const cuts: number[] = Array.isArray(linkedCuts) ? linkedCuts.filter((c): c is number => typeof c === 'number') : [];

  const box = useRef<HTMLDivElement>(null);
  const [video, setVideo] = useState<HTMLVideoElement | null>(null);
  const [length, setLength] = useState(0); // the clip's frames, from the browser's duration
  const [now, setNow] = useState(0); // the frame the video shows
  const [range, setRange] = useState<number[] | null>(null); // the marks while one is dragged

  // The file browser renders the clip's <video>; the marks drive it.
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const find = () => setVideo(v => {
      const found = el.querySelector('video');
      return found === v ? v : found;
    });
    find();
    const observer = new MutationObserver(find);
    observer.observe(el, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!video) {
      setLength(0);
      return;
    }
    const meta = () => setLength(Number.isFinite(video.duration) ? Math.floor(video.duration * fps) : 0);
    const time = () => setNow(Math.min(Math.floor(video.currentTime * fps), Math.max(0, Math.floor(video.duration * fps) - 1)));
    if (video.readyState >= 1) meta();
    video.addEventListener('loadedmetadata', meta);
    video.addEventListener('timeupdate', time);
    video.addEventListener('seeked', time);
    return () => {
      video.removeEventListener('loadedmetadata', meta);
      video.removeEventListener('timeupdate', time);
      video.removeEventListener('seeked', time);
    };
  }, [video, fps]);

  // Another clip: the marks start over at the whole clip. None shown is not another clip: a graph opens with no results
  // until the store draws them (stored.ts), the same clip again.
  const clip = JSON.stringify(props.fieldOptions?.clip ? source?.split('?')[0] ?? null : props.value ?? null);
  const previous = useRef(clip);
  useEffect(() => {
    if (previous.current !== clip && clip !== 'null') {
      const opened = previous.current === 'null'; // the first clip a node shows keeps the marks it was saved with
      previous.current = clip;
      if (opened) return;
      props.updateStore(firstKey, 0);
      props.updateStore(framesKey, 0);
    }
  }, [clip]); // eslint-disable-line react-hooks/exhaustive-deps

  const end = count > 0 ? first + count : length;
  const [inMark, outMark] = range ?? [first, Math.max(first, end)];

  const seek = (frame: number) => {
    if (video) video.currentTime = (frame + 0.5) / fps;
  };
  const write = (from: number, to: number) => {
    props.updateStore(firstKey, from);
    props.updateStore(framesKey, length > 0 && to >= length ? 0 : Math.max(1, to - from));
  };
  const seconds = (frame: number) => `${(frame / fps).toFixed(2)} s`;

  return (
    <Box ref={box} sx={{ width: '100%' }}>
      {props.fieldOptions?.clip
        ? source
          ? <video src={`${config.serverAddress}${source}`} controls muted playsInline style={{ width: '100%', display: 'block' }} />
          : <Typography variant="body2" sx={{ p: 1, color: 'text.secondary' }}>Run the linked clip to mark the selection</Typography>
        : <FileBrowserField {...props} />}
      {video && length > 0 && (
        <Box data-key={`${props.fieldKey}-marks`} sx={{ px: 1, pb: 1 }}>
          <Slider
            className="nodrag"
            size="small"
            min={0}
            max={length}
            step={1}
            value={[inMark, outMark]}
            marks={cuts.filter(c => c > 0 && c < length).map(value => ({ value }))}
            disableSwap
            valueLabelDisplay="auto"
            valueLabelFormat={seconds}
            onChange={(_, value, thumb) => {
              const marks = value as number[];
              setRange(marks);
              seek(Math.min(marks[thumb], length - 1));
            }}
            onChangeCommitted={(_, value) => {
              const [from, to] = value as number[];
              setRange(null);
              write(from, to);
            }}
          />
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Button size="small" variant="outlined" onClick={() => write(Math.min(now, outMark - 1), outMark)}>In</Button>
            <Button size="small" variant="outlined" onClick={() => write(inMark, Math.max(now + 1, inMark + 1))}>Out</Button>
            <Button size="small" onClick={() => write(0, length)}>Whole</Button>
            <Typography variant="body2" sx={{ ml: 'auto' }}>
              {seconds(inMark)} – {seconds(outMark)} · {outMark - inMark} frames{outMark >= length ? ' (to the end)' : ''}
              {cuts.length ? ` · ${cuts.filter(c => inMark < c && c < outMark).length} cuts inside` : ''}
            </Typography>
          </Box>
        </Box>
      )}
    </Box>
  );
}
