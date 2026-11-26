import { useCallback } from 'react';
import { useReactFlow, type Edge, type FitViewOptions, type Viewport } from '@xyflow/react';
import { enqueueSnackbar } from 'notistack';
import config from '../../app.config';
import { CustomNodeType, useFlowStore } from '../stores/useFlowStore';
import { useSavedGraphStore } from '../stores/useSavedGraphStore';
import { useSettingsStore } from '../stores/useSettingsStore';
import { unstored } from '../stores/stored';

// ours: how long after an open the view keeps fitting the graph as its nodes grow: the store's answer draws the stored
// results about half a second in, and their images and videos load after that
const SETTLING_MS = 8000;

// a graph's nodes without the sizes its file saved, so React Flow measures them as drawn: the shipped graphs share node
// ids, and a node kept on the canvas from the graph before isn't measured again, so it would keep its file's size
const unmeasured = (nodes: CustomNodeType[]) => nodes.map(n => ({ ...n, measured: undefined }));

const same = (a: Viewport, b: Viewport) => a.x === b.x && a.y === b.y && a.zoom === b.zoom;

/** Fits the view to the graph as the canvas is now (beside the sidebar if it is open), not at the transform its file
 * saved, and again each time its nodes' drawn sizes change while it settles, until the view is moved. */
function fitWhileSettling(fitView: (options?: FitViewOptions) => Promise<boolean>, getViewport: () => Viewport) {
  let fitted: Viewport | null = null;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const sizes = () => useFlowStore.getState().nodes.map(n => `${n.measured?.width}x${n.measured?.height}`).join();
  let last = sizes();
  const fit = async () => {
    if (fitted && !same(getViewport(), fitted)) return stop(); // moved: leave it where it was put
    await fitView();
    fitted = getViewport();
  };
  const unsubscribe = useFlowStore.subscribe(() => {
    const now = sizes();
    if (now === last) return;
    last = now;
    clearTimeout(timer);
    timer = setTimeout(fit, 150);
  });
  const stop = () => { unsubscribe(); clearTimeout(timer); clearTimeout(end); };
  const end = setTimeout(stop, SETTLING_MS);
  fit();
}

/** Opens a graph: from its path (the graph list, a drop of one of its entries, the Gallery's Open) or as read from a
 * dropped file (no path). Nothing stored and no result until the store says so, fitted to the canvas. */
export function useOpenGraph() {
  const { setNodes, setEdges, fitView, getViewport } = useReactFlow();
  const edgeType = useSettingsStore(state => state.edgeType);

  const show = useCallback((graph: { nodes: CustomNodeType[]; edges: Edge[] }) => {
    setNodes(unmeasured(unstored(graph.nodes)));
    setEdges(graph.edges.map((e: Edge) => ({ ...e, type: edgeType })));
    fitWhileSettling(fitView, getViewport);
  }, [setNodes, setEdges, fitView, getViewport, edgeType]);

  const open = useCallback(async (path: string) => {
    const response = await fetch(`${config.serverAddress}/file?file=${encodeURIComponent(path)}&t=${Date.now()}`);
    const graph = response.ok ? await response.json() : { error: response.statusText };
    if (graph.error) {
      const err = `Error fetching graph file: ${graph.error}`;
      enqueueSnackbar(err, { variant: 'error', autoHideDuration: err.length * 80 });
      return;
    }
    show(graph);
    // a saved graph (the store's) is written over only as it was opened; a graph from the list's own folders (a shipped
    // example) isn't saved, but a render of it files under its name there (graphs/h3/<name>/renders/), as a saved
    // graph's does under its own, which the Gallery shows
    const saved = path.startsWith('store:');
    const listed = path.lastIndexOf('/graphs/');
    useSavedGraphStore.getState().setSaved(saved ? path : null, saved ? response.headers.get('ETag') : null,
      saved ? path : listed >= 0 ? `store:graphs/${path.slice(listed + '/graphs/'.length)}` : null);
  }, [show]);

  return { open, show };
}
