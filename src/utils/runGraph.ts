import { enqueueSnackbar } from "notistack";
import config from "../../app.config";
import { useFlowStore } from "../stores/useFlowStore";
import { useSavedGraphStore } from "../stores/useSavedGraphStore";

export const runGraph = async (sid: string, targetNodeId?: string | string[]) => {
    // ours: a run clears the last one's failures; a skip stays until the node runs, or the run says it skips it again,
    // so a lane past the plan stays hidden
    useFlowStore.setState(s => ({ nodes: s.nodes.map(n => n.data.failed ? { ...n, data: { ...n.data, failed: undefined } } : n) }));
    const graph = useFlowStore.getState().exportGraph(sid, targetNodeId);
    // ours: the canvas as it was run and the saved graph it was opened from, so the server can keep a render as a graph
    const canvas = { ...graph, canvas: useFlowStore.getState().toObject(), saved: useSavedGraphStore.getState().renders };

    try {
        const response = await fetch(`${config.serverAddress}/graph`, {
            method: 'POST',
            body: JSON.stringify(canvas),
            headers: {
                'Content-Type': 'application/json',
            },
        });

        const data = await response.json();
        if (data.error) {
            enqueueSnackbar(data.message, { variant: 'error', autoHideDuration: data.message.length * 80 });
            return;
        }
        console.info(data.message);
    } catch (error) {
        const err = `Error exporting graph: ${error}`;
        enqueueSnackbar(err, { variant: 'error', autoHideDuration: err.length * 80 });
        console.error(err);
    }
}