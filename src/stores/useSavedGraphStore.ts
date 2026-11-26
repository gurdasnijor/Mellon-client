import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import type { Edge } from "@xyflow/react";
import { CustomNodeType, useFlowStore } from "./useFlowStore";

// ours: the saved graph the canvas was opened from (a store: path from /listgraphs) and its ETag, so that Save
// writes over it only as it was opened; null for a new graph, an example or a dropped file. Its renders file under
// `renders`: the saved graph's path, or for an example from the list the path it would have saved under its name.
// `opened` is the canvas as it was opened or saved (work()), so replacing it asks first only if it has edits since.
// Kept with the canvas (localStorage, as the canvas's own "reactflow"), so a reload keeps both: Save still writes over
// the graph it was opened from, and the canvas still knows whether it has edits.
type SavedGraphStore = {
    path: string | null;
    etag: string | null;
    renders: string | null;
    opened: string;
    setSaved: (path: string | null, etag: string | null, renders?: string | null, opened?: string) => void;
};

// a field showing what a node made, a run's result: not work
const result = (display?: string) => display === 'output' || (String(display ?? '').startsWith('ui_') && !['ui_button', 'ui_group'].includes(display ?? ''));

/** The work in a canvas, what replacing it would lose: each node's params as a run would send them (a seed the wand
 * rolls each run as "random", so a run rolling it is no edit, and one it doesn't as its number), the links, and the
 * groups' names and members. Not results, run status, where nodes sit or the view. */
export function work(nodes: CustomNodeType[], edges: Edge[]) {
    const params = (n: CustomNodeType) => Object.fromEntries(Object.entries(n.data.params ?? {})
        .filter(([, p]) => !result(p.display))
        .map(([k, p]) => [k, p.display !== 'random' || typeof p.value !== 'object' || !p.value ? p.value ?? null
            : p.value.isRandom ? 'random' : p.value.value]));
    return JSON.stringify({
        nodes: nodes.map(n => n.type === 'group' ? [n.id, n.data.label ?? null] : [n.id, n.parentId ?? null, params(n)]).sort(),
        edges: edges.map(e => [e.source, e.sourceHandle ?? null, e.target, e.targetHandle ?? null].join(' ')).sort(),
    });
}

const current = () => work(useFlowStore.getState().nodes, useFlowStore.getState().edges);

/** Whether the canvas has edits since it was opened or saved. */
export const edited = () => current() !== useSavedGraphStore.getState().opened;

export const useSavedGraphStore = create<SavedGraphStore>()(persist((set) => ({
    path: null,
    etag: null,
    renders: null,
    opened: work([], []),
    setSaved: (path, etag, renders = path, opened = current()) => set({ path, etag, renders, opened }),
}), {
    name: "saved-graph",
    storage: createJSONStorage(() => localStorage),
    partialize: ({ path, etag, renders, opened }) => ({ path, etag, renders, opened }),
}));

// ours: as the canvas does (useFlowStore), every tab follows the saved graph another tab writes, so a tab that takes in
// another's canvas also takes in where it was opened from, and whether it has edits is asked of that
window.addEventListener('storage', (event) => {
    if (event.key === useSavedGraphStore.persist.getOptions().name) useSavedGraphStore.persist.rehydrate();
});
