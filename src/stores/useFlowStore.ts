import { create } from 'zustand'
import { persist, createJSONStorage } from "zustand/middleware";
import { temporal, type ZundoOptions } from 'zundo'
import { NodeData, NodeParams } from './useNodeStore'
import { nanoid } from 'nanoid'
import {
    Node,
    Edge,
    OnNodesChange,
    OnEdgesChange,
    applyNodeChanges,
    applyEdgeChanges,
    NodeChange,
    EdgeChange,
    Connection,
    Viewport,
    getIncomers,
    getOutgoers
} from '@xyflow/react'

import config from '../../app.config'
import { defaultFace, fitFrame, GROUP_HEADER, GROUP_PAD, isResult, pastCard, pushRow } from '../components/groups'

export type CustomNodeType = Node<NodeData, NodeData['type']>
export interface CustomConnection extends Connection {
    edgeType?: 'default' | 'smoothstep' | 'straight' | 'step' | string;
}

export type FlowStore = {
    nodes: CustomNodeType[];
    edges: Edge[];
    viewport: Viewport;
    lastExecutionTime: number;

    // events
    onNodesChange: OnNodesChange<CustomNodeType>;
    onEdgesChange: OnEdgesChange<Edge>;
    onConnect: (conn: CustomConnection) => void;

    // actions
    addNode: (node: CustomNodeType) => void;
    removeNodes: (ids: string | string[]) => void;
    removeEdges: (id: string | string[]) => void;
    clearWorkflow: () => void;
    getParam: (id: string, param: string, key: keyof NodeParams) => any;
    setParam: (id: string, param: string, value: any, key?: keyof NodeParams) => void;
    setNodeSize: (id: string, width: number, height: number) => void;
    getNodeParamsValues: (id: string) => Record<string, any>;
    replaceNodeParams: (id: string, params: Partial<NodeParams>) => void;
    setAllEdgesType: (edgeType: 'default' | 'smoothstep') => void;
    updateHandleConnectionStatus: () => void;
    updateSignalValues: (edges: Edge | Edge[]) => void;
    getSignalValue: (id: string, param: string) => any;
    // ours: groups (groups.ts), skipped nodes, the store check's export
    groupNodes: (ids: string[], sizes?: Record<string, { width: number; height: number }>) => string | null;
    ungroupNodes: (id: string) => void;
    setGroupData: (id: string, data: Partial<Pick<NodeData, 'label' | 'collapsed' | 'outputNode' | 'pinned'>>) => void;
    fitGroup: (id: string, sizes: Record<string, { width: number; height: number }>) => void;
    setViewport: (viewport: Viewport) => void;
    setNodeCached: (id: string, cached: boolean, memoryUsage?: Record<string, number>, executionTime?: Record<string, number>, skipped?: boolean) => void;
    updateCacheStatus: (ids: string | string[], skipped?: string[]) => void;
    exportGraph: (sid: string, targetNodeId?: string | string[], check?: boolean) => APIGraphExport; // ours: or several, a folded card's ends
    updateProgress: (id: string, progress: number) => void;
    resetStatus: (cachedIds: string | string[]) => void;
    toObject: () => {
        nodes: CustomNodeType[];
        edges: Edge[];
        viewport: Viewport;
    };
}

type APINodeExport = {
    module: string;
    action: string;
    params: {
        [key: string]: {
            sourceId?: string;
            sourceKey?: string;
            value?: any;
            display?: string | string[];
            spawn?: boolean;
        }
    };
}

type APIGraphExport = {
    sid: string;
    nodes: { [key: string]: APINodeExport };
    paths: string[][];
}

// ours: undo history of the graph a user edits, not of what a run or the store says about it: a node's run state and
// results, selection and drawn size are left out (and an undo keeps the live ones: the store check answers for a node
// whose key it moves). Edits less than half a second apart are one step (a drag, typing in a field)
const RUN_STATE = ['isCached', 'skipped', 'failed', 'progress', 'memoryUsage', 'executionTime'] as const;
const graphOf = (state: Pick<FlowStore, 'nodes' | 'edges'>) => ({
    edges: state.edges.map(e => ({ ...e, selected: undefined })),
    nodes: state.nodes.map(n => ({ ...n, selected: undefined, dragging: undefined, measured: undefined, data: {
        ...Object.fromEntries(Object.entries(n.data).filter(([k]) => !(RUN_STATE as readonly string[]).includes(k))) as NodeData,
        params: Object.fromEntries(Object.entries(n.data.params ?? {}).map(([k, p]) => [k, isResult(p) ? { ...p, value: undefined } : p])),
    } })),
});
let lastEdit = 0;
const HISTORY: ZundoOptions<FlowStore, ReturnType<typeof graphOf>> = {
    partialize: graphOf,
    equality: (a, b) => JSON.stringify(a) === JSON.stringify(b),
    limit: 100,
    // zundo types `save` as setState; it is its _handleSet, which takes all four
    handleSet: save => (...args) => { if (Date.now() - lastEdit > 500) (save as (...a: typeof args) => void)(...args); lastEdit = Date.now(); },
};

