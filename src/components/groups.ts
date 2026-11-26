import type { Edge } from '@xyflow/react';

import type { CustomNodeType } from '../stores/useFlowStore';

// ours: groups, folded or not. Folding is drawn, never saved on the members: Workflow hides a folded group's members
// when it draws, gives the group a card's size and redraws every wire that crosses the group's frame to a port on the
// card. A wire keeps its id, so selecting or deleting it edits the stored edge.

// sized to be read with the whole graph in view, as the cards stand in for nodes several times their size
export const CARD_WIDTH = 600;
export const GROUP_HEADER = 72;
// a frame's padding around its members, and the gap between them
export const GROUP_PAD = 20;
const GAP = 80;

export type Port = { id: string; label: string };

const labelOf = (node: CustomNodeType | undefined) => node?.data.label || node?.id || '';
const paramLabel = (node: CustomNodeType | undefined, key: string | null | undefined) =>
  (key && node?.data.params?.[key]?.label) || key || '';

/** The folded group a node is drawn in, if any. */
function foldedParent(node: CustomNodeType | undefined, byId: Map<string, CustomNodeType>) {
  const parent = node?.parentId ? byId.get(node.parentId) : undefined;
  return parent?.data.collapsed ? parent : undefined;
}

/**
 * A group's card ports: one in-port per output from outside read inside (keyed by that output's node and handle), one
 * out-port per output inside read outside (keyed by its node and handle), in the stored edges' order.
 */
export function groupPorts(groupId: string, nodes: CustomNodeType[], edges: Edge[]): { ins: Port[]; outs: Port[] } {
  const byId = new Map(nodes.map(n => [n.id, n]));
  const inside = (id: string) => byId.get(id)?.parentId === groupId;
  const ins = new Map<string, Port>();
  const outs = new Map<string, Port>();
  for (const e of edges) {
    if (inside(e.target) && !inside(e.source)) {
      const source = byId.get(e.source);
      const from = foldedParent(source, byId) ?? source;
      ins.set(`in:${e.source}:${e.sourceHandle}`, { id: `in:${e.source}:${e.sourceHandle}`, label: `${paramLabel(source, e.sourceHandle)} from ${labelOf(from)}` });
    }
    if (inside(e.source) && !inside(e.target)) {
      const source = byId.get(e.source);
      outs.set(`out:${e.source}:${e.sourceHandle}`, { id: `out:${e.source}:${e.sourceHandle}`, label: `${labelOf(source)} · ${paramLabel(source, e.sourceHandle)}` });
    }
  }
  return { ins: [...ins.values()], outs: [...outs.values()] };
}

export const cardWidth = (group: Pick<CustomNodeType, 'data'>) => group.data.cardWidth ?? CARD_WIDTH;
/** How far an unfolded group's frame reaches past its card: what the row to its right moves along by. */
export const pastCard = (group: Pick<CustomNodeType, 'data' | 'width'>) => Math.max(0, (group.width ?? 0) - cardWidth(group));

type Size = { width: number; height: number };

/** What a node draws, previews included, which can reach past its measured box; nothing for a node not drawn. */
export function drawnSize(id: string): Size | undefined {
  const el = document.querySelector<HTMLElement>(`.react-flow__node[data-id="${CSS.escape(id)}"]`);
  return el ? { width: el.scrollWidth, height: el.scrollHeight } : undefined;
}

/**
 * The top-level nodes beside a group, to its right, moved `dx` along: a group unfolds (and ungroups) in place, so the
 * nodes its frame would cover move right by what the frame draws past its card, and back when it folds.
 */
export function pushRow(nodes: CustomNodeType[], group: CustomNodeType, dx: number, members = new Set<string>()): CustomNodeType[] {
  if (!dx) return nodes;
  const top = group.position.y, bottom = top + (group.height ?? 0);
  return nodes.map(n => !n.parentId && n.id !== group.id && !members.has(n.id) && n.position.x > group.position.x
    && n.position.y < bottom && n.position.y + (n.measured?.height ?? 0) >= top
    ? { ...n, position: { x: n.position.x + dx, y: n.position.y } } : n);
}

/**
 * A frame fitted to what its members draw: its columns (members at one x, as group.py lays them out) left to right and
 * each column's members top to bottom, in the order they stand, GAP apart, and the frame just holding them. It runs as a
 * group unfolds and as a member's size changes, so a frame fits before a run, and after it as results draw (a 720p clip
 * draws Clip 740 wide); group.py's frames are only where it starts.
 */
