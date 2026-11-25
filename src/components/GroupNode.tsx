import { memo, useEffect, useState } from 'react';
import { Handle, NodeProps, Position, useUpdateNodeInternals } from '@xyflow/react';

import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import IconButton from '@mui/material/IconButton';
import InputBase from '@mui/material/InputBase';
import Typography from '@mui/material/Typography';
import ArrowRightIcon from '@mui/icons-material/ArrowRight';
import ArrowDropDownIcon from '@mui/icons-material/ArrowDropDown';

import { CustomNodeType, useFlowStore } from '../stores/useFlowStore';
import { groupPorts, groupStatus } from './groups';

const HEADER = 48;

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

  return (
    <Box sx={{
      width: '100%', height: folded ? 'auto' : '100%',
      border: '2px solid', borderColor: node.selected ? 'primary.main' : 'rgba(255, 179, 0, 0.55)', borderRadius: 1,
      backgroundColor: folded ? 'background.paper' : 'rgba(255, 179, 0, 0.04)',
    }}>
      <Box sx={{ height: HEADER, display: 'flex', alignItems: 'center', gap: 1, px: 1, backgroundColor: 'rgba(255, 179, 0, 0.12)' }}>
        <IconButton size="small" className="nodrag" title={folded ? 'Unfold' : 'Fold'} onClick={() => setGroupData(node.id, { collapsed: !folded })}>
          {folded ? <ArrowRightIcon /> : <ArrowDropDownIcon />}
        </IconButton>
        {editing
          ? <InputBase className="nodrag" autoFocus value={title} onChange={e => setTitle(e.target.value)} onBlur={rename}
              onKeyDown={e => { if (e.key === 'Enter') rename(); if (e.key === 'Escape') { setTitle(node.data.label); setEditing(false); } }}
              sx={{ flexGrow: 1, fontSize: '18px' }} />
          : <Typography sx={{ flexGrow: 1, fontSize: '18px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}
              title="Double-click to rename" onDoubleClick={() => { setTitle(node.data.label); setEditing(true); }}>{node.data.label}</Typography>}
        <Typography data-key="group-status" sx={{ fontSize: '13px', px: 1, py: 0.25, borderRadius: 1, border: '1px solid',
          borderColor: running ? 'info.main' : status.stored === status.count ? 'success.main' : 'text.secondary',
          color: running ? 'info.main' : status.stored === status.count ? 'success.main' : 'text.secondary', whiteSpace: 'nowrap' }}>
          {running
            ? `running · ${running.label}${running.progress > 0 ? ` ${Math.round(running.progress)}%` : ''}`
            : `${status.stored} of ${status.count} stored`}
        </Typography>
        <Button size="small" className="nodrag" onClick={() => ungroupNodes(node.id)}>Ungroup</Button>
      </Box>
      {folded && (
        <Box sx={{ py: 1 }}>
          {ins.map(p => (
            <Box key={p.id} sx={{ position: 'relative', px: 1.5, py: 0.25 }}>
              <Handle type="target" position={Position.Left} id={p.id} isConnectable={false} />
              <Typography sx={{ fontSize: '13px' }}>{p.label}</Typography>
            </Box>
          ))}
          {outs.map(p => (
            <Box key={p.id} sx={{ position: 'relative', px: 1.5, py: 0.25, textAlign: 'right' }}>
              <Handle type="source" position={Position.Right} id={p.id} isConnectable={false} />
              <Typography sx={{ fontSize: '13px' }}>{p.label}</Typography>
            </Box>
          ))}
          {!ins.length && !outs.length && <Typography sx={{ px: 1.5, fontSize: '13px', color: 'text.secondary' }}>No wires cross this group</Typography>}
        </Box>
      )}
    </Box>
  );
});

export default GroupNode;