export const useFlowStore = create<FlowStore>()(
    persist(temporal((set, get) => ({
        nodes: [],
        edges: [],
        viewport: {
            x: 0,
            y: 0,
            zoom: 1,
        },
        lastExecutionTime: 0,

        onNodesChange: async (changes: NodeChange<CustomNodeType>[]) => {
            const newNodes = applyNodeChanges(changes, get().nodes);
            set({ nodes: newNodes });

            // delete the server cache for the deleted nodes
            const deletedNodes = changes.filter(change => change.type === 'remove').map(change => change.id);
            if (deletedNodes.length > 0) {
                try {
                    const response = await fetch(`${config.serverAddress}/cache`, { method: 'DELETE', body: JSON.stringify({ nodes: deletedNodes }) });
                    if (!response.ok) {
                        throw new Error('Failed to delete cache');
                    }
                } catch (error) {
                    console.error('Failed to delete cache', error);
                }
            }
        },
        onEdgesChange: (changes: EdgeChange<Edge>[]) => {
            const removedEdges: Edge[] = [];
            changes.filter(change => change.type === 'remove').forEach(change => {
                const edge = get().edges.find(e => e.id === change.id);
                edge && removedEdges.push(edge);
                if (edge && edge.targetHandle) {
                    const node = get().nodes.find(n => n.id === edge.target);
                    if (!node) {
                        return;
                    }

                    // check if any field has to be converted from input to standard field
                    if (node.data.params?.[edge.targetHandle]?.isInput) {
                        get().setParam(node.id, edge.targetHandle, false, 'isInput');
                    }

                    // if it's a spawn handle, remove the spawned fields
                    if (node.data.params?.[edge.targetHandle]?.spawn) {
                        set({nodes: get().nodes.map(n => n.id === edge.target
                            ? { 
                                ...n, 
                                data: { 
                                    ...n.data, 
                                    params: Object.fromEntries(
                                        Object.entries(n.data.params).filter(([key]) => key !== edge.targetHandle)
                                    )
                                } 
                            }
                            : n)
                        });
                    }
                }
            });

            const newEdges = applyEdgeChanges(changes, get().edges);
            set({ edges: newEdges });
            if (removedEdges.length > 0) {
                get().updateHandleConnectionStatus();
                get().updateSignalValues(removedEdges);
            }
        },
        onConnect: (conn: CustomConnection) => {
            // Find existing edges that need to be removed (same target and targetHandle). Ie: only one connection per input handle
            const edgesToRemove = get().edges.filter(
                edge => edge.target === conn.target && edge.targetHandle === conn.targetHandle
            );
            // is this connection replacing an existing connection?
            const isReplace = edgesToRemove.length > 0;
            
            if (isReplace) {
                const isSpawn = get().getParam(conn.target, conn.targetHandle!, 'spawn');

                if (isSpawn) {
                    // It's a replacement on a spawn handle.
                    const edgeToUpdate = edgesToRemove[0];
                    const sourceNode = get().nodes.find(n => n.id === conn.source);
                    const handleType = sourceNode?.data.params?.[conn.sourceHandle || '']?.type || 'default';

                    const updatedEdge = { 
                        ...edgeToUpdate, 
                        source: conn.source, 
                        sourceHandle: conn.sourceHandle,
                        className: `category-${handleType}`,
                    };
                    
                    set({ edges: get().edges.map(e => e.id === edgeToUpdate.id ? updatedEdge : e) });
                    get().updateHandleConnectionStatus();
                    get().updateSignalValues(updatedEdge);
                    return;
                }

                // remove replaced edges for non-spawn handles
                get().removeEdges(edgesToRemove.map(edge => edge.id));

                // Ensure the isConnected is updated for the replaced edges
                setTimeout(() => {
                    get().onConnect(conn);
                }, 0);
                return;
            }
            
            const sourceNode = get().nodes.find(n => n.id === conn.source);
            const handleType = sourceNode?.data.params?.[conn.sourceHandle || '']?.type || 'default';
            
            const newEdge = {
                ...conn,
                id: nanoid(),
                type: conn.edgeType || 'default',
                className: `category-${handleType}`,
            };
            // ^^ Add zIndex:1000 to move the edge above the node

            const targetNode = get().nodes.find(n => n.id === conn.target);
            // check if the target handle is a spawn handle
            const isSpawn = get().getParam(conn.target, conn.targetHandle!, 'spawn');

            if (targetNode && isSpawn && !isReplace) {
                const keyBaseName = conn.targetHandle!.split('>>>')[0];
                const spawnFields = Object.keys(targetNode.data.params).filter(key => key.startsWith(keyBaseName));
                // limit the number of spawn fields to 64
                if (spawnFields.length > 63) {
                    return;
                }
                const newKeyName = `${keyBaseName}>>>${nanoid(6)}`;
                const nodeParams = targetNode.data.params[conn.targetHandle!];
    
                // if the label is not set, use the key base name with uppercase first letter
                if (!nodeParams.label) {
                    nodeParams.label = keyBaseName.charAt(0).toUpperCase() + keyBaseName.slice(1);
                }
    
                // reorder the params so the spawned fields are grouped together
                const newParams: { [key: string]: NodeParams } = {};
                Object.entries(targetNode.data.params).forEach(([key, value]) => {
                    newParams[key] = value;
                    if (key === conn.targetHandle) {
                        newParams[newKeyName] = {...nodeParams };
                    }
                });
                set({ nodes: get().nodes.map(n => n.id === targetNode.id ? { ...n, data: { ...n.data, params: newParams } } : n) });
            }

            // Add the new edge to the current edges
            set({ edges: [...get().edges, newEdge] });
            get().updateHandleConnectionStatus();
            get().updateSignalValues(newEdge);
        },
        updateSignalValues: (edges: Edge | Edge[]) => {
            if (!edges) {
                return;
            }
            const edgesArray = Array.isArray(edges) ? edges : [edges];
            edgesArray.forEach(edge => {
                const sourceNode = get().nodes.find(n => n.id === edge.source);
                const targetNode = get().nodes.find(n => n.id === edge.target);
                if (!sourceNode || !targetNode || !('data' in sourceNode) || !('data' in targetNode)) {
                    return;
                }
                const sourceSignal = sourceNode!.data.params?.[edge.sourceHandle!]?.signal;
                const targetSignal = targetNode!.data.params?.[edge.targetHandle!]?.signal;
                const sourceIsConnected = sourceNode!.data.params?.[edge.sourceHandle!]?.isConnected;
                const targetIsConnected = targetNode!.data.params?.[edge.targetHandle!]?.isConnected;
                const sourceIsDisabled = sourceNode!.data.params?.[edge.sourceHandle!]?.disabled || false;
                const targetIsDisabled = targetNode!.data.params?.[edge.targetHandle!]?.disabled || false;

                // if either the source or target handle is disabled, do nothing
                if (sourceIsDisabled || targetIsDisabled) {
                    return;
                }

                if (sourceSignal) {
                    // if this is not the source of the signal, reset the signal value if the handle is not connected
                    if (!sourceIsConnected && !sourceSignal.origin) {
                        get().setParam(edge.source, edge.sourceHandle!, { ...sourceSignal, value: undefined }, 'signal');
                    }

                    // if the signal direction is output we can update the target if it's not an origin itself
                    if (sourceIsConnected && sourceSignal.direction === 'output' && !targetSignal?.origin) {
                        get().setParam(edge.target, edge.targetHandle!, { ...sourceSignal, origin: undefined }, 'signal');
                    }
                }
                if (targetSignal) {
                    if (!targetIsConnected && !targetSignal.origin) {
                        get().setParam(edge.target, edge.targetHandle!, { ...targetSignal, value: undefined }, 'signal');
                    }

                    if (targetIsConnected && targetSignal.direction === 'input' && !sourceSignal?.origin) {
                        get().setParam(edge.source, edge.sourceHandle!, { ...targetSignal, origin: undefined }, 'signal');
                    }
                }
            });
        },
        getSignalValue: (id: string, param: string) => {
            const node = get().nodes.find(n => n.id === id);
            if (!node) {
                return undefined;
            }
            const signal = node.data.params?.[param]?.signal;
            return signal ? signal.value : undefined;
        },
        updateHandleConnectionStatus: () => {
            const edges = get().edges;

            // filter nodes that have a source or target connection
            get().nodes.map(node => {
                Object.keys(node.data.params)
                    .filter(k => node.data.params[k].display === 'input' || node.data.params[k].display === 'output')
                    .forEach(key => {
                        const param = node.data.params[key];
                        let isConnected = false;
                        if (param.display === 'input') {
                            isConnected = edges.some(e => e.target === node.id && e.targetHandle === key);
                        } else if (param.display === 'output') {
                            isConnected = edges.some(e => e.source === node.id && e.sourceHandle === key);
                        }
                        get().setParam(node.id, key, isConnected, 'isConnected');
                    });
                });
        },
        addNode: (node: CustomNodeType) => {
            set({ nodes: [...get().nodes, node] });
        },
        removeNodes: (ids: string | string[]) => {
            const idsArray = Array.isArray(ids) ? ids : [ids];
            set({ nodes: get().nodes.filter(n => !idsArray.includes(n.id)) });
            set({ edges: get().edges.filter(e => !idsArray.includes(e.source) && !idsArray.includes(e.target)) });
        },
        removeEdges: (ids: string | string[]) => {
            const changes: EdgeChange<Edge>[] = Array.isArray(ids)
                ? ids.map(id => ({ id, type: 'remove' }))
                : [{ id: ids, type: 'remove' }];
            get().onEdgesChange(changes);
        },
        clearWorkflow: () => {
            const nodeIds = get().nodes.map(n => n.id);

            // Update UI state immediately for instant feedback
            set({ nodes: [], edges: [], viewport: { x: 0, y: 0, zoom: 1 }, lastExecutionTime: 0 });

            // Delete cache from the server in the background (don't await)
            if (nodeIds.length > 0) {
                fetch(`${config.serverAddress}/cache`, { 
                    method: 'DELETE', 
                    body: JSON.stringify({ nodes: nodeIds }) 
                }).catch(error => {
                    console.error('Failed to delete cache', error);
                });
            }
        },
        getParam: (id: string, param: string, key: keyof NodeParams) => {
            const node = get().nodes.find(n => n.id === id);
            if (!node) return null;
            return node.data.params?.[param]?.[key];
        },
        setParam: (id: string, param: string, value: any, key?: keyof NodeParams) => {
            key = key || 'value';
            set((state) => {
                const node = state.nodes.find(n => n.id === id);
                if (!node) return state;

                // Create a new nodes array with the updated node
                const updatedNodes = state.nodes.map(n => {
                    if (n.id !== id) return n;
                    
                    return {
                        ...n,
                        data: {
                            ...n.data,
                            params: {
                                ...n.data.params,
                                [param]: {
                                    ...n.data.params[param],
                                    [key]: value
                                }
                            }
                        }
                    };
                });

                return { nodes: updatedNodes };
            });
        },
        setNodeSize: (id: string, width: number, height: number) => {
            set((state) => {
                const node = state.nodes.find(n => n.id === id);
                if (!node) return state;
                return {
                    nodes: state.nodes.map(n => n.id === id ? { ...n, width, height } : n)
                };
            });
        },
        getNodeParamsValues: (id: string) => {
            const node = get().nodes.find(n => n.id === id);
            if (!node) return {};
            return Object.fromEntries(
                Object.entries(node.data.params)
                    .filter(([_key, value]) => {
                        const display = value.display;
                        // TODO: include input and output params by following the connections
                        return display !== 'input' && display !== 'output';
                    })
                    .map(([key, value]) => [key, value.value ?? value.default])
            );
            //return Object.fromEntries(Object.entries(node.data.params).map(([key, value]) => [key, value.value]));
        },
        replaceNodeParams: (id: string, params: Record<string, any>) => {
            // Get the current node to access its current params
            const currentNode = get().nodes.find(n => n.id === id);
            if (!currentNode) return;

            // Store edges that are connected to the node
            const connectedEdges = get().edges.filter(e => e.source === id || e.target === id);
            
            // Store connection information for handles that exist in both old and new params
            const preservedConnections: Edge[] = [];
            
            connectedEdges.forEach(edge => {
                // Check if the handle still exists in the new params
                const handleName = edge.source === id ? edge.sourceHandle : edge.targetHandle;
                if (handleName && params[handleName]) {
                    // This handle still exists, preserve the connection
                    preservedConnections.push(edge);
                }
            });

            // Remove all edges connected to the node
            get().removeEdges(connectedEdges.map(e => e.id));

            // Update the node params
            set((state) => {
                const node = state.nodes.find(n => n.id === id);
                if (!node) return state;
                return { nodes: state.nodes.map(n => n.id === id ? { ...n, data: { ...n.data, params } } : n) };
            });

            // Recreate connections for handles that still exist
            preservedConnections.forEach(edge => {
                const connection: CustomConnection = {
                    source: edge.source,
                    target: edge.target,
                    sourceHandle: edge.sourceHandle || null,
                    targetHandle: edge.targetHandle || null,
                    edgeType: edge.type as 'default' | 'smoothstep' | 'straight' | 'step' | string
                };
                get().onConnect(connection);
            });
        },
        setAllEdgesType: (edgeType: 'default' | 'smoothstep') => {
            set((state) => {
                const updatedEdges = state.edges.map(edge => ({
                    ...edge,
                    type: edgeType
                }));
                return { edges: updatedEdges };
            });
        },
        // ours: a group of nodes not in one (no groups in groups), framed around what they draw (`sizes`, from the
        // canvas, since a node's preview can draw past its measured box), and its members back where they were when
        // it's ungrouped. Grouping nodes all ungrouped from one group brings back its face (title, pins, input, output,
        // folded or not) rather than a new one's
        groupNodes: (ids: string[], sizes?: Record<string, { width: number; height: number }>) => {
            const nodes = get().nodes.filter(n => ids.includes(n.id) && n.data.type !== 'group' && !n.parentId);
            if (nodes.length === 0) return null;
            const size = (n: CustomNodeType) => sizes?.[n.id] ?? { width: n.measured?.width ?? 0, height: n.measured?.height ?? 0 };
            const pad = GROUP_PAD, header = GROUP_HEADER;
            const was = new Set(nodes.map(n => JSON.stringify(n.data.ungrouped ?? null))).size === 1 ? nodes[0].data.ungrouped : undefined;
            const members = new Set(nodes.map(n => n.id));
            const face = defaultFace(nodes, get().edges);

            const minX = Math.min(...nodes.map(n => n.position.x));
            const minY = Math.min(...nodes.map(n => n.position.y));
            const maxX = Math.max(...nodes.map(n => n.position.x + size(n).width));
            const maxY = Math.max(...nodes.map(n => n.position.y + size(n).height));

            const groupNode: CustomNodeType = {
                id: nanoid(),
                type: 'group',
                width: maxX - minX + 2 * pad,
                height: maxY - minY + 2 * pad + header,
                data: {
                    type: 'group',
                    label: was?.label ?? 'Group',
                    category: 'group',
                    module: '',
                    action: '',
                    params: {},
                    collapsed: !!was?.collapsed,
                    ...face,
                    ...(was ? {
                        inputNode: was.inputNode && members.has(was.inputNode) ? was.inputNode : face.inputNode,
                        outputNode: was.outputNode && members.has(was.outputNode) ? was.outputNode : face.outputNode,
                        pinned: (was.pinned ?? []).filter(p => members.has(p.node)),
                        cardWidth: was.cardWidth,
                    } : {}),
                },
                position: {
                    x: minX - pad,
                    y: minY - pad - header,
                },
            };
            // folded again, the row to its right comes back by what ungrouping it moved it along
            const row = pushRow(get().nodes, groupNode, -(was?.pushed ?? 0), members);
            set(() => ({
                nodes: [groupNode, ...row.map(n => members.has(n.id)
                    ? {
                        ...n,
                        data: { ...n.data, ungrouped: undefined },
                        parentId: groupNode.id,
                        position: { x: n.position.x - groupNode.position.x, y: n.position.y - groupNode.position.y },
                        extent: 'parent' as const,
                    }
                    : n)],
            }));
            return groupNode.id;
        },
        ungroupNodes: (id: string) => {
            set((state) => {
                const group = state.nodes.find(n => n.id === id);
                if (!group) return state;
                const { label, collapsed, inputNode, outputNode, pinned, cardWidth: width } = group.data;
                // a folded group's members are laid out as its frame, which the row to its right moves along for
                const pushed = collapsed ? pastCard(group) : 0;
                const row = pushRow(state.nodes, group, pushed);
                return {
                    nodes: row.filter(n => n.id !== id).map(n => {
                        if (n.parentId !== id) return n;
                        const member = {
                            ...n,
                            data: { ...n.data, ungrouped: { label, collapsed, inputNode, outputNode, pinned, cardWidth: width, pushed } },
                            position: { x: n.position.x + group.position.x, y: n.position.y + group.position.y },
                        };
                        delete member.parentId;
                        delete member.extent;
                        return member;
                    }),
                };
            });
        },
        setGroupData: (id: string, data: Partial<Pick<NodeData, 'label' | 'collapsed'>>) => {
            const fold = 'collapsed' in data; // ours: folding shows the graph another way, no undo step
            if (fold) useFlowStore.temporal.getState().pause();
            set((state) => {
                const group = state.nodes.find(n => n.id === id);
                if (!group) return state;
                // unfolding draws the frame where the card was: the row to its right moves along, and back on folding
                const turned = fold && !!data.collapsed !== !!group.data.collapsed;
                const dx = turned ? pastCard(group) * (data.collapsed ? -1 : 1) : 0;
                return { nodes: pushRow(state.nodes, group, dx).map(n => n.id === id ? { ...n, data: { ...n.data, ...data } } : n) };
            });
            if (fold) useFlowStore.temporal.getState().resume();
        },
        // an unfolded group's members laid out and its frame fitted to them as they draw (`sizes`), the row to its right
        // moving along by what the frame's width changed
        fitGroup: (id: string, sizes: Record<string, { width: number; height: number }>) => {
            useFlowStore.temporal.getState().pause(); // part of the unfold it follows, not a step of its own
            set((state) => {
                const group = state.nodes.find(n => n.id === id);
                const members = state.nodes.filter(n => n.parentId === id && sizes[n.id]);
                if (!group || group.data.collapsed || !members.length) return state;
                const fit = fitFrame(members, sizes);
                const { width, height } = fit;
                const moved = members.some(m => fit.positions[m.id].x !== m.position.x || fit.positions[m.id].y !== m.position.y);
                if (!moved && width === group.width && height === group.height) return state;
                return {
                    nodes: pushRow(state.nodes, group, pastCard({ ...group, width }) - pastCard(group)).map(n => n.id === id ? { ...n, width, height }
                        : n.parentId === id && fit.positions[n.id] ? { ...n, position: fit.positions[n.id] } : n),
                };
            });
            useFlowStore.temporal.getState().resume();
        },
        setViewport: (viewport: Viewport) => {
            set({ viewport });
        },

        setNodeCached: (id: string, isCached: boolean, memoryUsage?: Record<string, number>, executionTime?: Record<string, number>, skipped = false) => {
            set((state) => {
                const node = state.nodes.find(n => n.id === id);
                if (!node) return state;
                return {
                    nodes: state.nodes.map(n => n.id === id ? { ...n, data: { ...n.data, isCached, skipped, memoryUsage: !isCached ? undefined : memoryUsage || n.data.memoryUsage || {}, executionTime: !isCached ? undefined : executionTime || n.data.executionTime || {} } } : n)
                };
            });
        },

        updateCacheStatus: (ids: string | string[], skipped?: string[]) => {
            const cached = Array.isArray(ids) ? ids : [ids]
            // set all nodes in `cached` to true and all others to false
            set((state) => {
                return {
                    nodes: state.nodes.map(n => ({ ...n, data: { ...n.data, isCached: cached.includes(n.id), ...(skipped ? { skipped: skipped.includes(n.id) } : {}) } })) // ours: skipped, the store check's
                };
            });
        },

        exportGraph: (sid: string, targetNodeId?: string | string[], check = false) => { // ours: check, for the store check (stored.ts); several targets, a folded card's ends
            const { nodes, edges } = get();
            // ours: several targets, as a folded card's ▶ runs every member no other member reads
            const targets = targetNodeId === undefined ? [] : [targetNodeId].flat();
            const sessionId = sid || '';
            
            // Filter out group nodes and nodes without module/action
            const executableNodes = nodes.filter(node => 
                node.data.type !== 'group' && 
                node.data.module && 
                node.data.action
            );
            
            if (executableNodes.length === 0) {
                return {
                    sid: sessionId,
                    nodes: {},
                    paths: []
                };
            }
            
            // If targetNodeId is provided, validate it exists
            for (const target of targets) {
                if (!executableNodes.some(node => node.id === target)) {
                    throw new Error(`Target node with id ${target} not found in executable nodes`);
                }
            }
            
            // Helper function to get incoming nodes
            const getIncomingNodes = (nodeId: string): CustomNodeType[] => {
                const node = executableNodes.find(n => n.id === nodeId);
                if (!node) return [];
                return getIncomers(node, executableNodes, edges);
            };
            
            // Helper function to get outgoing nodes
            const getOutgoingNodes = (nodeId: string): CustomNodeType[] => {
                const node = executableNodes.find(n => n.id === nodeId);
                if (!node) return [];
                return getOutgoers(node, executableNodes, edges);
            };
            
            // Helper function to walk backwards from a node and collect all dependencies
            const walkBackwards = (nodeId: string, visited = new Set<string>()): string[] => {
                if (visited.has(nodeId)) {
                    return [];
                }
                
                visited.add(nodeId);
                
                // Get all incoming nodes (dependencies)
                const incomingNodes = getIncomingNodes(nodeId);
                
                // Recursively collect dependencies from incoming nodes
                const dependencies: string[] = [];
                for (const node of incomingNodes) {
                    dependencies.push(...walkBackwards(node.id, visited));
                }
                
                // Add current node after its dependencies
                dependencies.push(nodeId);
                
                return dependencies;
            };
            
            // Determine which nodes to include in the export
            let nodesToInclude: string[] = [];
            
            if (targets.length) {
                // For partial export: only include nodes needed for the targets
                nodesToInclude = [...new Set(targets.flatMap(target => walkBackwards(target)))];
            } else {
                // For full export: find output nodes and include all nodes in their paths
                const outputNodes = executableNodes.filter(node => {
                    const outgoers = getOutgoingNodes(node.id);
                    return outgoers.length === 0;
                });
                
                const endNodes = outputNodes.length > 0 ? outputNodes : executableNodes;
                
                // Collect all nodes from all paths
                const allPathNodes = new Set<string>();
                endNodes.forEach(node => {
                    const path = walkBackwards(node.id);
                    path.forEach(nodeId => allPathNodes.add(nodeId));
                });
                
                nodesToInclude = Array.from(allPathNodes);
            }
            
            // Filter executable nodes to only include those in the path
            const filteredExecutableNodes = executableNodes.filter(node => 
                nodesToInclude.includes(node.id)
            );
            
            // Build the nodes object for APIGraphExport
            const nodesExport: { [key: string]: APINodeExport } = {};
            
            filteredExecutableNodes.forEach((node) => {
                // Build params object for this node
                const params: APINodeExport['params'] = {};
                
                Object.entries(node.data.params || {}).forEach(([paramName, paramData]) => {
                    // skip output params
                    if (paramData.display === 'output') {
                        return;
                    }

                    // handle special random field (ours: not when only asking what is stored, stored.ts: nothing is
                    // rolled or written back, and a seed is sent as it stands)
                    if (paramData.display === 'random' && !check) {
                        const fieldValue = typeof paramData.value === 'object' && 'value' in paramData.value
                            ? paramData.value.value
                            : paramData.value;
                        const isRandom = typeof paramData.value === 'object' && 'isRandom' in paramData.value
                            ? paramData.value.isRandom
                            : false;
                        if (isRandom) {
                            paramData.value = Math.floor(Math.random() * Number.MAX_SAFE_INTEGER);
                            get().setParam(node.id, paramName, { value: paramData.value, isRandom });
                        } else {
                            paramData.value = fieldValue;
                        }
                    }

                    // ours: nor a result's value, which no key reads and showing results would change (stored.ts);
                    // a seed the wand rolls each run is asked about as "random", which no run sends, so the node and
                    // what follows it read as not stored, as the run will find them
                    const rolled = typeof paramData.value === 'object' && paramData.value && 'value' in paramData.value;
                    const param: APINodeExport['params'][string] = {
                        display: paramData.display,
                        value: check && String(paramData.display ?? '').startsWith('ui_') ? undefined
                            : check && paramData.display === 'random' && rolled
                            ? (paramData.value.isRandom ? 'random' : paramData.value.value)
                            : paramData.value,
                    };
                    if (paramData.spawn) {
                        param.spawn = true;
                    }
                    
                    // Check if this parameter has incoming connections
                    // since inputs can only have one connection, we capture the single source
                    const incomingEdge = edges.find(edge => 
                        edge.target === node.id && 
                        edge.targetHandle === paramName
                    );
                    
                    if (incomingEdge) {
                        param.sourceId = incomingEdge.source;
                        param.sourceKey = incomingEdge.sourceHandle || undefined;
                    } else if (paramData.dataSource) {
                        param.sourceKey = paramData.dataSource;
                    }
                    
                    params[paramName] = param;
                });
                
                nodesExport[node.id] = {
                    module: node.data.module,
                    action: node.data.action,
                    params
                };
            });
            
            // Generate paths
            const paths: string[][] = [];
            
            if (targets.length) {
                // For partial export: a path to each target node
                for (const target of targets) {
                    const path = walkBackwards(target);
                    if (path.length > 0) {
                        paths.push(path);
                    }
                }
            } else {
                // For full export: paths from all output nodes
                const outputNodes = executableNodes.filter(node => {
                    const outgoers = getOutgoingNodes(node.id);
                    return outgoers.length === 0;
                });
                
                const endNodes = outputNodes.length > 0 ? outputNodes : executableNodes;
                
                // Generate paths starting from each output node
                endNodes.forEach(node => {
                    const path = walkBackwards(node.id);
                    if (path.length > 0) {
                        paths.push(path);
                    }
                });
            }
            
            return {
                sid: sessionId,
                nodes: nodesExport,
                paths
            };
        },
        updateProgress: (id: string, progress: number) => {
            set((state) => {
                const node = state.nodes.find(n => n.id === id);
                if (!node) return state;
                // ours: a node running isn't skipped, whatever the last run did
                return { nodes: state.nodes.map(n => n.id === id ? { ...n, data: { ...n.data, progress, ...(progress ? { skipped: false } : {}) } } : n) };
            });
        },
        resetStatus: (cachedIds: string | string[]) => {
            // reset the cache status for the given ids
            get().updateCacheStatus(cachedIds);

            // zero the progress for all nodes
            get().nodes.forEach(node => {
                if (node.data.progress && node.data.progress !== 0) {
                    get().updateProgress(node.id, 0);
                }
            });

            const currentNodes = get().nodes;
            const currentEdges = get().edges;
            const currentViewport = get().viewport;
            useFlowStore.temporal.getState().pause(); // ours: a redraw, no undo step
            set({ nodes: [], edges: [], viewport: { x: 0, y: 0, zoom: 1 }, lastExecutionTime: 0 });
            queueMicrotask(() => {
                set({ nodes: currentNodes, edges: currentEdges, viewport: currentViewport });
                useFlowStore.temporal.getState().resume();
            });
        },
        toObject: () => {
            return {
                nodes: get().nodes,
                edges: get().edges,
                viewport: get().viewport
            };
        }
    }), HISTORY), // ours: undo
    {
        name: "reactflow",
        storage: createJSONStorage(() => localStorage),
        partialize: (state) => ({
            nodes: state.nodes,
            edges: state.edges,
            viewport: state.viewport,
        }),
    })
)