export function fitFrame(members: CustomNodeType[], sizes: Record<string, Size>) {
  const columns = new Map<number, CustomNodeType[]>();
  for (const m of [...members].sort((a, b) => a.position.x - b.position.x || a.position.y - b.position.y)) {
    columns.set(m.position.x, [...(columns.get(m.position.x) ?? []), m]);
  }
  const positions: Record<string, { x: number; y: number }> = {};
  let x = GROUP_PAD, bottom = 0;
  for (const column of columns.values()) {
    let y = GROUP_HEADER + GROUP_PAD;
    for (const m of column) {
      positions[m.id] = { x, y };
      y += sizes[m.id].height + GAP;
    }
    bottom = Math.max(bottom, y - GAP);
    x += Math.max(...column.map(m => sizes[m.id].width)) + GAP;
  }
  return { positions, width: x - GAP + GROUP_PAD, height: bottom + GROUP_PAD };
}

/** The nodes and wires as drawn: folded groups' members hidden, their wires on the cards' ports. */
export function foldView(nodes: CustomNodeType[], edges: Edge[]): { nodes: CustomNodeType[]; edges: Edge[] } {
  const byId = new Map(nodes.map(n => [n.id, n]));
  if (!nodes.some(n => n.data.type === 'group' && n.data.collapsed)) return { nodes, edges };
  return {
    nodes: nodes.map(n => {
      if (n.data.type === 'group' && n.data.collapsed) return { ...n, width: cardWidth(n), height: undefined };
      return foldedParent(n, byId) ? { ...n, hidden: true } : n;
    }),
    edges: edges.map(e => {
      const from = foldedParent(byId.get(e.source), byId);
      const to = foldedParent(byId.get(e.target), byId);
      if (from && from === to) return { ...e, hidden: true };
      if (!from && !to) return e;
      return {
        ...e,
        ...(from ? { source: from.id, sourceHandle: `out:${e.source}:${e.sourceHandle}` } : {}),
        ...(to ? { target: to.id, targetHandle: `in:${e.source}:${e.sourceHandle}` } : {}),
      };
    }),
  };
}

/** A group's members' state: how many are stored, and the one running with its progress (-1: no percentage). */
export function groupStatus(groupId: string, nodes: CustomNodeType[]) {
  const members = nodes.filter(n => n.parentId === groupId && n.data.module && n.data.action);
  const running = members.find(n => (n.data.progress ?? 0) !== 0);
  const failed = members.find(n => n.data.failed);
  const skipped = members.filter(n => n.data.skipped).length; // ours: the last run's, a lane past the plan's pieces
  return {
    stored: members.filter(n => n.data.isCached).length,
    count: members.length,
    running: running ? { label: labelOf(running), progress: running.data.progress ?? 0 } : null,
    failed: failed ? { label: labelOf(failed), error: failed.data.failed ?? '' } : null, // ours: the last run's failure
    // every member not stored was skipped by the last run: nothing for this group in it
    skipped: skipped > 0 && members.every(n => n.data.isCached || n.data.skipped),
  };
}

// the stock Dynamic Block node's own controls, never on a card
const CONTROLS = new Set(['repo_id', 'load_block_button', 'device', 'auto_offload', 'trust_remote_code']);

/** A node's fields a group can pin: what can be edited on it now (not a wire, a result or a block control). */
export function pinnable(node: Pick<CustomNodeType, 'data'>): string[] {
  return Object.entries(node.data.params ?? {})
    .filter(([key, p]) => !CONTROLS.has(key) && !p.hidden && !p.isInput && p.display !== 'input' && p.display !== 'output'
      && !String(p.display ?? '').startsWith('ui_'))
    .map(([key]) => key);
}

/** A node's result: the fields it shows what it made in. */
export const results = (node: Pick<CustomNodeType, 'data'>) =>
  Object.entries(node.data.params ?? {}).filter(([, p]) => !p.hidden && String(p.display ?? '').startsWith('ui_') && p.display !== 'ui_group').map(([key]) => key);

/**
 * A new group's face: its input node is the first member no other member feeds, with its editable fields pinned; its
 * output node is the last member read from outside the group, or the last member with a result.
 */
export function defaultFace(members: CustomNodeType[], edges: Edge[]) {
  const ids = new Set(members.map(m => m.id));
  const input = members.find(m => !edges.some(e => e.target === m.id && ids.has(e.source))) ?? members[0];
  const output = [...members].reverse().find(m => edges.some(e => e.source === m.id && !ids.has(e.target)))
    ?? [...members].reverse().find(m => results(m).length);
  return {
    inputNode: input?.id,
    outputNode: output?.id,
    pinned: input ? pinnable(input).map(field => ({ node: input.id, field })) : [],
  };
}
