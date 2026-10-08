import React, { useState, useEffect } from 'react';
import {
  LayoutDashboard,
  Network,
  BookOpen,
  Flame,
  Database,
} from 'lucide-react';
import {
  ActiveWorkspaceTab,
  BlurtSession,
  Flashcard,
  MindMap,
  StudyLog,
  Topic,
} from './types/study';
import {
  clearAllDatabaseData,
  dbOperations,
  FullStudySnapshot,
  loadDatabase,
  restoreSnapshotToIndexedDB,
} from './db/indexedDb';
import { DashboardWorkspace } from './components/DashboardWorkspace';
import { MindMapWorkspace } from './components/MindMapWorkspace';
import { FlashcardsWorkspace } from './components/FlashcardsWorkspace';
import { BlurtingWorkspace } from './components/BlurtingWorkspace';
import { DataSovereigntyView } from './components/DataSovereigntyView';

const NAV_ITEMS: {
  id: ActiveWorkspaceTab;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}[] = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { id: 'mindmaps', label: 'Mind Maps', icon: Network },
  { id: 'flashcards', label: 'Flashcards', icon: BookOpen },
  { id: 'blurting', label: 'Blurting', icon: Flame },
  { id: 'library', label: 'IndexedDB', icon: Database },
];

export default function App() {
  const [activeTab, setActiveTab] = useState<ActiveWorkspaceTab>('dashboard');
  const [isLoading, setIsLoading] = useState<boolean>(true);

  // IndexedDB state mirrored in React state
  const [topics, setTopics] = useState<Topic[]>([]);
  const [mindmaps, setMindmaps] = useState<MindMap[]>([]);
  const [flashcards, setFlashcards] = useState<Flashcard[]>([]);
  const [blurtSessions, setBlurtSessions] = useState<BlurtSession[]>([]);
  const [studyLogs, setStudyLogs] = useState<StudyLog[]>([]);

  // Cross-workspace contextual selections
  const [selectedMapId, setSelectedMapId] = useState<string | null>(null);
  const [flashcardTopicFilter, setFlashcardTopicFilter] = useState<string>('all');
  const [blurtTargetMapId, setBlurtTargetMapId] = useState<string | null>(null);

  // Load clean IndexedDB on mount
  useEffect(() => {
    let mounted = true;
    loadDatabase()
      .then((snapshot) => {
        if (!mounted) return;
        setTopics(snapshot.topics);
        setMindmaps(snapshot.mindmaps);
        setFlashcards(snapshot.flashcards);
        setBlurtSessions(snapshot.blurtSessions);
        setStudyLogs(snapshot.studyLogs);
        setSelectedMapId(snapshot.mindmaps[0]?.id || null);
        setIsLoading(false);
      })
      .catch((err) => {
        console.error('Failed to initialize IndexedDB:', err);
        if (mounted) setIsLoading(false);
      });
    return () => {
      mounted = false;
    };
  }, []);

  // IndexedDB Mutation Handlers
  const handleCreateTopic = async (topic: Topic) => {
    await dbOperations.saveTopic(topic);
    setTopics((prev) => [topic, ...prev]);
  };

  const handleDeleteTopic = async (topicId: string) => {
    await dbOperations.deleteTopic(topicId);
    setTopics((prev) => prev.filter((t) => t.id !== topicId));
  };

  const handleSaveMindMap = async (map: MindMap) => {
    await dbOperations.saveMindMap(map);
    setMindmaps((prev) => {
      const exists = prev.some((m) => m.id === map.id);
      if (exists) {
        return prev.map((m) => (m.id === map.id ? map : m));
      }
      return [map, ...prev];
    });
  };

  const handleDeleteMindMap = async (mapId: string) => {
    await dbOperations.deleteMindMap(mapId);
    setMindmaps((prev) => {
      const remaining = prev.filter((m) => m.id !== mapId);
      if (selectedMapId === mapId) {
        setSelectedMapId(remaining[0]?.id || null);
      }
      return remaining;
    });
  };

  const handleSaveFlashcard = async (card: Flashcard) => {
    await dbOperations.saveFlashcard(card);
    setFlashcards((prev) => {
      const exists = prev.some((c) => c.id === card.id);
      const updated = exists ? prev.map((c) => (c.id === card.id ? card : c)) : [card, ...prev];
      return updated.sort((a, b) => a.dueDate - b.dueDate);
    });
  };

  const handleCreateFlashcardsBatch = async (cards: Flashcard[]) => {
    await dbOperations.saveFlashcardsBatch(cards);
    setFlashcards((prev) => [...cards, ...prev].sort((a, b) => a.dueDate - b.dueDate));
  };

  const handleDeleteFlashcard = async (id: string) => {
    await dbOperations.deleteFlashcard(id);
    setFlashcards((prev) => prev.filter((c) => c.id !== id));
  };

  const handleSaveBlurtSession = async (session: BlurtSession) => {
    await dbOperations.saveBlurtSession(session);
    setBlurtSessions((prev) => {
      const exists = prev.some((s) => s.id === session.id);
      if (exists) {
        return prev.map((s) => (s.id === session.id ? session : s));
      }
      return [session, ...prev];
    });
  };

  const handleDeleteBlurtSession = async (id: string) => {
    await dbOperations.deleteBlurtSession(id);
    setBlurtSessions((prev) => prev.filter((s) => s.id !== id));
  };

  const handleLogStudyActivity = async (log: StudyLog) => {
    await dbOperations.saveStudyLog(log);
    setStudyLogs((prev) => [log, ...prev]);
  };

  const handleImportSnapshot = async (snapshot: FullStudySnapshot) => {
    await restoreSnapshotToIndexedDB(snapshot);
    setTopics(snapshot.topics || []);
    setMindmaps(snapshot.mindmaps || []);
    setFlashcards(snapshot.flashcards || []);
    setBlurtSessions(snapshot.blurtSessions || []);
    setStudyLogs(snapshot.studyLogs || []);
    setSelectedMapId(snapshot.mindmaps?.[0]?.id || null);
  };

  const handleClearAllData = async () => {
    const empty = await clearAllDatabaseData();
    setTopics(empty.topics);
    setMindmaps(empty.mindmaps);
    setFlashcards(empty.flashcards);
    setBlurtSessions(empty.blurtSessions);
    setStudyLogs(empty.studyLogs);
    setSelectedMapId(null);
  };

  // Cross-view navigation helpers
  const navigateToMindMap = (mapId: string) => {
    setSelectedMapId(mapId);
    setActiveTab('mindmaps');
  };

  const navigateToFlashcards = (topicId?: string) => {
    setFlashcardTopicFilter(topicId || 'all');
    setActiveTab('flashcards');
  };

  const navigateToBlurtWithMap = (mapId: string) => {
    setBlurtTargetMapId(mapId);
    setActiveTab('blurting');
  };

  return (
    <div className="min-h-screen flex bg-[#090D16] text-slate-100">
      {/* Minimized Icon Sidebar with Hover Pop-up Labels */}
      <aside
        aria-label="Primary Navigation"
        className="w-16 shrink-0 bg-slate-900 border-r border-slate-800 flex flex-col items-center py-5 sticky top-0 h-screen z-50 select-none"
      >
        {/* Brand Monogram with Hover Tooltip */}
        <a
          href="#dashboard"
          onClick={(e) => {
            e.preventDefault();
            setActiveTab('dashboard');
          }}
          className="group relative flex items-center justify-center w-10 h-10 rounded-xl bg-slate-950 border border-slate-800 text-sky-400 font-display font-semibold text-lg hover:border-sky-500/50 transition-colors mb-6"
        >
          <span>N</span>
          <span className="pointer-events-none absolute left-full ml-3 px-2.5 py-1.5 rounded-lg bg-slate-800 border border-slate-700 text-xs font-sans font-semibold text-slate-100 whitespace-nowrap opacity-0 -translate-x-1 group-hover:opacity-100 group-hover:translate-x-0 transition-all duration-150 shadow-lg z-50">
            Noesis
          </span>
        </a>

        {/* Section Icon Buttons */}
        <nav className="flex flex-col items-center gap-2.5 flex-1">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setActiveTab(item.id)}
                aria-label={item.label}
                className={`group relative flex items-center justify-center w-10 h-10 rounded-xl border transition-colors ${
                  isActive
                    ? 'bg-sky-400 text-slate-950 border-sky-400 shadow-sm'
                    : 'bg-transparent text-slate-400 border-transparent hover:bg-slate-800/80 hover:text-slate-100 hover:border-slate-700/80'
                }`}
              >
                <Icon className="w-4 h-4 shrink-0" />

                {/* Hover Pop-up Section Name */}
                <span className="pointer-events-none absolute left-full ml-3 px-2.5 py-1.5 rounded-lg bg-slate-800 border border-slate-700 text-xs font-medium text-slate-100 whitespace-nowrap opacity-0 -translate-x-1 group-hover:opacity-100 group-hover:translate-x-0 transition-all duration-150 shadow-lg z-50">
                  {item.label}
                </span>
              </button>
            );
          })}
        </nav>
      </aside>

      {/* Main Content Viewport */}
      <main className="flex-1 min-w-0">
        {isLoading ? (
          <div className="max-w-7xl mx-auto px-6 py-12 space-y-4">
            <div className="h-36 bg-slate-900 border border-slate-800 rounded-xl animate-pulse" />
            <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
              <div className="h-44 bg-slate-900 border border-slate-800 rounded-xl animate-pulse" />
              <div className="h-44 bg-slate-900 border border-slate-800 rounded-xl animate-pulse" />
              <div className="h-44 bg-slate-900 border border-slate-800 rounded-xl animate-pulse" />
            </div>
          </div>
        ) : activeTab === 'dashboard' ? (
          <DashboardWorkspace
            topics={topics}
            mindmaps={mindmaps}
            flashcards={flashcards}
            blurtSessions={blurtSessions}
            studyLogs={studyLogs}
            onNavigateTab={setActiveTab}
            onOpenMindMap={navigateToMindMap}
            onStudyTopicFlashcards={navigateToFlashcards}
            onLaunchBlurtFromMap={navigateToBlurtWithMap}
            onCreateTopic={handleCreateTopic}
            onDeleteTopic={handleDeleteTopic}
          />
        ) : activeTab === 'mindmaps' ? (
          <MindMapWorkspace
            topics={topics}
            mindmaps={mindmaps}
            flashcards={flashcards}
            selectedMapId={selectedMapId}
            onSelectMap={setSelectedMapId}
            onSaveMindMap={handleSaveMindMap}
            onDeleteMindMap={handleDeleteMindMap}
            onCreateFlashcard={handleSaveFlashcard}
            onLaunchBlurtFromMap={navigateToBlurtWithMap}
            onNavigateToFlashcards={navigateToFlashcards}
            onCreateTopic={handleCreateTopic}
          />
        ) : activeTab === 'flashcards' ? (
          <FlashcardsWorkspace
            topics={topics}
            mindmaps={mindmaps}
            flashcards={flashcards}
            initialTopicFilter={flashcardTopicFilter}
            onSaveFlashcard={handleSaveFlashcard}
            onDeleteFlashcard={handleDeleteFlashcard}
            onLogStudyActivity={handleLogStudyActivity}
            onOpenMindMap={navigateToMindMap}
            onCreateTopic={handleCreateTopic}
          />
        ) : activeTab === 'blurting' ? (
          <BlurtingWorkspace
            topics={topics}
            mindmaps={mindmaps}
            blurtSessions={blurtSessions}
            initialMindMapId={blurtTargetMapId}
            onSaveBlurtSession={handleSaveBlurtSession}
            onDeleteBlurtSession={handleDeleteBlurtSession}
            onCreateFlashcardsBatch={handleCreateFlashcardsBatch}
            onUpdateMindMap={handleSaveMindMap}
            onLogStudyActivity={handleLogStudyActivity}
            onOpenMindMap={navigateToMindMap}
          />
        ) : (
          <DataSovereigntyView
            snapshot={{
              topics,
              mindmaps,
              flashcards,
              blurtSessions,
              studyLogs,
            }}
            onImportSnapshot={handleImportSnapshot}
            onClearAllData={handleClearAllData}
          />
        )}
      </main>
    </div>
  );
}