// ours: one canvas per page address. persist rewrites the saved canvas from whichever tab changes state last, a tab in
// the background too (each one's welcome on a reconnect), so a tab holding an older graph put it back over the one in
// use, and the page reopened on that. Every tab follows the saved canvas instead: another tab's write is taken in here,
// so what any tab writes back is the latest canvas, and a reload restores what was last on screen.
window.addEventListener('storage', (event) => {
    if (event.key !== useFlowStore.persist.getOptions().name) return;
    const graph = JSON.stringify(graphOf(useFlowStore.getState()));
    useFlowStore.persist.rehydrate();
    // another tab's graph: this one's steps are of the graph it replaced (not when it only writes back run state)
    if (JSON.stringify(graphOf(useFlowStore.getState())) !== graph) useFlowStore.temporal.getState().clear();
});

/** ours: an undo or redo (none while a node runs), keeping each node's live run state and results */
export function undo(redo = false) {
    const live = new Map(useFlowStore.getState().nodes.map(n => [n.id, n]));
    const history = useFlowStore.temporal.getState();
    if ([...live.values()].some(n => (n.data.progress ?? 0) !== 0)) return;
    history.pause();
    if (redo) history.redo(); else history.undo();
    useFlowStore.setState(s => ({ nodes: s.nodes.map(n => {
        const was = live.get(n.id);
        if (!was) return n;
        const params = Object.fromEntries(Object.entries(n.data.params ?? {}).map(([k, p]) => [k, isResult(p) ? { ...p, value: was.data.params?.[k]?.value } : p]));
        return { ...n, selected: was.selected, measured: was.measured, data: { ...n.data, ...Object.fromEntries(RUN_STATE.map(k => [k, was.data[k]])), params } };
    }) }));
    history.resume();
}
