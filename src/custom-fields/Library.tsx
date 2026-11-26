import { useState } from 'react';

import Button from '@mui/material/Button';
import Menu from '@mui/material/Menu';
import MenuItem from '@mui/material/MenuItem';
import ListItemText from '@mui/material/ListItemText';
import LibraryBooksOutlinedIcon from '@mui/icons-material/LibraryBooksOutlined';
import { enqueueSnackbar } from 'notistack';

import config from '../../app.config';
import { FieldProps } from '../components/NodeContent';
import { useFlowStore } from '../stores/useFlowStore';

type Entry = { key: string; name: string; modified: number | null; params: Record<string, unknown> };

// ours: the node's folder's library: the nodes of this folder stored before, newest first, from /listdir?path=store:<folder>.
// Picking one writes its params into this node, so the node has that node's key and is read from the store, with
// everything below it. It writes only params this node has, and never its own field. It says which fields it
// changed, so a value it replaces (a pasted link, where the stored node had none) isn't lost unseen.
export default function Library(props: FieldProps) {
  const folder: string | undefined = useFlowStore(s => s.nodes.find(n => n.id === props.nodeId)?.data.params.repo_id?.value);
  const params = useFlowStore(s => s.nodes.find(n => n.id === props.nodeId)?.data.params);
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const [entries, setEntries] = useState<Entry[] | null>(null);

  const open = async (target: HTMLElement) => {
    setAnchor(target);
    setEntries(null);
    try {
      const response = await fetch(`${config.serverAddress}/listdir?path=${encodeURIComponent(`store:${folder}`)}`);
      const data = await response.json();
      setEntries(data.error ? [] : data.files);
    } catch {
      setEntries([]);
    }
  };

  const pick = (entry: Entry) => {
    setAnchor(null);
    const changed: string[] = [];
    for (const [name, value] of Object.entries(entry.params)) {
      if (name !== props.fieldKey && params && name in params) {
        if (JSON.stringify(params[name].value ?? '') !== JSON.stringify(value ?? '')) changed.push(params[name].label || name);
        props.updateStore(name, value);
      }
    }
    if (changed.length) {
      const message = `${entry.name}, from the Library: ${changed.join(', ')} now as it was stored`;
      enqueueSnackbar(message, { variant: 'info', autoHideDuration: Math.max(message.length * 80, 4000) });
    }
  };

  return (
    <>
      <Button
        size="small"
        variant="outlined"
        fullWidth
        startIcon={<LibraryBooksOutlinedIcon />}
        disabled={props.disabled || !folder}
        onClick={e => open(e.currentTarget)}
        sx={{ my: 0.5 }}
        className="nodrag"
      >
        {props.label || 'Library'}
      </Button>
      <Menu anchorEl={anchor} open={!!anchor} onClose={() => setAnchor(null)}>
        {entries === null && <MenuItem disabled>Loading…</MenuItem>}
        {entries?.length === 0 && <MenuItem disabled>Nothing stored yet</MenuItem>}
        {entries?.map(entry => (
          <MenuItem key={entry.key} onClick={() => pick(entry)}>
            <ListItemText
              primary={entry.name}
              secondary={entry.modified ? new Date(entry.modified * 1000).toLocaleString() : undefined}
            />
          </MenuItem>
        ))}
      </Menu>
    </>
  );
}
