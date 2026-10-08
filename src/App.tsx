import React, { useState, useEffect } from 'react';
import { Play, Pause, RotateCcw } from 'lucide-react';
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

  // Integrated 25-Minute Focus Block Timer
  const [focusSecondsLeft, setFocusSecondsLeft] = useState<number>(25 * 60);
  const [focusRunning, setFocusRunning] = useState<boolean>(false);

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

  // Pomodoro Focus Timer countdown
  useEffect(() => {
    if (!focusRunning) return;
    const timer = setInterval(() => {
      setFocusSecondsLeft((prev) => {
        if (prev <= 1) {
          setFocusRunning(false);
          const now = Date.now();
          const log: StudyLog = {
            id: `log-focus-${now}`,
            dateStr: new Date(now).toISOString().slice(0, 10),
            activityType: 'focus_block',
            durationSeconds: 25 * 60,
            timestamp: now,
          };
          dbOperations.saveStudyLog(log).then(() => {
            setStudyLogs((logs) => [log, ...logs]);
          });
          return 25 * 60;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [focusRunning]);

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

  const dueCount = flashcards.filter((c) => c.dueDate <= Date.now()).length;
  const focusMin = String(Math.floor(focusSecondsLeft / 60)).padStart(2, '0');
  const focusSec = String(focusSecondsLeft % 60).padStart(2, '0');

  return (
    <div className="min-h-screen flex flex-col bg-slate-50 text-slate-900">
      {/* Strict 3-Zone Top Bar Contract */}
      <header className="h-16 flex items-center justify-between px-6 bg-white border-b border-slate-200 sticky top-0 z-40">
        {/* Zone 1: Single text element wordmark */}
        <a
          href="#dashboard"
          onClick={(e) => {
            e.preventDefault();
            setActiveTab('dashboard');
          }}
          className="text-xl font-semibold tracking-tight text-slate-900 font-display whitespace-nowrap"
        >
          Noesis
        </a>

        {/* Zone 2: 5 clean text navigation links */}
        <nav className="flex items-center gap-5 md:gap-7 text-sm font-medium text-slate-600 overflow-x-auto">
          {(
            [
              { id: 'dashboard', label: 'Dashboard' },
              { id: 'mindmaps', label: 'Mind Maps' },
              { id: 'flashcards', label: 'Flashcards' },
              { id: 'blurting', label: 'Blurting' },
              { id: 'library', label: 'IndexedDB' },
            ] as const
          ).map((item) => {
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setActiveTab(item.id)}
                className={`py-1 transition-colors whitespace-nowrap shrink-0 border-b-2 ${
                  isActive
                    ? 'text-slate-900 border-sky-600 font-semibold'
                    : 'border-transparent hover:text-slate-900 hover:border-slate-300'
                }`}
              >
                {item.label}
              </button>
            );
          })}
        </nav>

        {/* Zone 3: 1-2 primary actions */}
        <div className="flex items-center gap-2.5 shrink-0">
          <button
            type="button"
            onClick={() => setFocusRunning((r) => !r)}
            onDoubleClick={() => {
              setFocusRunning(false);
              setFocusSecondsLeft(25 * 60);
            }}
            title="Click to start/pause 25m Focus Timer (Double-click to reset)"
            className={`hidden sm:inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-mono tabular-nums rounded-lg border transition-colors whitespace-nowrap ${
              focusRunning
                ? 'bg-amber-50 text-amber-900 border-amber-300 font-semibold'
                : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
            }`}
          >
            {focusRunning ? <Pause className="w-3 h-3" /> : <Play className="w-3 h-3" />}
            <span>
              {focusMin}:{focusSec}
            </span>
          </button>

          <button
            type="button"
            onClick={() => navigateToFlashcards('all')}
            className="px-3.5 py-2 text-xs font-semibold text-white bg-slate-900 rounded-lg hover:bg-slate-800 transition-colors whitespace-nowrap tabular-nums"
          >
            Study Due ({dueCount})
          </button>
        </div>
      </header>

      {/* Main Content Viewport */}
      <main className="flex-1">
        {isLoading ? (
          <div className="max-w-7xl mx-auto px-6 py-12 space-y-4">
            <div className="h-36 bg-white border border-slate-200 rounded-xl animate-pulse" />
            <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
              <div className="h-44 bg-white border border-slate-200 rounded-xl animate-pulse" />
              <div className="h-44 bg-white border border-slate-200 rounded-xl animate-pulse" />
              <div className="h-44 bg-white border border-slate-200 rounded-xl animate-pulse" />
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
