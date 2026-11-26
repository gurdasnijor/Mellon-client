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

// whether a node shows a result
const shows = (n: CustomNodeType) => Object.values(n.data.params ?? {}).some(p => result(p) && (Array.isArray(p.value) ? p.value.length : p.value));

let sent = '';
let keys: Record<string, string | null> = {}; // the last answer
let timer: ReturnType<typeof setTimeout> | undefined;
let attaching = false; // ours: a page opened mid-run asks once, though a task runs

async function check() {
  const during = attaching;
  attaching = false;
  if (useTaskStore.getState().taskCount && !during) return;
  const { sid } = useWebsocketStore.getState();
  const { nodes, paths } = useFlowStore.getState().exportGraph(sid ?? '', undefined, true);
  const body = JSON.stringify({ nodes });
  if (body === sent || !Object.keys(nodes).length) return;
  sent = body;
  const show = useFlowStore.getState().nodes.filter(n => n.id in nodes && !shows(n)).map(n => n.id);
  try {
    const response = await fetch(`${config.serverAddress}/stored`, { method: 'POST', body: JSON.stringify({ nodes, paths, sid, show }) });
    if (!response.ok) throw new Error(response.statusText);
    const answer: Record<string, string | null> = await response.json(); // each node's key if stored
    if (during && body === sent) { // what the store holds so far, beside what the run's messages said meanwhile
      const cached = useFlowStore.getState().nodes.filter(n => n.data.isCached).map(n => n.id);
      return useFlowStore.getState().updateCacheStatus([...cached, ...Object.keys(answer).filter(id => answer[id])]);
    }
    if (body !== sent || useTaskStore.getState().taskCount) return;
    const before = keys;
    keys = answer;
    useFlowStore.getState().updateCacheStatus(Object.keys(answer).filter(id => answer[id]));
    // a node shows no result of another key: not stored, or stored under a key other than the last answer's (an edit
    // or a Library pick moved it), its results are cleared; a stored one's are drawn by asking again (it shows none).
    // Results are not in the body, and a node whose key stays is left alone, so this asks at most once more.
    const stale = (n: CustomNodeType) => n.id in answer && shows(n) && (!answer[n.id] || answer[n.id] !== before[n.id]);
    const cleared = useFlowStore.getState().nodes.filter(stale);
    if (cleared.length) {
      useFlowStore.setState(s => ({ nodes: s.nodes.map(n => stale(n) ? noResults(n) : n) }));
      if (cleared.some(n => answer[n.id])) recheck();
    }
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

/** A graph's nodes as it opens: nothing stored, running, failed or showing a result until the store says so, whatever
 * the file saved (its results are another server's /cache, its progress that of a run when it was saved); asked even
 * when the graph is the one already open. */
export function unstored(nodes: CustomNodeType[]) {
  recheck();
  return nodes.map(noResults).map(n => ({ ...n, data: { ...n.data, isCached: false, failed: undefined, skipped: false, progress: 0 } }));
}

/** A page opened or reconnected while a task runs: the server's memory isn't what the store holds, and the store check
 * waits for no task, so what the store holds so far is asked once, and the run's messages say what it stores after. */
export function attach() {
  useFlowStore.getState().updateCacheStatus([]);
  attaching = true;
  sent = '';
  soon();
}

/** Asks again though the graph is unchanged: the server's welcome has just set every node's isCached from its memory,
 * and a node not in it (cached) shows results from a server since restarted, whose /cache is gone: they are cleared,
 * for the store to draw. */
export function recheck(cached?: string[]) {
  if (cached) useFlowStore.setState(s => ({ nodes: s.nodes.map(n => cached.includes(n.id) ? n : noResults(n)) }));
  sent = '';
  soon();
}
