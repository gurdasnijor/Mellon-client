import { useEffect, useState } from 'react';

import config from '../../app.config';

// ours: a file in the store is named by its content and its own name (sha256:<hex>/<name>: an upload, or a file a
// Library pick wrote), and shows as that name. One named by its content alone (sha256:<hex>, a library entry written
// before names were kept) shows the name of the folder's library entry holding it: picks remember theirs; another (a
// graph saved with one, a reload) is looked up in the folder's library once per folder and page.
const names = new Map<string, string>();
const looked = new Map<string, Promise<void>>();

/** Remembers the name of the library entry a pick wrote these values from. */
export function remember(value: unknown, name: string) {
    for (const v of Array.isArray(value) ? value : [value]) {
        if (typeof v === 'string' && v.startsWith('sha256:')) names.set(v, name);
    }
}

function lookUp(folder: string) {
    if (!looked.has(folder)) {
        looked.set(folder, fetch(`${config.serverAddress}/listdir?path=${encodeURIComponent(`store:${folder}`)}`)
            .then(r => r.json())
            .then(data => { for (const e of data.files ?? []) for (const v of Object.values(e.params ?? {})) remember(v, e.name); })
            .catch(() => undefined));
    }
    return looked.get(folder)!;
}

/** A file in the store's own name, or for one named by its content alone its library name once known; undefined for
 * any other value. */
export function useStoredName(value: unknown, folder: string | undefined) {
    const own = typeof value === 'string' && value.startsWith('sha256:') ? value.split('/')[1] : undefined;
    const stored = typeof value === 'string' && value.startsWith('sha256:') && !own ? value : undefined;
    const [name, setName] = useState(stored && names.get(stored));
    useEffect(() => {
        setName(stored && names.get(stored));
        if (stored && !names.has(stored) && folder) lookUp(folder).then(() => setName(names.get(stored)));
    }, [stored, folder]);
    return own ?? name;
}
