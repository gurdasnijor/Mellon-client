// ours: the Gallery, the renders kept as saved graphs (GET /renders), newest first, each with its videos as the store
// has them now: Assemble's once it is stored, else the takes so far, and how its run ended if it failed or was stopped.
// A click plays one; Open puts its canvas back.
import { useCallback, useEffect, useState } from 'react';
import config from '../../app.config';
import { useOpenGraph } from '../utils/openGraph';

import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import IconButton from '@mui/material/IconButton';
import List from '@mui/material/List';
import ListItemButton from '@mui/material/ListItemButton';
import ListItemText from '@mui/material/ListItemText';
import Typography from '@mui/material/Typography';
import CircularProgress from '@mui/material/CircularProgress';
import ReplayIcon from '@mui/icons-material/Replay';

type Video = { node: string; label: string | null; file: string };
// how the run ended, written into the render as it ends: none while it runs (or if its server stopped mid-run)
type Outcome = { state: 'done' | 'stopped' | 'failed'; error: string | null };
type Render = { path: string; graph: string | null; time: string; finished: boolean; videos: Video[]; outcome: Outcome | null };
const takes = (render: Render) => `${render.videos.length} take${render.videos.length === 1 ? '' : 's'}`;
const ended = (render: Render) =>
  render.outcome?.state === 'failed' ? `failed: ${render.outcome.error ?? 'unknown error'} · ${takes(render)}`
  : render.outcome?.state === 'stopped' ? `stopped · ${takes(render)}`
  : render.finished ? 'finished' : `${takes(render)} so far`;

const stream = (file: string) => `${config.serverAddress}/stream?file=${encodeURIComponent(file)}`;
// a render's name is its UTC time, 2026-11-25T19-11-56.975Z, which reads back as that instant
const when = (time: string) => new Date(time.replace(/T(\d\d)-(\d\d)-(\d\d)/, 'T$1:$2:$3')).toLocaleString();

export default function Gallery() {
  const [renders, setRenders] = useState<Render[]>([]);
  const [loading, setLoading] = useState(false);
  const [playing, setPlaying] = useState<{ path: string; file: string } | null>(null);
  const { open } = useOpenGraph(); // as a graph opens from the graph list: Save and a new run file under its composition

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch(`${config.serverAddress}/renders`);
      setRenders(response.ok ? await response.json() : []);
    } catch (error) {
      console.error('Error fetching renders:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <Box sx={{ p: 1, display: 'flex', alignItems: 'center', gap: 1 }}>
        <Typography sx={{ flex: 1, fontWeight: 'bold' }}>Renders</Typography>
        <IconButton size="small" title="Reload renders" color="primary" disabled={loading} onClick={load}>
          {loading ? <CircularProgress size={18} /> : <ReplayIcon fontSize="small" />}
        </IconButton>
      </Box>
      {!loading && renders.length === 0 && (
        <Typography variant="body2" color="text.secondary" sx={{ px: 2 }}>No renders yet.</Typography>
      )}
      <List dense disablePadding sx={{ overflowY: 'auto' }}>
        {renders.map(render => (
          <Box key={render.path} data-render={render.path} sx={{ borderBottom: '1px solid #303030', pb: 1 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', pr: 1 }}>
              <ListItemText
                sx={{ px: 2 }}
                primary={render.graph ?? 'Unsaved graph'}
                secondary={`${when(render.time)} · ${ended(render)}`}
                slotProps={{ secondary: { sx: { color: render.outcome?.state === 'failed' ? 'error.main' : undefined, overflowWrap: 'anywhere' } } }}
              />
              <Button size="small" variant="outlined" onClick={() => open(render.path)}>Open</Button>
            </Box>
            {render.videos.map((video, index) => (
              <ListItemButton
                key={video.file}
                dense
                selected={playing?.file === video.file}
                onClick={() => setPlaying(playing?.file === video.file ? null : { path: render.path, file: video.file })}
                sx={{ pl: 3 }}
              >
                <ListItemText primary={`▶ ${video.label ?? video.node}${render.videos.length > 1 ? ` ${index + 1}` : ''}`} />
              </ListItemButton>
            ))}
            {playing?.path === render.path && (
              <Box component="video" key={playing.file} src={stream(playing.file)} controls autoPlay
                sx={{ width: '100%', display: 'block', backgroundColor: '#000' }} />
            )}
          </Box>
        ))}
      </List>
    </Box>
  );
}
