import React, { useState, useRef, useEffect, useMemo } from 'react';
import {
  Plus,
  ZoomIn,
  ZoomOut,
  Maximize2,
  GitBranch,
  Link2,
  Trash2,
  Sparkles,
  BookOpen,
  Flame,
  Check,
  X,
  ArrowRight,
  Network,
  Layers,
} from 'lucide-react';
import {
  Flashcard,
  MindMap,
  MindMapEdge,
  MindMapNode,
  MindMapNodeColor,
  NodeMastery,
  Topic,
} from '../types/study';
import { formatDueRelative } from '../utils/srs';

interface MindMapWorkspaceProps {
  topics: Topic[];
  mindmaps: MindMap[];
  flashcards: Flashcard[];
  selectedMapId: string | null;
  onSelectMap: (id: string) => void;
  onSaveMindMap: (map: MindMap) => Promise<void>;
  onDeleteMindMap: (id: string) => Promise<void>;
  onCreateFlashcard: (card: Flashcard) => Promise<void>;
  onLaunchBlurtFromMap: (mapId: string) => void;
  onNavigateToFlashcards: (topicId?: string) => void;
  onCreateTopic: (topic: Topic) => Promise<void>;
}

const NODE_WIDTH = 256;
const NODE_HEIGHT = 124;

const COLOR_STYLES: Record<
  MindMapNodeColor,
  { border: string; accentBar: string; dot: string; label: string }
> = {
  slate: {
    border: 'border-slate-300',
    accentBar: 'bg-slate-600',
    dot: 'bg-slate-600',
    label: 'Slate',
  },
  azure: {
    border: 'border-sky-300',
    accentBar: 'bg-sky-600',
    dot: 'bg-sky-600',
    label: 'Azure',
  },
  emerald: {
    border: 'border-emerald-300',
    accentBar: 'bg-emerald-600',
    dot: 'bg-emerald-600',
    label: 'Emerald',
  },
  amber: {
    border: 'border-amber-300',
    accentBar: 'bg-amber-600',
    dot: 'bg-amber-600',
    label: 'Amber',
  },
  rose: {
    border: 'border-rose-300',
    accentBar: 'bg-rose-600',
    dot: 'bg-rose-600',
    label: 'Rose',
  },
  violet: {
    border: 'border-violet-300',
    accentBar: 'bg-violet-600',
    dot: 'bg-violet-600',
    label: 'Violet',
  },
};

const MASTERY_META: Record<NodeMastery, { symbol: string; label: string; colorClass: string }> = {
  mastered: { symbol: '●', label: 'Mastered', colorClass: 'text-emerald-700' },
  learning: { symbol: '◐', label: 'Learning', colorClass: 'text-amber-700' },
  untested: { symbol: '○', label: 'Untested', colorClass: 'text-slate-500' },
};

