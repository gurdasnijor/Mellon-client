import { useCallback, useEffect, useState } from 'react';

import CodeMirror from '@uiw/react-codemirror';
import { python } from '@codemirror/lang-python';
import { oneDark } from '@codemirror/theme-one-dark';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import FormControl from '@mui/material/FormControl';
import Link from '@mui/material/Link';
import MenuItem from '@mui/material/MenuItem';
import Select, { SelectChangeEvent } from '@mui/material/Select';
import Typography from '@mui/material/Typography';

import config from '../../app.config';
import {
  CODE_TEMPLATES,
  DEFAULT_CODE_TEMPLATE,
} from '../codeTemplates';
import { useWebsocketStore } from '../stores/useWebsocketStore';

const STORAGE_KEY = 'mellon-code-workspace-source';
const TERMINAL_STATUSES = new Set(['succeeded', 'failed', 'cancelled']);
const PYTHON_EXTENSIONS = [python()];

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
    () => localStorage.getItem(STORAGE_KEY) || DEFAULT_CODE_TEMPLATE.code,
  );
  const [templateId, setTemplateId] = useState(
    () => CODE_TEMPLATES.find(template => template.code === code)?.id || '',
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

  const submit = useCallback(async () => {
    if (submitting || (run && !TERMINAL_STATUSES.has(run.status))) {
      return;
    }
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
  }, [code, run, sid, submitting]);

  useEffect(() => {
    const handleRunShortcut = (event: KeyboardEvent) => {
      if (
        event.key === 'Enter'
        && (event.metaKey || event.ctrlKey)
        && !event.repeat
      ) {
        event.preventDefault();
        void submit();
      }
    };

    window.addEventListener('keydown', handleRunShortcut);
    return () => window.removeEventListener('keydown', handleRunShortcut);
  }, [submit]);

  const loadTemplate = (event: SelectChangeEvent) => {
    const nextTemplate = CODE_TEMPLATES.find(
      template => template.id === event.target.value,
    );
    if (!nextTemplate) return;
    setTemplateId(nextTemplate.id);
    setCode(nextTemplate.code);
    setError('');
    setRun(null);
  };

  const updateCode = (nextCode: string) => {
    setCode(nextCode);
    setTemplateId(
      CODE_TEMPLATES.find(template => template.code === nextCode)?.id || '',
    );
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
  const selectedTemplate = CODE_TEMPLATES.find(
    template => template.id === templateId,
  );

  return (
    <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column', p: 2, gap: 1.5 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        <FormControl size="small" sx={{ minWidth: 250 }}>
          <Select
            aria-label="Code template"
            value={templateId}
            onChange={loadTemplate}
            disabled={Boolean(isActive)}
          >
            <MenuItem value="" disabled>
              Custom code
            </MenuItem>
            {CODE_TEMPLATES.map(template => (
              <MenuItem key={template.id} value={template.id}>
                {template.label}
              </MenuItem>
            ))}
          </Select>
        </FormControl>
        <Button variant="contained" onClick={submit} disabled={submitting || Boolean(isActive)}>
          {submitting ? 'Submitting…' : 'Run Python ⌘↵'}
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
        {selectedTemplate && (
          <Typography variant="body2" color="text.secondary" sx={{ ml: 'auto' }}>
            {selectedTemplate.description}{' '}
            <Link href={selectedTemplate.sourceUrl} target="_blank" rel="noreferrer">
              Model card
            </Link>
          </Typography>
        )}
      </Box>

      {error && <Typography color="error">{error}</Typography>}

      <Box sx={{ flex: 1, minHeight: 0, display: 'grid', gridTemplateColumns: 'minmax(0, 3fr) minmax(320px, 2fr)', gap: 1.5 }}>
        <Box
          aria-label="Python code editor"
          sx={{
            minHeight: 0,
            overflow: 'hidden',
            border: '1px solid #444',
            borderRadius: 1,
            bgcolor: '#282c34',
            '& .cm-editor': {
              height: '100%',
              fontFamily: '"JetBrains Mono", monospace',
              fontSize: 13,
            },
            '& .cm-scroller': {
              overflow: 'auto',
            },
          }}
        >
          <CodeMirror
            value={code}
            height="100%"
            theme={oneDark}
            extensions={PYTHON_EXTENSIONS}
            onChange={updateCode}
            basicSetup={{
              autocompletion: true,
              bracketMatching: true,
              closeBrackets: true,
              foldGutter: true,
              highlightActiveLine: true,
              highlightActiveLineGutter: true,
              indentOnInput: true,
              lineNumbers: true,
            }}
          />
        </Box>

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
