import config from '../../app.config';
import { CustomNodeType, useFlowStore } from './useFlowStore';
import { useTaskStore } from './useTaskStore';

// ours: the canvas shows what the store holds, never what a saved graph says. When the exported graph changes (a graph
// opened from the list, by Open or the Gallery's Open, or an edit that can move a key) and no task is running, its
// nodes go to POST /stored, which keys them as a run would and reads the store, running nothing; each node's isCached
// is set from the answer. One asked while a run started is dropped: the run's messages say what it stores.
let sent = '';
let timer: ReturnType<typeof setTimeout> | undefined;

async function check() {
  if (useTaskStore.getState().taskCount) return;
  const { nodes } = useFlowStore.getState().exportGraph('', undefined, true);
  const body = JSON.stringify({ nodes });
  if (body === sent || !Object.keys(nodes).length) return;
  sent = body;
  try {
    const response = await fetch(`${config.serverAddress}/stored`, { method: 'POST', body });
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

/** A graph's nodes as it opens: nothing stored until the store says so, whatever the file saved; asked even when the
 * graph is the one already open. */
export function unstored(nodes: CustomNodeType[]) {
  recheck();
  return nodes.map(n => ({ ...n, data: { ...n.data, isCached: false } }));
}

/** Asks again though the graph is unchanged: the server's welcome has just set every node's isCached from its memory. */
export function recheck() {
  sent = '';
  soon();
}
