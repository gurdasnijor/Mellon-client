import config from '../../app.config';
import { CustomNodeType, useFlowStore } from './useFlowStore';
import { useTaskStore } from './useTaskStore';
import { useWebsocketStore } from './useWebsocketStore';

// ours: the canvas shows what the store holds, never what a saved graph says. When the exported graph changes (a graph
// opened from the list, by Open or the Gallery's Open, or an edit that can move a key) and no task is running, its
// nodes go to POST /stored, which keys them as a run would and reads the store, running nothing; each node's isCached
// is set from the answer. One asked while a run started is dropped: the run's messages say what it stores. The nodes
// showing no result yet are sent as show: the stored ones among them draw their results from the store, running nothing.

// a field showing what a node made (a ui_ field but a node's button and a group's frame)
const result = (p: { display?: string }) => String(p.display ?? '').startsWith('ui_') && !['ui_button', 'ui_group'].includes(p.display ?? '');

// a node as it was before any run, its results cleared
const noResults = (n: CustomNodeType) => !n.data.params ? n : { ...n, data: { ...n.data, params: Object.fromEntries(
  Object.entries(n.data.params).map(([k, p]) => [k, result(p) ? { ...p, value: undefined } : p])) } };

let sent = '';
let timer: ReturnType<typeof setTimeout> | undefined;

async function check() {
  if (useTaskStore.getState().taskCount) return;
  const { sid } = useWebsocketStore.getState();
  const { nodes, paths } = useFlowStore.getState().exportGraph(sid ?? '', undefined, true);
  const body = JSON.stringify({ nodes });
  if (body === sent || !Object.keys(nodes).length) return;
  sent = body;
  const show = useFlowStore.getState().nodes.filter(n => n.id in nodes && !Object.values(n.data.params ?? {})
    .some(p => result(p) && (Array.isArray(p.value) ? p.value.length : p.value))).map(n => n.id);
  try {
    const response = await fetch(`${config.serverAddress}/stored`, { method: 'POST', body: JSON.stringify({ nodes, paths, sid, show }) });
    if (!response.ok) throw new Error(response.statusText);
    const stored: Record<string, boolean> = await response.json();
    if (body !== sent || useTaskStore.getState().taskCount) return;
    useFlowStore.getState().updateCacheStatus(Object.keys(stored).filter(id => stored[id]));
  } catch (error) {
    if (body === sent) sent = '';
    console.error('Error asking the store what it holds:', error);
  }
}

const soon = () => {
  clearTimeout(timer);
  timer = setTimeout(check, 300);
};
useFlowStore.subscribe(soon);
useTaskStore.subscribe(soon);

/** A graph's nodes as it opens: nothing stored and no result until the store says so, whatever the file saved (its
 * results are another server's /cache); asked even when the graph is the one already open. */
export function unstored(nodes: CustomNodeType[]) {
  recheck();
  return nodes.map(noResults).map(n => ({ ...n, data: { ...n.data, isCached: false, failed: undefined } }));
}

/** Asks again though the graph is unchanged: the server's welcome has just set every node's isCached from its memory,
 * and a node not in it (cached) shows results from a server since restarted, whose /cache is gone: they are cleared,
 * for the store to draw. */
export function recheck(cached?: string[]) {
  if (cached) useFlowStore.setState(s => ({ nodes: s.nodes.map(n => cached.includes(n.id) ? n : noResults(n)) }));
  sent = '';
  soon();
}
