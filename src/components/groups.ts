import type { Edge } from '@xyflow/react';

import type { CustomNodeType } from '../stores/useFlowStore';

// ours: groups, folded or not. Folding is drawn, never saved on the members: Workflow hides a folded group's members
// when it draws, gives the group a card's size and redraws every wire that crosses the group's frame to a port on the
// card. A wire keeps its id, so selecting or deleting it edits the stored edge.

export const CARD_WIDTH = 440;

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

/** The nodes and wires as drawn: folded groups' members hidden, their wires on the cards' ports. */
export function foldView(nodes: CustomNodeType[], edges: Edge[]): { nodes: CustomNodeType[]; edges: Edge[] } {
  const byId = new Map(nodes.map(n => [n.id, n]));
  if (!nodes.some(n => n.data.type === 'group' && n.data.collapsed)) return { nodes, edges };
  return {
    nodes: nodes.map(n => {
      if (n.data.type === 'group' && n.data.collapsed) return { ...n, width: CARD_WIDTH, height: undefined };
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
  return {
    stored: members.filter(n => n.data.isCached).length,
    count: members.length,
    running: running ? { label: labelOf(running), progress: running.data.progress ?? 0 } : null,
  };
}
