import { useEffect, useState } from 'react';

import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Slider from '@mui/material/Slider';
import Typography from '@mui/material/Typography';

import config from '../../app.config';
import { FieldProps } from '../components/NodeContent';
import { useFlowStore } from '../stores/useFlowStore';
import { useLinked } from './useLinked';

/**
 * Ours: split marks on a selection's track (`display: "custom.ClipSplits"`), for a str param holding the pieces' ends but
 * the last as JSON `[frame, …]` from the selection's first frame, or empty for the node to choose. The selection is
 * the one linked into `fieldOptions.selection`: the linking node's `first_frame` and `frames` (0: to the clip's end),
 * the clip its `fieldOptions.clip` input plays and the cuts its `fieldOptions.cuts` input shows, as ClipRange draws
 * them. Pieces of `fieldOptions.min` to `fieldOptions.max` frames read as fitting (Studio's 5 to 14.375 s).
 */
export default function ClipSplits(props: FieldProps) {
  const fps: number = props.fieldOptions?.fps ?? 24;
  const least: number = props.fieldOptions?.min ?? 120;
  const most: number = props.fieldOptions?.max ?? 345;
  const selector = useFlowStore(s => s.edges.find(e => e.target === props.nodeId && e.targetHandle === (props.fieldOptions?.selection ?? 'selection'))?.source);
  const first: number = useFlowStore(s => s.nodes.find(n => n.id === selector)?.data.params.first_frame?.value ?? 0);
  const count: number = useFlowStore(s => s.nodes.find(n => n.id === selector)?.data.params.frames?.value ?? 0);
  const linkedClip = useLinked(selector, props.fieldOptions?.clip, 'ui_video');
  const linkedCuts = useLinked(selector, props.fieldOptions?.cuts, 'ui_text');
  const source = ([linkedClip].flat()[0] as string | undefined) || undefined;
  const cuts: number[] = Array.isArray(linkedCuts) ? linkedCuts.filter((c): c is number => typeof c === 'number') : [];

  const [video, setVideo] = useState<HTMLVideoElement | null>(null);
  const [length, setLength] = useState(0); // the clip's frames, from the browser's duration
  const [now, setNow] = useState(0); // the frame the video shows
  const [drag, setDrag] = useState<number[] | null>(null); // the marks while one is dragged

  useEffect(() => {
    if (!video) return;
    const meta = () => setLength(Number.isFinite(video.duration) ? Math.floor(video.duration * fps) : 0);
    const time = () => setNow(Math.floor(video.currentTime * fps));
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

  const end = count > 0 ? first + count : length;
  let typed: unknown = [];
  try {
    typed = props.value ? JSON.parse(props.value) : [];
  } catch {
    typed = [];
  }
  const saved = (Array.isArray(typed) ? typed : []).filter((s): s is number => Number.isInteger(s)).map(s => s + first);
  const marks = drag ?? saved;

  const seek = (frame: number) => {
    if (video) video.currentTime = (frame + 0.5) / fps;
  };
  const write = (next: number[]) => {
    const inside = [...new Set(next)].filter(m => first < m && m < end).sort((a, b) => a - b);
    props.updateStore(props.fieldKey, inside.length ? JSON.stringify(inside.map(m => m - first)) : '');
  };
  const seconds = (frame: number) => `${(frame / fps).toFixed(2)} s`;
  const ends = [first, ...[...marks].sort((a, b) => a - b), end];
  const pieces = ends.slice(1).map((e, i) => e - ends[i]);
  const fits = pieces.length === 1 || pieces.every(p => least <= p && p <= most);
  const nearest = marks.reduce<number | null>((best, m) => (best === null || Math.abs(m - now) < Math.abs(best - now) ? m : best), null);

  return (
    <Box sx={{ width: '100%' }}>
      <Typography variant="body2" sx={{ px: 1, color: 'text.secondary' }}>{props.label}</Typography>
      {source
        ? <video ref={setVideo} src={`${config.serverAddress}${source}`} controls muted playsInline style={{ width: '100%', display: 'block' }} onLoadedMetadata={e => { e.currentTarget.currentTime = (first + 0.5) / fps; }} />
        : <Typography variant="body2" sx={{ p: 1, color: 'text.secondary' }}>Run the linked selection to mark its splits</Typography>}
      {video && end > first && (
        <Box data-key={`${props.fieldKey}-splits`} sx={{ px: 1, pb: 1 }}>
          <Slider
            className="nodrag"
            size="small"
            min={first}
            max={end}
            step={1}
            track={false}
            disabled={marks.length === 0}
            value={marks.length ? marks : [first]}
            sx={marks.length ? undefined : { '& .MuiSlider-thumb': { display: 'none' } }} // no splits: the track and its cuts only
            marks={cuts.filter(c => first < c && c < end).map(value => ({ value }))}
            valueLabelDisplay="auto"
            valueLabelFormat={f => seconds(f - first)}
            onChange={(_, value, thumb) => {
              const next = value as number[];
              setDrag(next);
              seek(next[thumb]);
            }}
            onChangeCommitted={(_, value) => {
              setDrag(null);
              write(value as number[]);
            }}
          />
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Button size="small" variant="outlined" disabled={now <= first || now >= end} onClick={() => write([...marks, now])}>Split</Button>
            <Button size="small" variant="outlined" disabled={nearest === null} onClick={() => write(marks.filter(m => m !== nearest))}>Remove</Button>
            <Button size="small" disabled={!marks.length} onClick={() => write([])}>Clear</Button>
            <Typography variant="body2" sx={{ ml: 'auto', color: fits ? undefined : 'error.main' }}>
              {marks.length ? pieces.map(p => seconds(p)).join(' · ') : 'Plan chooses'}
              {fits ? '' : ` · each piece ${seconds(least)} to ${seconds(most)}`}
            </Typography>
          </Box>
        </Box>
      )}
    </Box>
  );
}
