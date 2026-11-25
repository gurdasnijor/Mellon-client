import { create } from "zustand";

// ours: the saved graph the canvas was opened from (a store: path from /listgraphs) and its ETag, so that Save
// writes over it only as it was opened; null for a new graph, an example or a dropped file
type SavedGraphStore = {
    path: string | null;
    etag: string | null;
    setSaved: (path: string | null, etag: string | null) => void;
};

export const useSavedGraphStore = create<SavedGraphStore>((set) => ({
    path: null,
    etag: null,
    setSaved: (path, etag) => set({ path, etag }),
}));