export const MindMapWorkspace: React.FC<MindMapWorkspaceProps> = ({
  topics,
  mindmaps,
  flashcards,
  selectedMapId,
  onSelectMap,
  onSaveMindMap,
  onDeleteMindMap,
  onCreateFlashcard,
  onLaunchBlurtFromMap,
  onNavigateToFlashcards,
  onCreateTopic,
}) => {
  const activeMap = useMemo(() => {
    if (selectedMapId) {
      const found = mindmaps.find((m) => m.id === selectedMapId);
      if (found) return found;
    }
    return mindmaps[0] || null;
  }, [mindmaps, selectedMapId]);

  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null);
  const [connectingFromNodeId, setConnectingFromNodeId] = useState<string | null>(null);

  // Canvas pan & zoom
  const [pan, setPan] = useState<{ x: number; y: number }>({ x: 40, y: 20 });
  const [zoom, setZoom] = useState<number>(0.95);
  const [isPanning, setIsPanning] = useState<boolean>(false);
  const panStartRef = useRef<{ x: number; y: number; panX: number; panY: number } | null>(null);

  // Node dragging state
  const [draggingNodeId, setDraggingNodeId] = useState<string | null>(null);
  const [localNodes, setLocalNodes] = useState<MindMapNode[]>([]);
  const dragOffsetRef = useRef<{ startMouseX: number; startMouseY: number; origX: number; origY: number } | null>(
    null
  );

  // New Mind Map Modal state
  const [showNewMapForm, setShowNewMapForm] = useState(false);
  const [newMapTitle, setNewMapTitle] = useState('');
  const [newMapDescription, setNewMapDescription] = useState('');
  const [newMapTopicId, setNewMapTopicId] = useState<string>(
    topics[0]?.id || '__new__'
  );
  const [newTopicTitleInput, setNewTopicTitleInput] = useState('');

  // Key term input in inspector
  const [newKeyTermInput, setNewKeyTermInput] = useState('');
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [confirmDeleteMap, setConfirmDeleteMap] = useState(false);

  const canvasContainerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (activeMap) {
      setLocalNodes(activeMap.nodes);
      if (
        !selectedNodeId ||
        !activeMap.nodes.some((n) => n.id === selectedNodeId)
      ) {
        setSelectedNodeId(activeMap.nodes[0]?.id || null);
      }
    } else {
      setLocalNodes([]);
      setSelectedNodeId(null);
    }
    setConfirmDeleteMap(false);
  }, [activeMap?.id, activeMap?.nodes]);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => {
      setToastMessage((prev) => (prev === msg ? null : prev));
    }, 3200);
  };

  const selectedNode = useMemo(
    () => localNodes.find((n) => n.id === selectedNodeId) || null,
    [localNodes, selectedNodeId]
  );

  const selectedEdge = useMemo(
    () => activeMap?.edges.find((e) => e.id === selectedEdgeId) || null,
    [activeMap?.edges, selectedEdgeId]
  );

  const nodeFlashcardsMap = useMemo(() => {
    const map: Record<string, Flashcard[]> = {};
    for (const fc of flashcards) {
      if (fc.sourceNodeId) {
        if (!map[fc.sourceNodeId]) map[fc.sourceNodeId] = [];
        map[fc.sourceNodeId].push(fc);
      }
    }
    return map;
  }, [flashcards]);

  // Fit view helper
  const handleFitView = () => {
    if (!localNodes.length || !canvasContainerRef.current) {
      setPan({ x: 40, y: 20 });
      setZoom(1);
      return;
    }
    const rect = canvasContainerRef.current.getBoundingClientRect();
    const minX = Math.min(...localNodes.map((n) => n.x));
    const maxX = Math.max(...localNodes.map((n) => n.x + NODE_WIDTH));
    const minY = Math.min(...localNodes.map((n) => n.y));
    const maxY = Math.max(...localNodes.map((n) => n.y + NODE_HEIGHT));

    const contentW = Math.max(400, maxX - minX + 120);
    const contentH = Math.max(300, maxY - minY + 120);

    const scaleX = rect.width / contentW;
    const scaleY = rect.height / contentH;
    const nextZoom = Math.min(1.15, Math.max(0.5, Math.min(scaleX, scaleY)));

    const centerX = (minX + maxX) / 2;
    const centerY = (minY + maxY) / 2;

    setZoom(Math.round(nextZoom * 100) / 100);
    setPan({
      x: Math.round(rect.width / 2 - centerX * nextZoom),
      y: Math.round(rect.height / 2 - centerY * nextZoom),
    });
  };

  // Auto-layout functions (Radial or Horizontal Hierarchy)
  const handleAutoLayout = async (mode: 'radial' | 'horizontal') => {
    if (!activeMap || localNodes.length === 0) return;

    const rootNode = localNodes[0];
    const updatedNodes: MindMapNode[] = localNodes.map((n) => ({ ...n }));

    if (mode === 'radial') {
      const centerX = 480;
      const centerY = 280;
      updatedNodes[0].x = centerX;
      updatedNodes[0].y = centerY;

      const others = updatedNodes.slice(1);
      const radiusX = 360;
      const radiusY = 230;
      others.forEach((node, idx) => {
        const angle = (2 * Math.PI * idx) / Math.max(1, others.length) - Math.PI / 2;
        node.x = Math.round(centerX + radiusX * Math.cos(angle));
        node.y = Math.round(centerY + radiusY * Math.sin(angle));
      });
    } else {
      // Horizontal tree BFS layout
      const adjacency: Record<string, string[]> = {};
      for (const e of activeMap.edges) {
        if (!adjacency[e.source]) adjacency[e.source] = [];
        adjacency[e.source].push(e.target);
      }

      const visited = new Set<string>([rootNode.id]);
      const levels: string[][] = [[rootNode.id]];
      let currentLevel = [rootNode.id];

      while (currentLevel.length > 0) {
        const nextLevel: string[] = [];
        for (const nid of currentLevel) {
          for (const childId of adjacency[nid] || []) {
            if (!visited.has(childId)) {
              visited.add(childId);
              nextLevel.push(childId);
            }
          }
        }
        if (nextLevel.length > 0) levels.push(nextLevel);
        currentLevel = nextLevel;
      }

      // Add any disconnected nodes to level 1
      const unvisited = updatedNodes.filter((n) => !visited.has(n.id)).map((n) => n.id);
      if (unvisited.length > 0) {
        if (levels.length > 1) levels[1].push(...unvisited);
        else levels.push(unvisited);
      }

      levels.forEach((lvlIds, colIdx) => {
        const totalHeight = lvlIds.length * 160;
        const startY = Math.max(60, 300 - totalHeight / 2);
        lvlIds.forEach((id, rowIdx) => {
          const target = updatedNodes.find((n) => n.id === id);
          if (target) {
            target.x = 100 + colIdx * 340;
            target.y = Math.round(startY + rowIdx * 165);
          }
        });
      });
    }

    setLocalNodes(updatedNodes);
    await onSaveMindMap({
      ...activeMap,
      nodes: updatedNodes,
      updatedAt: Date.now(),
    });
    showToast(`Applied ${mode === 'radial' ? 'Radial' : 'Horizontal Tree'} layout`);
  };

  // Canvas pointer handlers
  const handleCanvasMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    if ((e.target as HTMLElement).closest('[data-node-card="true"]')) return;
    if ((e.target as HTMLElement).closest('[data-edge-interactive="true"]')) return;

    if (connectingFromNodeId) {
      setConnectingFromNodeId(null);
      return;
    }

    setSelectedEdgeId(null);
    setIsPanning(true);
    panStartRef.current = {
      x: e.clientX,
      y: e.clientY,
      panX: pan.x,
      panY: pan.y,
    };
  };

  const handleCanvasMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (draggingNodeId && dragOffsetRef.current) {
      const dx = (e.clientX - dragOffsetRef.current.startMouseX) / zoom;
      const dy = (e.clientY - dragOffsetRef.current.startMouseY) / zoom;
      const nextX = Math.round(dragOffsetRef.current.origX + dx);
      const nextY = Math.round(dragOffsetRef.current.origY + dy);

      setLocalNodes((prev) =>
        prev.map((n) => (n.id === draggingNodeId ? { ...n, x: nextX, y: nextY } : n))
      );
      return;
    }

    if (isPanning && panStartRef.current) {
      const dx = e.clientX - panStartRef.current.x;
      const dy = e.clientY - panStartRef.current.y;
      setPan({
        x: panStartRef.current.panX + dx,
        y: panStartRef.current.panY + dy,
      });
    }
  };

  const handleCanvasMouseUp = async () => {
    if (draggingNodeId && activeMap) {
      const draggedId = draggingNodeId;
      setDraggingNodeId(null);
      dragOffsetRef.current = null;
      await onSaveMindMap({
        ...activeMap,
        nodes: localNodes,
        updatedAt: Date.now(),
      });
      return draggedId;
    }
    if (isPanning) {
      setIsPanning(false);
      panStartRef.current = null;
    }
  };

  const handleWheel = (e: React.WheelEvent<HTMLDivElement>) => {
    if (e.ctrlKey || e.metaKey || Math.abs(e.deltaY) > 0) {
      e.preventDefault();
      const factor = e.deltaY < 0 ? 0.08 : -0.08;
      setZoom((prev) => Math.min(1.65, Math.max(0.45, Math.round((prev + factor) * 100) / 100)));
    }
  };

  // Start dragging a node or complete a connection
  const handleNodeMouseDown = async (e: React.MouseEvent, node: MindMapNode) => {
    e.stopPropagation();

    if (connectingFromNodeId && activeMap) {
      if (connectingFromNodeId !== node.id) {
        const exists = activeMap.edges.some(
          (edge) =>
            (edge.source === connectingFromNodeId && edge.target === node.id) ||
            (edge.source === node.id && edge.target === connectingFromNodeId)
        );
        if (!exists) {
          const newEdge: MindMapEdge = {
            id: `edge-${Date.now()}`,
            source: connectingFromNodeId,
            target: node.id,
            label: 'relates to',
            style: 'solid',
          };
          await onSaveMindMap({
            ...activeMap,
            edges: [...activeMap.edges, newEdge],
            updatedAt: Date.now(),
          });
          showToast(`Connected "${node.label}"`);
        }
      }
      setConnectingFromNodeId(null);
      setSelectedNodeId(node.id);
      return;
    }

    setSelectedNodeId(node.id);
    setSelectedEdgeId(null);
    setDraggingNodeId(node.id);
    dragOffsetRef.current = {
      startMouseX: e.clientX,
      startMouseY: e.clientY,
      origX: node.x,
      origY: node.y,
    };
  };

  // Add child node from currently selected node (or standalone root node)
  const handleAddNode = async (parentNode?: MindMapNode) => {
    if (!activeMap) return;
    const baseNode = parentNode || selectedNode || localNodes[0];
    const angle = (localNodes.length * 1.1) % (2 * Math.PI);
    const newX = baseNode ? Math.round(baseNode.x + 310 * Math.cos(angle)) : 400;
    const newY = baseNode ? Math.round(baseNode.y + 180 * Math.sin(angle)) : 240;

    const newNode: MindMapNode = {
      id: `node-${Date.now()}`,
      label: 'New Concept',
      summary: '',
      keyTerms: [],
      x: newX,
      y: newY,
      color: baseNode ? baseNode.color : 'azure',
      mastery: 'untested',
    };

    const nextNodes = [...localNodes, newNode];
    const nextEdges = baseNode
      ? [
          ...activeMap.edges,
          {
            id: `edge-${Date.now()}`,
            source: baseNode.id,
            target: newNode.id,
            label: '',
          },
        ]
      : activeMap.edges;

    setLocalNodes(nextNodes);
    setSelectedNodeId(newNode.id);
    setSelectedEdgeId(null);

    await onSaveMindMap({
      ...activeMap,
      nodes: nextNodes,
      edges: nextEdges,
      updatedAt: Date.now(),
    });
  };

  // Update node properties from inspector
  const handleUpdateSelectedNode = async (patch: Partial<MindMapNode>) => {
    if (!activeMap || !selectedNode) return;
    const nextNodes = localNodes.map((n) =>
      n.id === selectedNode.id ? { ...n, ...patch } : n
    );
    setLocalNodes(nextNodes);
    await onSaveMindMap({
      ...activeMap,
      nodes: nextNodes,
      updatedAt: Date.now(),
    });
  };

  const handleDeleteSelectedNode = async () => {
    if (!activeMap || !selectedNode) return;
    if (localNodes.length <= 1) {
      showToast('A mind map must retain at least one root concept node.');
      return;
    }
    const deletedId = selectedNode.id;
    const nextNodes = localNodes.filter((n) => n.id !== deletedId);
    const nextEdges = activeMap.edges.filter(
      (e) => e.source !== deletedId && e.target !== deletedId
    );
    setLocalNodes(nextNodes);
    setSelectedNodeId(nextNodes[0]?.id || null);
    await onSaveMindMap({
      ...activeMap,
      nodes: nextNodes,
      edges: nextEdges,
      updatedAt: Date.now(),
    });
    showToast('Removed node and connected edges');
  };

  const handleUpdateSelectedEdge = async (patch: Partial<MindMapEdge>) => {
    if (!activeMap || !selectedEdge) return;
    const nextEdges = activeMap.edges.map((e) =>
      e.id === selectedEdge.id ? { ...e, ...patch } : e
    );
    await onSaveMindMap({
      ...activeMap,
      edges: nextEdges,
      updatedAt: Date.now(),
    });
  };

  const handleDeleteSelectedEdge = async () => {
    if (!activeMap || !selectedEdge) return;
    const nextEdges = activeMap.edges.filter((e) => e.id !== selectedEdge.id);
    setSelectedEdgeId(null);
    await onSaveMindMap({
      ...activeMap,
      edges: nextEdges,
      updatedAt: Date.now(),
    });
    showToast('Removed connection');
  };

  // Convert Node to Spaced Repetition Flashcard
  const handleGenerateFlashcardFromNode = async (
    node: MindMapNode,
    cardType: 'qa' | 'cloze' | 'branch'
  ) => {
    if (!activeMap) return;
    const now = Date.now();

    let front = '';
    let back = '';

    if (cardType === 'qa') {
      front = `Explain the mechanism and significance of ${node.label} in ${activeMap.title}.`;
      back = node.summary;
    } else if (cardType === 'cloze') {
      // Automatically wrap up to 2 key terms inside the summary if they appear, or build a clean cloze sentence
      let clozeSentence = `${node.label}: ${node.summary}`;
      let clozeIndex = 1;
      for (const term of node.keyTerms.slice(0, 3)) {
        const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const regex = new RegExp(`(${escaped})`, 'i');
        if (regex.test(clozeSentence)) {
          clozeSentence = clozeSentence.replace(regex, `{{c${clozeIndex}::$1}}`);
          clozeIndex++;
        }
      }
      if (clozeIndex === 1) {
        // Fallback if exact substring wasn't found in summary
        const firstTerm = node.keyTerms[0] || node.label;
        clozeSentence = `In ${activeMap.title}, {{c1::${node.label}}} is characterized by ${node.summary} (Key concept: {{c2::${firstTerm}}}).`;
      }
      front = clozeSentence;
      back = `Key Terms: ${node.keyTerms.join(' · ')}`;
    } else {
      // Branch recall card: find connected child/neighbor nodes
      const connectedNodeIds = activeMap.edges
        .filter((e) => e.source === node.id || e.target === node.id)
        .map((e) => (e.source === node.id ? e.target : e.source));
      const connectedNodes = localNodes.filter((n) => connectedNodeIds.includes(n.id));

      front = `In the mind map "${activeMap.title}", what are the core properties of "${node.label}" and how does it connect to its ${connectedNodes.length} linked branch(es)?`;
      const branchSummary =
        connectedNodes.length > 0
          ? connectedNodes.map((cn, idx) => `${idx + 1}. ${cn.label}: ${cn.summary}`).join('\n')
          : node.summary;
      back = `${node.summary}\n\nConnected Branches:\n${branchSummary}`;
    }

    const newCard: Flashcard = {
      id: `fc-node-${now}`,
      topicId: activeMap.topicId,
      mindMapId: activeMap.id,
      sourceNodeId: node.id,
      type: cardType,
      front,
      back,
      keyTerms: [...node.keyTerms],
      state: 'new',
      easeFactor: 2.5,
      interval: 0,
      repetitions: 0,
      lapses: 0,
      dueDate: now, // Due immediately for spaced repetition
      createdAt: now,
    };

    await onCreateFlashcard(newCard);
    showToast(`Created ${cardType === 'cloze' ? 'Cloze' : cardType === 'branch' ? 'Branch' : 'Q&A'} Flashcard for "${node.label}"`);
  };

  // Create a brand new Mind Map
  const handleCreateNewMindMap = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMapTitle.trim()) return;

    const now = Date.now();
    let targetTopicId = newMapTopicId;

    if ((newMapTopicId === '__new__' || !topics.length) && (newTopicTitleInput.trim() || newMapTitle.trim())) {
      const createdTopic: Topic = {
        id: `topic-${now}`,
        title: newTopicTitleInput.trim() || newMapTitle.trim(),
        category: 'Personal Study',
        description: newMapDescription.trim() || '',
        createdAt: now,
        updatedAt: now,
      };
      await onCreateTopic(createdTopic);
      targetTopicId = createdTopic.id;
    } else if (!targetTopicId && topics[0]) {
      targetTopicId = topics[0].id;
    }

    const newMap: MindMap = {
      id: `map-${now}`,
      topicId: targetTopicId,
      title: newMapTitle.trim(),
      description: newMapDescription.trim(),
      createdAt: now,
      updatedAt: now,
      nodes: [
        {
          id: `node-root-${now}`,
          label: newMapTitle.trim(),
          summary: newMapDescription.trim(),
          keyTerms: [],
          x: 420,
          y: 240,
          color: 'azure',
          mastery: 'untested',
        },
      ],
      edges: [],
    };

    await onSaveMindMap(newMap);
    onSelectMap(newMap.id);
    setNewMapTitle('');
    setNewMapDescription('');
    setNewTopicTitleInput('');
    setShowNewMapForm(false);
    showToast(`Created mind map "${newMap.title}"`);
  };

  const handleAddKeyTerm = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedNode || !newKeyTermInput.trim()) return;
    const term = newKeyTermInput.trim();
    if (!selectedNode.keyTerms.includes(term)) {
      await handleUpdateSelectedNode({
        keyTerms: [...selectedNode.keyTerms, term],
      });
    }
    setNewKeyTermInput('');
  };

  const handleRemoveKeyTerm = async (termToRemove: string) => {
    if (!selectedNode) return;
    await handleUpdateSelectedNode({
      keyTerms: selectedNode.keyTerms.filter((t) => t !== termToRemove),
    });
  };

  const activeTopic = topics.find((t) => t.id === activeMap?.topicId);

  return (
    <div className="flex flex-col h-[calc(100vh-65px)] bg-slate-50 overflow-hidden">
      {/* Sub-bar: Map Selector, Spatial Layout Tools & Cognitive Bridge Actions */}
      <div className="flex flex-wrap items-center justify-between gap-3 px-6 py-3 bg-white border-b border-slate-200 shrink-0">
        <div className="flex items-center gap-3 min-w-0">
          <div className="flex items-center gap-2">
            <label htmlFor="mindmap-select" className="text-xs font-medium text-slate-500 whitespace-nowrap">
              Active Map
            </label>
            <select
              id="mindmap-select"
              value={activeMap?.id || ''}
              onChange={(e) => onSelectMap(e.target.value)}
              className="px-3 py-1.5 text-sm font-semibold text-slate-900 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-600"
            >
              {mindmaps.map((m) => {
                const t = topics.find((top) => top.id === m.topicId);
                return (
                  <option key={m.id} value={m.id}>
                    {m.title} {t ? `(${t.category})` : ''}
                  </option>
                );
              })}
            </select>
          </div>

          <button
            type="button"
            onClick={() => setShowNewMapForm(true)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors whitespace-nowrap"
          >
            <Plus className="w-3.5 h-3.5" />
            New Map
          </button>

          {activeTopic && (
            <div className="hidden xl:flex items-center gap-2 text-xs text-slate-500 pl-2 border-l border-slate-200 truncate">
              <span>{activeTopic.category}</span>
              <span aria-hidden="true">·</span>
              <span className="tabular-nums">{localNodes.length} nodes</span>
              <span aria-hidden="true">·</span>
              <span className="tabular-nums">{activeMap?.edges.length || 0} links</span>
            </div>
          )}
        </div>

        {/* Center / Right Controls: Canvas Actions & Study Bridge */}
        <div className="flex items-center gap-2">
          <div className="flex items-center bg-slate-100 p-1 rounded-lg">
            <button
              type="button"
              onClick={() => handleAddNode()}
              className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium text-slate-800 bg-white rounded-md shadow-xs hover:bg-slate-50 transition-colors whitespace-nowrap"
              title="Add a new concept node connected to the selected node"
            >
              <Plus className="w-3.5 h-3.5 text-sky-600" />
              Add Node
            </button>
            <button
              type="button"
              onClick={() => handleAutoLayout('horizontal')}
              className="px-2.5 py-1 text-xs font-medium text-slate-600 hover:text-slate-900 transition-colors whitespace-nowrap"
              title="Arrange nodes in a left-to-right hierarchy"
            >
              Tree Layout
            </button>
            <button
              type="button"
              onClick={() => handleAutoLayout('radial')}
              className="px-2.5 py-1 text-xs font-medium text-slate-600 hover:text-slate-900 transition-colors whitespace-nowrap"
              title="Arrange nodes radially around the primary concept"
            >
              Radial Layout
            </button>
          </div>

          <div className="hidden sm:flex items-center bg-slate-100 p-1 rounded-lg">
            <button
              type="button"
              onClick={() => setZoom((z) => Math.max(0.45, Math.round((z - 0.1) * 100) / 100))}
              className="p-1 text-slate-600 hover:text-slate-900 rounded"
              title="Zoom Out"
              aria-label="Zoom Out"
            >
              <ZoomOut className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={() => setZoom(1)}
              className="px-2 text-xs font-mono tabular-nums text-slate-700 hover:text-slate-900"
              title="Reset Zoom to 100%"
            >
              {Math.round(zoom * 100)}%
            </button>
            <button
              type="button"
              onClick={() => setZoom((z) => Math.min(1.65, Math.round((z + 0.1) * 100) / 100))}
              className="p-1 text-slate-600 hover:text-slate-900 rounded"
              title="Zoom In"
              aria-label="Zoom In"
            >
              <ZoomIn className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={handleFitView}
              className="p-1 text-slate-600 hover:text-slate-900 rounded ml-0.5"
              title="Fit Map to Screen"
              aria-label="Fit Map to Screen"
            >
              <Maximize2 className="w-3.5 h-3.5" />
            </button>
          </div>

          {activeMap && (
            <button
              type="button"
              onClick={() => onLaunchBlurtFromMap(activeMap.id)}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold text-white bg-sky-600 rounded-lg hover:bg-sky-700 transition-colors whitespace-nowrap"
            >
              <Flame className="w-3.5 h-3.5" />
              Blurt This Map
            </button>
          )}
        </div>
      </div>

      {/* Main Split Stage: Left Interactive Spatial Canvas (70%) + Right Concept Inspector (30%) */}
      <div className="flex flex-1 min-h-0 relative">
        {/* Interactive Spatial Canvas */}
        <div
          ref={canvasContainerRef}
          onMouseDown={handleCanvasMouseDown}
          onMouseMove={handleCanvasMouseMove}
          onMouseUp={handleCanvasMouseUp}
          onWheel={handleWheel}
          className={`relative flex-1 h-full overflow-hidden select-none mindmap-grid-bg ${
            connectingFromNodeId
              ? 'cursor-crosshair'
              : isPanning
              ? 'cursor-grabbing'
              : 'cursor-grab'
          }`}
          style={{
            backgroundSize: `${24 * zoom}px ${24 * zoom}px`,
            backgroundPosition: `${pan.x}px ${pan.y}px`,
          }}
        >
          {/* Floating Link Mode Banner */}
          {connectingFromNodeId && (
            <div className="absolute top-4 left-1/2 -translate-x-1/2 z-30 flex items-center gap-3 px-4 py-2 bg-slate-900 text-white text-xs font-medium rounded-lg shadow-md">
              <Link2 className="w-3.5 h-3.5 text-sky-400" />
              <span>
                Click any target node on the canvas to create a directed link from{' '}
                <strong>
                  {localNodes.find((n) => n.id === connectingFromNodeId)?.label}
                </strong>
              </span>
              <button
                type="button"
                onClick={() => setConnectingFromNodeId(null)}
                className="text-slate-300 hover:text-white underline ml-2"
              >
                Cancel
              </button>
            </div>
          )}

          {/* Toast Feedback Banner */}
          {toastMessage && (
            <div className="absolute bottom-5 left-5 z-30 flex items-center gap-2 px-3.5 py-2 bg-slate-900 text-white text-xs font-medium rounded-lg shadow-sm">
              <Check className="w-3.5 h-3.5 text-emerald-400" />
              <span>{toastMessage}</span>
            </div>
          )}

          {/* Empty State Overlay when no Mind Maps exist yet */}
          {!activeMap && (
            <div
              onMouseDown={(e) => e.stopPropagation()}
              className="absolute inset-0 z-20 flex items-center justify-center p-6"
            >
              <div className="max-w-md w-full bg-white border border-slate-200 rounded-xl p-8 text-center space-y-4 shadow-xs">
                <Network className="w-8 h-8 text-sky-600 mx-auto" />
                <div className="space-y-1">
                  <h2 className="text-base font-semibold text-slate-900">
                    No Mind Maps Created Yet
                  </h2>
                  <p className="text-xs text-slate-500 leading-relaxed">
                    Create your first spatial mind map to organize concepts, link nodes, and
                    generate spaced repetition flashcards or active recall blurts.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setNewMapTopicId(topics[0]?.id || '__new__');
                    setShowNewMapForm(true);
                  }}
                  className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-sky-600 rounded-lg hover:bg-sky-700 transition-colors"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Create First Mind Map</span>
                </button>
              </div>
            </div>
          )}

          {/* Transformed Coordinate Plane */}
          <div
            className="absolute top-0 left-0 origin-top-left"
            style={{
              transform: `translate3d(${pan.x}px, ${pan.y}px, 0) scale(${zoom})`,
              width: 2400,
              height: 1600,
            }}
          >
            {/* SVG Edges Layer */}
            <svg
              className="absolute inset-0 w-full h-full pointer-events-none overflow-visible"
              xmlns="http://www.w3.org/2000/svg"
            >
              <defs>
                <marker
                  id="mindmap-arrow"
                  viewBox="0 0 10 10"
                  refX="7"
                  refY="5"
                  markerWidth="6"
                  markerHeight="6"
                  orient="auto-start-reverse"
                >
                  <path d="M 0 1.5 L 8 5 L 0 8.5 z" fill="#64748B" />
                </marker>
                <marker
                  id="mindmap-arrow-active"
                  viewBox="0 0 10 10"
                  refX="7"
                  refY="5"
                  markerWidth="6"
                  markerHeight="6"
                  orient="auto-start-reverse"
                >
                  <path d="M 0 1.5 L 8 5 L 0 8.5 z" fill="#0284C7" />
                </marker>
              </defs>

              {activeMap?.edges.map((edge) => {
                const sourceNode = localNodes.find((n) => n.id === edge.source);
                const targetNode = localNodes.find((n) => n.id === edge.target);
                if (!sourceNode || !targetNode) return null;

                const sx = sourceNode.x + NODE_WIDTH / 2;
                const sy = sourceNode.y + NODE_HEIGHT / 2;
                const tx = targetNode.x + NODE_WIDTH / 2;
                const ty = targetNode.y + NODE_HEIGHT / 2;

                const dx = tx - sx;
                const dy = ty - sy;
                const dist = Math.hypot(dx, dy) || 1;

                // Stop arrow slightly before target node boundary
                const padTarget = 68;
                const endX = tx - (dx / dist) * Math.min(padTarget, dist * 0.35);
                const endY = ty - (dy / dist) * Math.min(padTarget, dist * 0.35);

                const cx1 = sx + dx * 0.38;
                const cy1 = sy + dy * 0.08;
                const cx2 = endX - dx * 0.38;
                const cy2 = endY - dy * 0.08;

                const pathData = `M ${sx} ${sy} C ${cx1} ${cy1}, ${cx2} ${cy2}, ${endX} ${endY}`;
                const midX = (sx + endX) / 2;
                const midY = (sy + endY) / 2;
                const isSelected = selectedEdgeId === edge.id;

                return (
                  <g
                    key={edge.id}
                    data-edge-interactive="true"
                    className="pointer-events-auto cursor-pointer group"
                    onClick={(e) => {
                      e.stopPropagation();
                      setSelectedEdgeId(edge.id);
                      setSelectedNodeId(null);
                    }}
                  >
                    {/* Invisible wider hit target */}
                    <path d={pathData} fill="none" stroke="transparent" strokeWidth={16} />
                    <path
                      d={pathData}
                      fill="none"
                      stroke={isSelected ? '#0284C7' : '#94A3B8'}
                      strokeWidth={isSelected ? 2.5 : 1.75}
                      strokeDasharray={edge.style === 'dashed' ? '6 4' : undefined}
                      markerEnd={
                        isSelected ? 'url(#mindmap-arrow-active)' : 'url(#mindmap-arrow)'
                      }
                      className="transition-colors"
                    />
                    {edge.label && (
                      <g transform={`translate(${midX}, ${midY})`}>
                        <rect
                          x={-edge.label.length * 3.4 - 6}
                          y={-10}
                          width={edge.label.length * 6.8 + 12}
                          height={20}
                          rx={4}
                          fill={isSelected ? '#E0F2FE' : '#F8FAFC'}
                          stroke={isSelected ? '#0284C7' : '#CBD5E1'}
                          strokeWidth={1}
                        />
                        <text
                          textAnchor="middle"
                          dominantBaseline="middle"
                          className="text-[11px] font-medium fill-slate-600 select-none"
                        >
                          {edge.label}
                        </text>
                      </g>
                    )}
                  </g>
                );
              })}
            </svg>

            {/* Nodes Layer */}
            {localNodes.map((node) => {
              const isSelected = selectedNodeId === node.id;
              const isConnectingSource = connectingFromNodeId === node.id;
              const colorStyle = COLOR_STYLES[node.color] || COLOR_STYLES.slate;
              const masteryMeta = MASTERY_META[node.mastery] || MASTERY_META.untested;
              const linkedCards = nodeFlashcardsMap[node.id] || [];
              const dueCount = linkedCards.filter((c) => c.dueDate <= Date.now()).length;

              return (
                <div
                  key={node.id}
                  data-node-card="true"
                  onMouseDown={(e) => handleNodeMouseDown(e, node)}
                  style={{
                    transform: `translate3d(${node.x}px, ${node.y}px, 0)`,
                    width: NODE_WIDTH,
                  }}
                  className={`absolute top-0 left-0 bg-white rounded-xl border transition-shadow select-none ${
                    isSelected
                      ? 'border-sky-600 ring-2 ring-sky-600/20 shadow-md z-20'
                      : isConnectingSource
                      ? 'border-sky-500 ring-2 ring-sky-400/30 z-20'
                      : `${colorStyle.border} hover:border-slate-400 shadow-xs z-10`
                  }`}
                >
                  {/* Left Color Accent Strip */}
                  <div
                    className={`absolute left-0 top-3 bottom-3 w-1 rounded-r ${colorStyle.accentBar}`}
                  />

                  <div className="p-3.5 pl-4">
                    {/* Unboxed Metadata Row */}
                    <div className="flex items-center justify-between gap-2 text-[11px] text-slate-500 mb-1">
                      <span className={`font-medium ${masteryMeta.colorClass}`}>
                        {masteryMeta.symbol} {masteryMeta.label}
                      </span>
                      <div className="flex items-center gap-1.5 tabular-nums">
                        <span>{node.keyTerms.length} terms</span>
                        {linkedCards.length > 0 && (
                          <>
                            <span aria-hidden="true">·</span>
                            <span className={dueCount > 0 ? 'text-sky-700 font-medium' : ''}>
                              {linkedCards.length} {linkedCards.length === 1 ? 'card' : 'cards'}
                            </span>
                          </>
                        )}
                      </div>
                    </div>

                    {/* Node Title */}
                    <h3 className="text-sm font-semibold text-slate-900 leading-snug line-clamp-1">
                      {node.label}
                    </h3>

                    {/* Summary Preview */}
                    <p className="mt-1 text-xs text-slate-600 leading-relaxed line-clamp-2">
                      {node.summary}
                    </p>
                  </div>

                  {/* Floating Quick Actions Bar when selected */}
                  {isSelected && !draggingNodeId && (
                    <div
                      onMouseDown={(e) => e.stopPropagation()}
                      className="absolute -bottom-10 left-0 right-0 flex items-center justify-center gap-1 pointer-events-auto"
                    >
                      <div className="flex items-center gap-1 px-2 py-1 bg-slate-900 text-white rounded-lg shadow-md text-[11px] font-medium">
                        <button
                          type="button"
                          onClick={() => handleAddNode(node)}
                          className="inline-flex items-center gap-1 px-2 py-0.5 hover:bg-slate-800 rounded transition-colors whitespace-nowrap"
                          title="Add connected child concept"
                        >
                          <GitBranch className="w-3 h-3 text-sky-400" />
                          + Branch
                        </button>
                        <span className="text-slate-600">|</span>
                        <button
                          type="button"
                          onClick={() =>
                            setConnectingFromNodeId(
                              connectingFromNodeId === node.id ? null : node.id
                            )
                          }
                          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded transition-colors whitespace-nowrap ${
                            connectingFromNodeId === node.id
                              ? 'bg-sky-600 text-white'
                              : 'hover:bg-slate-800'
                          }`}
                          title="Draw connection to another node"
                        >
                          <Link2 className="w-3 h-3 text-emerald-400" />
                          Link
                        </button>
                        <span className="text-slate-600">|</span>
                        <button
                          type="button"
                          onClick={() => handleGenerateFlashcardFromNode(node, 'qa')}
                          className="inline-flex items-center gap-1 px-2 py-0.5 hover:bg-slate-800 rounded transition-colors whitespace-nowrap"
                          title="Convert node into a spaced repetition flashcard"
                        >
                          <BookOpen className="w-3 h-3 text-amber-400" />
                          + Card
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Bottom-Right Spatial Coordinates Indicator */}
          <div className="absolute bottom-4 right-4 px-3 py-1.5 bg-white/90 backdrop-blur-xs border border-slate-200 rounded-lg text-[11px] font-mono tabular-nums text-slate-500 pointer-events-none">
            X: {Math.round(-pan.x)} · Y: {Math.round(-pan.y)} · Scale: {Math.round(zoom * 100)}%
          </div>
        </div>

        {/* Right Concept Inspector & Flashcard Bridge Panel */}
        <aside className="w-88 lg:w-96 bg-white border-l border-slate-200 flex flex-col h-full overflow-y-auto shrink-0">
          {selectedNode ? (
            <div className="p-5 space-y-6">
              {/* Header */}
              <div className="flex items-start justify-between gap-2 pb-4 border-b border-slate-200">
                <div>
                  <div className="text-xs text-slate-500">Selected Concept Node</div>
                  <h2 className="text-base font-semibold text-slate-900 mt-0.5">
                    {selectedNode.label}
                  </h2>
                </div>
                <button
                  type="button"
                  onClick={handleDeleteSelectedNode}
                  className="p-1.5 text-slate-400 hover:text-rose-600 rounded-lg hover:bg-rose-50 transition-colors"
                  title="Delete Node"
                  aria-label="Delete Node"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>

              {/* Node Title & Summary Editor */}
              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Concept Label
                  </label>
                  <input
                    type="text"
                    value={selectedNode.label}
                    onChange={(e) => handleUpdateSelectedNode({ label: e.target.value })}
                    className="w-full px-3 py-2 text-sm text-slate-900 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:bg-white focus:ring-2 focus:ring-sky-600"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Synthesis Notes & Mechanism (Used for Blurting & Cards)
                  </label>
                  <textarea
                    rows={4}
                    value={selectedNode.summary}
                    onChange={(e) => handleUpdateSelectedNode({ summary: e.target.value })}
                    className="w-full px-3 py-2 text-xs leading-relaxed text-slate-800 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:bg-white focus:ring-2 focus:ring-sky-600"
                  />
                </div>

                {/* Mastery & Color */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">
                      Recall Mastery
                    </label>
                    <select
                      value={selectedNode.mastery}
                      onChange={(e) =>
                        handleUpdateSelectedNode({ mastery: e.target.value as NodeMastery })
                      }
                      className="w-full px-2.5 py-1.5 text-xs font-medium text-slate-800 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-600"
                    >
                      <option value="untested">○ Untested</option>
                      <option value="learning">◐ Learning</option>
                      <option value="mastered">● Mastered</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">
                      Branch Accent
                    </label>
                    <div className="flex items-center gap-1.5 pt-1">
                      {(Object.keys(COLOR_STYLES) as MindMapNodeColor[]).map((colorKey) => (
                        <button
                          key={colorKey}
                          type="button"
                          onClick={() => handleUpdateSelectedNode({ color: colorKey })}
                          className={`w-5 h-5 rounded-full ${COLOR_STYLES[colorKey].dot} ${
                            selectedNode.color === colorKey
                              ? 'ring-2 ring-offset-2 ring-slate-900'
                              : 'opacity-60 hover:opacity-100'
                          }`}
                          title={COLOR_STYLES[colorKey].label}
                          aria-label={COLOR_STYLES[colorKey].label}
                        />
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              {/* Target Key Terms for Blurt Verification */}
              <div className="pt-4 border-t border-slate-200">
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-xs font-medium text-slate-700">
                    Key Terms (Auto-Checked in Blurt Sessions)
                  </label>
                  <span className="text-[11px] font-mono tabular-nums text-slate-400">
                    {selectedNode.keyTerms.length} terms
                  </span>
                </div>

                <form onSubmit={handleAddKeyTerm} className="flex gap-1.5 mb-2.5">
                  <input
                    type="text"
                    placeholder="Add expected keyword..."
                    value={newKeyTermInput}
                    onChange={(e) => setNewKeyTermInput(e.target.value)}
                    className="flex-1 px-2.5 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:bg-white focus:ring-2 focus:ring-sky-600"
                  />
                  <button
                    type="submit"
                    className="px-3 py-1.5 text-xs font-medium text-slate-700 bg-slate-100 rounded-lg hover:bg-slate-200 transition-colors whitespace-nowrap"
                  >
                    Add
                  </button>
                </form>

                {selectedNode.keyTerms.length > 0 ? (
                  <div className="flex flex-wrap items-center gap-y-1 text-xs text-slate-600">
                    {selectedNode.keyTerms.map((term, i) => (
                      <React.Fragment key={term}>
                        {i > 0 && (
                          <span className="mx-1.5 text-slate-300" aria-hidden="true">
                            ·
                          </span>
                        )}
                        <span className="inline-flex items-center gap-1 group">
                          <span>{term}</span>
                          <button
                            type="button"
                            onClick={() => handleRemoveKeyTerm(term)}
                            className="text-slate-400 hover:text-rose-600"
                            title={`Remove "${term}"`}
                          >
                            <X className="w-3 h-3" />
                          </button>
                        </span>
                      </React.Fragment>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-slate-400">
                    No key terms yet. Add keywords you want verified during active recall blurts.
                  </p>
                )}
              </div>

              {/* Spaced Repetition Flashcard Generator Bridge */}
              <div className="pt-4 border-t border-slate-200 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-slate-900">
                    Convert Node to Flashcard
                  </span>
                  <span className="text-xs text-slate-500 tabular-nums">
                    {(nodeFlashcardsMap[selectedNode.id] || []).length} linked
                  </span>
                </div>

                <div className="grid grid-cols-3 gap-1.5">
                  <button
                    type="button"
                    onClick={() => handleGenerateFlashcardFromNode(selectedNode, 'qa')}
                    className="px-2.5 py-2 text-xs font-medium text-slate-700 bg-slate-50 border border-slate-200 rounded-lg hover:bg-slate-100 hover:text-slate-900 transition-colors text-center whitespace-nowrap"
                  >
                    + Q&amp;A Card
                  </button>
                  <button
                    type="button"
                    onClick={() => handleGenerateFlashcardFromNode(selectedNode, 'cloze')}
                    className="px-2.5 py-2 text-xs font-medium text-slate-700 bg-slate-50 border border-slate-200 rounded-lg hover:bg-slate-100 hover:text-slate-900 transition-colors text-center whitespace-nowrap"
                  >
                    + Cloze Card
                  </button>
                  <button
                    type="button"
                    onClick={() => handleGenerateFlashcardFromNode(selectedNode, 'branch')}
                    className="px-2.5 py-2 text-xs font-medium text-slate-700 bg-slate-50 border border-slate-200 rounded-lg hover:bg-slate-100 hover:text-slate-900 transition-colors text-center whitespace-nowrap"
                  >
                    + Branch Card
                  </button>
                </div>

                {/* Linked Flashcards Preview */}
                {(nodeFlashcardsMap[selectedNode.id] || []).length > 0 && (
                  <div className="space-y-2 pt-2">
                    <div className="text-[11px] font-medium text-slate-500">
                      Linked Flashcards for This Concept
                    </div>
                    <div className="divide-y divide-slate-200 border border-slate-200 rounded-lg bg-slate-50/50">
                      {(nodeFlashcardsMap[selectedNode.id] || []).map((card) => {
                        const dueInfo = formatDueRelative(card.dueDate);
                        return (
                          <div key={card.id} className="p-2.5 text-xs space-y-1">
                            <div className="flex items-center justify-between text-[11px] text-slate-500 tabular-nums">
                              <span>
                                {card.type.toUpperCase()} · Ease {card.easeFactor.toFixed(2)}
                              </span>
                              <span
                                className={
                                  dueInfo.isDue ? 'text-sky-700 font-medium' : 'text-slate-500'
                                }
                              >
                                {dueInfo.label}
                              </span>
                            </div>
                            <p className="text-slate-800 line-clamp-2 font-medium">
                              {card.front}
                            </p>
                          </div>
                        );
                      })}
                    </div>
                    <button
                      type="button"
                      onClick={() => onNavigateToFlashcards(activeMap?.topicId)}
                      className="inline-flex items-center gap-1 text-xs font-medium text-sky-700 hover:text-sky-800"
                    >
                      <span>Study topic flashcards</span>
                      <ArrowRight className="w-3.5 h-3.5" />
                    </button>
                  </div>
                )}
              </div>
            </div>
          ) : selectedEdge ? (
            <div className="p-5 space-y-5">
              <div className="flex items-center justify-between pb-3 border-b border-slate-200">
                <div>
                  <div className="text-xs text-slate-500">Selected Connection</div>
                  <h2 className="text-sm font-semibold text-slate-900 mt-0.5">
                    Relationship Edge
                  </h2>
                </div>
                <button
                  type="button"
                  onClick={handleDeleteSelectedEdge}
                  className="p-1.5 text-slate-400 hover:text-rose-600 rounded-lg hover:bg-rose-50"
                  title="Delete Connection"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Edge Label (Relationship Verb)
                </label>
                <input
                  type="text"
                  value={selectedEdge.label || ''}
                  onChange={(e) => handleUpdateSelectedEdge({ label: e.target.value })}
                  placeholder="e.g., phosphorylates, triggers, inhibits"
                  className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:bg-white focus:ring-2 focus:ring-sky-600"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Line Style
                </label>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => handleUpdateSelectedEdge({ style: 'solid' })}
                    className={`flex-1 py-1.5 text-xs font-medium rounded-lg border ${
                      selectedEdge.style !== 'dashed'
                        ? 'bg-slate-900 text-white border-slate-900'
                        : 'bg-white text-slate-700 border-slate-200'
                    }`}
                  >
                    Solid Direct
                  </button>
                  <button
                    type="button"
                    onClick={() => handleUpdateSelectedEdge({ style: 'dashed' })}
                    className={`flex-1 py-1.5 text-xs font-medium rounded-lg border ${
                      selectedEdge.style === 'dashed'
                        ? 'bg-slate-900 text-white border-slate-900'
                        : 'bg-white text-slate-700 border-slate-200'
                    }`}
                  >
                    Dashed Cross-Link
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <div className="p-6 text-xs text-slate-500 space-y-2">
              <p className="font-medium text-slate-700">No Node Selected</p>
              <p>
                Click any node on the canvas to edit its synthesis notes, key terms, or generate
                spaced repetition flashcards.
              </p>
            </div>
          )}

          {/* Map Metadata Footer */}
          {activeMap && (
            <div className="mt-auto p-5 border-t border-slate-200 bg-slate-50/60 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-slate-600">Map Settings</span>
                {!confirmDeleteMap ? (
                  <button
                    type="button"
                    onClick={() => setConfirmDeleteMap(true)}
                    className="text-xs text-slate-400 hover:text-rose-600 transition-colors"
                  >
                    Delete Map
                  </button>
                ) : (
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        onDeleteMindMap(activeMap.id);
                        setConfirmDeleteMap(false);
                      }}
                      className="text-xs font-semibold text-rose-600 hover:underline"
                    >
                      Confirm Delete
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmDeleteMap(false)}
                      className="text-xs text-slate-500 hover:text-slate-800"
                    >
                      Cancel
                    </button>
                  </div>
                )}
              </div>
              <input
                type="text"
                value={activeMap.title}
                onChange={(e) =>
                  onSaveMindMap({ ...activeMap, title: e.target.value, updatedAt: Date.now() })
                }
                className="w-full px-2.5 py-1.5 text-xs font-medium text-slate-800 bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-600"
              />
            </div>
          )}
        </aside>
      </div>

      {/* Create New Mind Map Modal */}
      {showNewMapForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-xs p-4">
          <div className="w-full max-w-md bg-white border border-slate-200 rounded-xl shadow-lg p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-semibold text-slate-900">Create New Mind Map</h3>
              <button
                type="button"
                onClick={() => setShowNewMapForm(false)}
                className="p-1 text-slate-400 hover:text-slate-700"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleCreateNewMindMap} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Mind Map Title
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g., Krebs Cycle & Allosteric Regulation"
                  value={newMapTitle}
                  onChange={(e) => setNewMapTitle(e.target.value)}
                  className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:bg-white focus:ring-2 focus:ring-sky-600"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Study Topic / Deck
                </label>
                <select
                  value={newMapTopicId}
                  onChange={(e) => setNewMapTopicId(e.target.value)}
                  className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:bg-white focus:ring-2 focus:ring-sky-600"
                >
                  {topics.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.title} ({t.category})
                    </option>
                  ))}
                  <option value="__new__">+ Create New Study Topic...</option>
                </select>
              </div>

              {newMapTopicId === '__new__' && (
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    New Topic Title
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g., Molecular Immunology"
                    value={newTopicTitleInput}
                    onChange={(e) => setNewTopicTitleInput(e.target.value)}
                    className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:bg-white focus:ring-2 focus:ring-sky-600"
                  />
                </div>
              )}

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Core Thesis / Summary
                </label>
                <textarea
                  rows={3}
                  placeholder="Brief overview of what this spatial map covers..."
                  value={newMapDescription}
                  onChange={(e) => setNewMapDescription(e.target.value)}
                  className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:bg-white focus:ring-2 focus:ring-sky-600"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowNewMapForm(false)}
                  className="px-4 py-2 text-xs font-medium text-slate-600 hover:text-slate-900"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 text-xs font-semibold text-white bg-sky-600 rounded-lg hover:bg-sky-700 transition-colors"
                >
                  Create Mind Map
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
