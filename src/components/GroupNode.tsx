import { memo, useEffect, useState } from 'react';
import { Handle, NodeProps, Position, useUpdateNodeInternals } from '@xyflow/react';

import Box from '@mui/material/Box';
import IconButton from '@mui/material/IconButton';
import InputBase from '@mui/material/InputBase';
import Typography from '@mui/material/Typography';
import ArrowRightIcon from '@mui/icons-material/ArrowRight';
import ArrowDropDownIcon from '@mui/icons-material/ArrowDropDown';
import LinkOffIcon from '@mui/icons-material/LinkOff';

import { useShallow } from 'zustand/react/shallow';

import { CustomNodeType, useFlowStore } from '../stores/useFlowStore';
import { GROUP_HEADER, groupPorts, groupStatus, results } from './groups';
import NodeContent from './NodeContent';
import ErrorBoundary from './ErrorBoundary';


/**
 * ours: a group of nodes. Unfolded, a frame with a header over its members; folded, a card with the same header and a
 * port for every wire crossing the frame (wired by unfolding: the ports take no new wires).
 */
const GroupNode = memo((node: NodeProps<CustomNodeType>) => {
  const folded = !!node.data.collapsed;
  const setGroupData = useFlowStore(s => s.setGroupData);
  const ungroupNodes = useFlowStore(s => s.ungroupNodes);
  // as JSON, so the node draws again only when its ports or its members' state change
  const status: ReturnType<typeof groupStatus> = JSON.parse(useFlowStore(s => JSON.stringify(groupStatus(node.id, s.nodes))));
  const portsJson = useFlowStore(s => JSON.stringify(groupPorts(node.id, s.nodes, s.edges)));
  const { ins, outs }: ReturnType<typeof groupPorts> = JSON.parse(portsJson);
  const setParam = useFlowStore(s => s.setParam);
  const members = useFlowStore(useShallow(s => s.nodes.filter(n => n.parentId === node.id)));
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(node.data.label);
  const updateNodeInternals = useUpdateNodeInternals();

  useEffect(() => updateNodeInternals(node.id), [node.id, folded, portsJson, updateNodeInternals]);

  const rename = () => {
    setEditing(false);
    if (title.trim() && title !== node.data.label) setGroupData(node.id, { label: title.trim() });
    else setTitle(node.data.label);
  };
  const running = status.running;
  const failed = status.failed; // ours: the last run's, until the next
  const tone = running ? 'info.main' : failed ? 'error.main' : status.stored === status.count ? 'success.main' : 'text.secondary';

  // the face: each member's pinned fields, in the order pinned, under the member's name; then the output node's result
  const pinned = node.data.pinned ?? [];
  const faces = members
    .map(m => ({ m, fields: pinned.filter(p => p.node === m.id && m.data.params?.[p.field]).map(p => p.field) }))
    .filter(f => f.fields.length)
    .sort((a, b) => pinned.findIndex(p => p.node === a.m.id) - pinned.findIndex(p => p.node === b.m.id));
  const output = members.find(m => m.id === node.data.outputNode);
  // the fields drawn 1.4 times a node's, to be read at the zoom a graph of cards fits; a result scrolls past 480 px.
  // On a card a video is at most 480 px tall (a portrait clip drawn at the card's width is about 1,000), and text wraps
  // rather than scrolling sideways.
  const face = (m: CustomNodeType, only: string[], title: string, result = false) => (
    <Box key={`${title}:${m.id}`} data-key="face" sx={{ px: 1, pb: 1, '& .MuiBox-root': { mb: 0.5 } }}>
      <Typography sx={{ fontSize: '18px', color: 'warning.main', mb: 0.5 }}>{title}</Typography>
      <ErrorBoundary module={m.data.module || ''} action={m.data.action || ''}>
        <Box sx={{ zoom: 1.4, '& video': { maxHeight: 480 / 1.4 }, '& pre': { whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' },
          ...(result ? { maxHeight: 480 / 1.4, overflowY: 'auto' } : {}) }}>
        <NodeContent nodeId={m.id} params={m.data.params} only={only} updateStore={(p, v, k) => setParam(m.id, p, v, k)}
          module={m.data.module || ''} action={m.data.action || ''} />
        </Box>
      </ErrorBoundary>
    </Box>
  );

  return (
    <Box sx={{
      width: '100%', height: folded ? 'auto' : '100%',
      border: '2px solid', borderColor: node.selected ? 'primary.main' : 'rgba(255, 179, 0, 0.55)', borderRadius: 1,
      backgroundColor: folded ? 'background.paper' : 'rgba(255, 179, 0, 0.04)',
    }}>
      <Box sx={{ height: GROUP_HEADER, display: 'flex', alignItems: 'center', gap: 1, px: 1, backgroundColor: 'rgba(255, 179, 0, 0.12)' }}>
        <IconButton size="small" className="nodrag" title={folded ? 'Unfold' : 'Fold'} onClick={() => setGroupData(node.id, { collapsed: !folded })}>
          {folded ? <ArrowRightIcon sx={{ fontSize: '36px' }} /> : <ArrowDropDownIcon sx={{ fontSize: '36px' }} />}
        </IconButton>
        {editing
          ? <InputBase className="nodrag" autoFocus value={title} onChange={e => setTitle(e.target.value)} onBlur={rename}
              onKeyDown={e => { if (e.key === 'Enter') rename(); if (e.key === 'Escape') { setTitle(node.data.label); setEditing(false); } }}
              sx={{ flexGrow: 1, fontSize: '32px' }} />
          : <Typography sx={{ flexShrink: 0, maxWidth: '75%', fontSize: '32px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}
              title="Double-click to rename" onDoubleClick={() => { setTitle(node.data.label); setEditing(true); }}>{node.data.label}</Typography>}
        {/* the status gives way to the title, which keeps its width up to three quarters of the header */}
        <Typography data-key="group-status" title={!running && failed ? `${failed.label} failed: ${failed.error}` : `${status.stored} of ${status.count} stored`} sx={{
          flexShrink: 1, minWidth: 0, ml: 'auto', overflow: 'hidden', textOverflow: 'ellipsis',
          fontSize: '18px', px: 1, py: 0.25, borderRadius: 1, border: '1px solid', borderColor: tone, color: tone, whiteSpace: 'nowrap' }}>
          {running
            ? `running · ${running.label}${running.progress > 0 ? ` ${Math.round(running.progress)}%` : ''}`
            : failed ? `failed · ${failed.label}` : `${status.stored}/${status.count} stored`}
        </Typography>
        <IconButton className="nodrag" title="Ungroup" onClick={() => ungroupNodes(node.id)}><LinkOffIcon sx={{ fontSize: '28px' }} /></IconButton>
      </Box>
      {folded && (
        <Box sx={{ py: 1 }}>
          {failed && !running && <Typography data-key="group-failed" sx={{ px: 1.5, pb: 1, fontSize: '20px', color: 'error.main', overflowWrap: 'anywhere' }}>
            {failed.label} failed: {failed.error}</Typography>}
          {ins.map(p => (
            <Box key={p.id} sx={{ position: 'relative', px: 1.5, py: 0.25 }}>
              <Handle type="target" position={Position.Left} id={p.id} isConnectable={false} />
              <Typography sx={{ fontSize: '20px' }}>{p.label}</Typography>
            </Box>
          ))}
          {(faces.length > 0 || output) && (
            <Box className="nodrag nowheel" sx={{ my: 1, pt: 1, borderTop: '1px solid', borderBottom: '1px solid', borderColor: 'divider' }}>
              {faces.map(({ m, fields }) => face(m, fields, m.data.label))}
              {output && results(output).length > 0 && face(output, results(output), `Result · ${output.data.label}`, true)}
            </Box>
          )}
          {outs.map(p => (
            <Box key={p.id} sx={{ position: 'relative', px: 1.5, py: 0.25, textAlign: 'right' }}>
              <Handle type="source" position={Position.Right} id={p.id} isConnectable={false} />
              <Typography sx={{ fontSize: '20px' }}>{p.label}</Typography>
            </Box>
          ))}
          {!ins.length && !outs.length && <Typography sx={{ px: 1.5, fontSize: '20px', color: 'text.secondary' }}>No wires cross this group</Typography>}
        </Box>
      )}
    </Box>
  );
});

export default GroupNode;
