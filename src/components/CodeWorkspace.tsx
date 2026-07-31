import { useEffect, useState } from 'react';

import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Typography from '@mui/material/Typography';

import config from '../../app.config';
import { useWebsocketStore } from '../stores/useWebsocketStore';

const STORAGE_KEY = 'mellon-code-workspace-source';
const TERMINAL_STATUSES = new Set(['succeeded', 'failed', 'cancelled']);

const WAYPOINT_EXAMPLE = `import torch
from diffusers.modular_pipelines import ModularPipeline
from diffusers.utils import load_image, export_to_video

pipe = ModularPipeline.from_pretrained(
    "Overworld/Waypoint-1.5-1B", trust_remote_code=True
)
pipe.load_components(
    device_map="cuda", torch_dtype=torch.bfloat16, trust_remote_code=True
)
pipe.transformer.apply_inference_patches()
pipe.transformer.compile(fullgraph=True, mode="max-autotune", dynamic=False)

image = load_image(
    "https://huggingface.co/spaces/Overworld/waypoint-1-small/resolve/main/starter_18.png"
).resize((1024, 512))
state = pipe(
    image=image,
    prompt="An explorable world",
    button=set(),
    mouse=(0.0, 0.0),
    output_type="pil",
)

state.values["image"] = None
frames = []
for _ in range(150):
    state = pipe(
        state,
        button={87},
        mouse=(0.0, 0.0),
        output_type="pil",
    )
    frames.extend(state.values["images"])

export_to_video(frames, "waypoint-v1-5.mp4", fps=60)
`;

type Artifact = {
  path: string;
  size: number;
  url: string;
};

type CodeRun = {
  id: string;
  status: 'queued' | 'running' | 'succeeded' | 'failed' | 'cancelled';
  duration_seconds: number | null;
  exit_code: number | null;
  stdout: string;
  stderr: string;
  artifacts: Artifact[];
};

export default function CodeWorkspace() {
  const sid = useWebsocketStore(state => state.sid);
  const [code, setCode] = useState(
    () => localStorage.getItem(STORAGE_KEY) || WAYPOINT_EXAMPLE,
  );
  const [run, setRun] = useState<CodeRun | null>(null);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const runId = run?.id;
  const runStatus = run?.status;

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, code);
  }, [code]);

  useEffect(() => {
    if (!runId || !runStatus || TERMINAL_STATUSES.has(runStatus)) {
      return;
    }

    let cancelled = false;
    const poll = async () => {
      if (cancelled) return;
      try {
        const response = await fetch(`${config.serverAddress}/api/code/runs/${runId}`);
        const nextRun = await response.json();
        if (!response.ok) {
          throw new Error(nextRun.error || `Request failed with ${response.status}`);
        }
        if (!cancelled) {
          setRun(nextRun);
          if (!TERMINAL_STATUSES.has(nextRun.status)) {
            window.setTimeout(poll, 1000);
          }
        }
      } catch (pollError) {
        if (!cancelled) {
          setError(String(pollError));
        }
      }
    };

    const timer = window.setTimeout(poll, 500);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [runId, runStatus]);

  const submit = async () => {
    setSubmitting(true);
    setError('');
    try {
      const response = await fetch(`${config.serverAddress}/api/code/runs`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code, name: 'Python code', sid }),
      });
      const nextRun = await response.json();
      if (!response.ok) {
        throw new Error(nextRun.error || `Request failed with ${response.status}`);
      }
      setRun(nextRun);
    } catch (submitError) {
      setError(String(submitError));
    } finally {
      setSubmitting(false);
    }
  };

  const cancel = async () => {
    if (!run) return;
    setError('');
    try {
      const response = await fetch(
        `${config.serverAddress}/api/code/runs/${run.id}/cancel`,
        { method: 'POST' },
      );
      const nextRun = await response.json();
      if (!response.ok) {
        throw new Error(nextRun.error || `Request failed with ${response.status}`);
      }
      setRun(nextRun);
    } catch (cancelError) {
      setError(String(cancelError));
    }
  };

  const isActive = run && !TERMINAL_STATUSES.has(run.status);

  return (
    <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column', p: 2, gap: 1.5 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        <Button variant="contained" onClick={submit} disabled={submitting || Boolean(isActive)}>
          {submitting ? 'Submitting…' : 'Run Python'}
        </Button>
        <Button variant="outlined" onClick={cancel} disabled={!isActive}>
          Stop
        </Button>
        {run && (
          <Typography variant="body2" color="text.secondary">
            {run.status} · {run.id}
            {run.duration_seconds !== null ? ` · ${run.duration_seconds.toFixed(2)}s` : ''}
            {run.exit_code !== null ? ` · exit ${run.exit_code}` : ''}
          </Typography>
        )}
      </Box>

      {error && <Typography color="error">{error}</Typography>}

      <Box sx={{ flex: 1, minHeight: 0, display: 'grid', gridTemplateColumns: 'minmax(0, 3fr) minmax(320px, 2fr)', gap: 1.5 }}>
        <Box
          component="textarea"
          value={code}
          onChange={(event) => setCode(event.target.value)}
          spellCheck={false}
          sx={{
            width: '100%',
            height: '100%',
            resize: 'none',
            border: '1px solid #444',
            borderRadius: 1,
            bgcolor: '#111',
            color: '#ddd',
            p: 1.5,
            fontFamily: '"JetBrains Mono", monospace',
            fontSize: 13,
            lineHeight: 1.5,
            outline: 'none',
          }}
        />

        <Box sx={{ minHeight: 0, overflow: 'auto', bgcolor: '#111', border: '1px solid #444', borderRadius: 1, p: 1.5 }}>
          <Typography variant="subtitle2">stdout</Typography>
          <Box component="pre" sx={{ m: 0, mb: 2, whiteSpace: 'pre-wrap', color: '#ccc', fontSize: 12 }}>
            {run?.stdout || ''}
          </Box>

          <Typography variant="subtitle2">stderr</Typography>
          <Box component="pre" sx={{ m: 0, mb: 2, whiteSpace: 'pre-wrap', color: '#ff8a80', fontSize: 12 }}>
            {run?.stderr || ''}
          </Box>

          <Typography variant="subtitle2">outputs</Typography>
          {run?.artifacts?.length ? run.artifacts.map(artifact => (
            <Box key={artifact.path}>
              <a href={`${config.serverAddress}${artifact.url}`} target="_blank" rel="noreferrer">
                {artifact.path}
              </a>
              <Typography component="span" variant="caption" color="text.secondary">
                {' '}({artifact.size} bytes)
              </Typography>
            </Box>
          )) : (
            <Typography variant="body2" color="text.secondary">
              Files written with relative paths appear here.
            </Typography>
          )}
        </Box>
      </Box>
    </Box>
  );
}
