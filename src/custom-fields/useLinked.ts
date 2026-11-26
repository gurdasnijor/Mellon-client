import { useFlowStore } from '../stores/useFlowStore';

/**
 * Ours: what a linked input shows: the value of the linking node's preview of the output linked in (a ui field whose
 * `dataSource` is that output), or undefined while the input is unlinked or its node hasn't run.
 */
export function useLinked(nodeId: string | undefined, key: string | undefined, display: string): unknown {
  return useFlowStore(s => {
    if (!key || !nodeId) return undefined;
    const edge = s.edges.find(e => e.target === nodeId && e.targetHandle === key);
    const source = edge && s.nodes.find(n => n.id === edge.source);
    if (!source) return undefined;
    const preview = Object.values(source.data.params as Record<string, { dataSource?: string; display?: string; value?: unknown }>)
      .find(p => p.dataSource === edge.sourceHandle && p.display === display);
    return preview?.value;
  });
}
