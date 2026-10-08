import React, { useState, useMemo } from 'react';
import {
  ArrowRight,
  BookOpen,
  Flame,
  Network,
  Plus,
  Trash2,
  X,
  CheckCircle2,
} from 'lucide-react';
import {
  ActiveWorkspaceTab,
  BlurtSession,
  Flashcard,
  MindMap,
  StudyLog,
  Topic,
} from '../types/study';
import { formatDueRelative } from '../utils/srs';

interface DashboardWorkspaceProps {
  topics: Topic[];
  mindmaps: MindMap[];
  flashcards: Flashcard[];
  blurtSessions: BlurtSession[];
  studyLogs: StudyLog[];
  onNavigateTab: (tab: ActiveWorkspaceTab) => void;
  onOpenMindMap: (mapId: string) => void;
  onStudyTopicFlashcards: (topicId?: string) => void;
  onLaunchBlurtFromMap: (mapId: string) => void;
  onCreateTopic: (topic: Topic) => Promise<void>;
  onDeleteTopic: (topicId: string) => Promise<void>;
}

export const DashboardWorkspace: React.FC<DashboardWorkspaceProps> = ({
  topics,
  mindmaps,
  flashcards,
  blurtSessions,
  studyLogs,
  onNavigateTab,
  onOpenMindMap,
  onStudyTopicFlashcards,
  onLaunchBlurtFromMap,
  onCreateTopic,
  onDeleteTopic,
}) => {
  const [showNewTopicModal, setShowNewTopicModal] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newCategory, setNewCategory] = useState('');
  const [newDescription, setNewDescription] = useState('');

  const now = Date.now();

  const dueCards = useMemo(
    () => flashcards.filter((c) => c.dueDate <= now).sort((a, b) => a.dueDate - b.dueDate),
    [flashcards, now]
  );

  const totalNodes = useMemo(
    () => mindmaps.reduce((acc, m) => acc + m.nodes.length, 0),
    [mindmaps]
  );

  const masteredNodes = useMemo(
    () =>
      mindmaps.reduce(
        (acc, m) => acc + m.nodes.filter((n) => n.mastery === 'mastered').length,
        0
      ),
    [mindmaps]
  );

  const averageBlurtScore = useMemo(() => {
    if (blurtSessions.length === 0) return 0;
    const sum = blurtSessions.reduce((acc, s) => acc + s.scorePercent, 0);
    return Math.round(sum / blurtSessions.length);
  }, [blurtSessions]);

  // Build 14-day study consistency cells
  const last14Days = useMemo(() => {
    const days: { dateStr: string; label: string; count: number; minutes: number }[] = [];
    for (let i = 13; i >= 0; i--) {
      const d = new Date(now - i * 24 * 3600 * 1000);
      const dateStr = d.toISOString().slice(0, 10);
      const dayLogs = studyLogs.filter((l) => l.dateStr === dateStr);
      const totalSec = dayLogs.reduce((acc, l) => acc + l.durationSeconds, 0);
      days.push({
        dateStr,
        label: d.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric' }),
        count: dayLogs.length,
        minutes: Math.max(dayLogs.length > 0 ? 1 : 0, Math.round(totalSec / 60)),
      });
    }
    return days;
  }, [studyLogs, now]);

  const handleCreateTopicSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim()) return;
    const topic: Topic = {
      id: `topic-${Date.now()}`,
      title: newTitle.trim(),
      category: newCategory.trim() || 'Personal Study',
      description:
        newDescription.trim() ||
        'Dedicated knowledge space for mind maps, flashcards, and active recall blurts.',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    await onCreateTopic(topic);
    setNewTitle('');
    setNewCategory('');
    setNewDescription('');
    setShowNewTopicModal(false);
  };

  return (
    <div className="max-w-7xl mx-auto px-6 py-8 space-y-10">
      {/* Primary Hero / Study Command Anchor */}
      <section className="bg-slate-900 border border-slate-800 rounded-xl p-6 md:p-8">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
          <div className="lg:col-span-7 space-y-3">
            <div className="flex items-center gap-2 text-xs text-slate-400 tabular-nums">
              <span>Local IndexedDB Vault</span>
              <span aria-hidden="true">·</span>
              <span>{topics.length} study topics</span>
              <span aria-hidden="true">·</span>
              <span>{mindmaps.length} spatial mind maps</span>
            </div>

            <h1 className="text-2xl md:text-3xl font-semibold text-slate-100 tracking-tight">
              {dueCards.length > 0
                ? `${dueCards.length} Flashcards Scheduled for Active Review Today`
                : 'Your Spaced Repetition Queue is Clear for Today'}
            </h1>

            <p className="text-sm text-slate-400 leading-relaxed max-w-2xl">
              Map complex mechanisms spatially, convert concept nodes directly into SM-2 spaced
              repetition cards, and run timed free-recall blurting sprints to uncover and patch
              blind spots in long-term memory.
            </p>

            <div className="flex flex-wrap items-center gap-3 pt-2">
              <button
                type="button"
                onClick={() => onNavigateTab('mindmaps')}
                className="inline-flex items-center gap-2 px-4 py-2.5 text-xs font-semibold text-slate-200 bg-slate-800 border border-slate-700 rounded-lg hover:bg-slate-700 transition-colors whitespace-nowrap"
              >
                <Network className="w-4 h-4 text-sky-400" />
                <span>{mindmaps.length > 0 ? 'Open Spatial Canvas' : 'Create Mind Map'}</span>
              </button>

              <button
                type="button"
                onClick={() => onNavigateTab('flashcards')}
                className="inline-flex items-center gap-2 px-4 py-2.5 text-xs font-semibold text-slate-200 bg-slate-800 border border-slate-700 rounded-lg hover:bg-slate-700 transition-colors whitespace-nowrap"
              >
                <BookOpen className="w-4 h-4 text-emerald-400" />
                <span>Create Flashcards</span>
              </button>

              <button
                type="button"
                onClick={() =>
                  mindmaps[0] ? onLaunchBlurtFromMap(mindmaps[0].id) : onNavigateTab('blurting')
                }
                className="inline-flex items-center gap-2 px-4 py-2.5 text-xs font-semibold text-slate-200 bg-slate-800 border border-slate-700 rounded-lg hover:bg-slate-700 transition-colors whitespace-nowrap"
              >
                <Flame className="w-4 h-4 text-amber-400" />
                <span>Start Blurt Session</span>
              </button>
            </div>
          </div>

          {/* Right Metric Summary Grid (Tabular Numerals, Single Elevation) */}
          <div className="lg:col-span-5 grid grid-cols-2 gap-4 pt-6 lg:pt-0 lg:pl-8 border-t lg:border-t-0 lg:border-l border-slate-800">
            <div className="space-y-1">
              <div className="text-xs text-slate-400">Due Flashcards</div>
              <div className="text-2xl font-semibold text-sky-400 font-mono tabular-nums">
                {dueCards.length}{' '}
                <span className="text-xs font-normal text-slate-500">
                  / {flashcards.length}
                </span>
              </div>
              <div className="text-[11px] text-slate-500">SM-2 scheduled queue</div>
            </div>

            <div className="space-y-1">
              <div className="text-xs text-slate-400">Concept Nodes Mastered</div>
              <div className="text-2xl font-semibold text-emerald-400 font-mono tabular-nums">
                {masteredNodes}{' '}
                <span className="text-xs font-normal text-slate-500">/ {totalNodes}</span>
              </div>
              <div className="text-[11px] text-slate-500">Across {mindmaps.length} mind maps</div>
            </div>

            <div className="space-y-1 pt-3 border-t border-slate-800/80">
              <div className="text-xs text-slate-400">Mean Blurt Coverage</div>
              <div className="text-2xl font-semibold text-slate-100 font-mono tabular-nums">
                {averageBlurtScore}%
              </div>
              <div className="text-[11px] text-slate-500">
                {blurtSessions.length} active recall sprints
              </div>
            </div>

            <div className="space-y-1 pt-3 border-t border-slate-800/80">
              <div className="text-xs text-slate-400">14-Day Study Sessions</div>
              <div className="text-2xl font-semibold text-slate-100 font-mono tabular-nums">
                {studyLogs.length}
              </div>
              <div className="text-[11px] text-slate-500">Persisted in IndexedDB</div>
            </div>
          </div>
        </div>
      </section>

      {/* Section 2: Knowledge Spaces / Study Topics */}
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-slate-100">
              Study Topics &amp; Knowledge Spaces
            </h2>
            <p className="text-xs text-slate-400">
              Each topic links your spatial mind maps, spaced repetition flashcards, and blurt
              history.
            </p>
          </div>
        </div>

        {topics.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            {topics.map((topic) => {
              const topicMaps = mindmaps.filter((m) => m.topicId === topic.id);
              const topicCards = flashcards.filter((c) => c.topicId === topic.id);
              const topicDue = topicCards.filter((c) => c.dueDate <= now).length;
              const topicBlurts = blurtSessions.filter((b) => b.topicId === topic.id);
              const latestBlurt = topicBlurts[0];

              return (
                <div
                  key={topic.id}
                  className="bg-slate-900 border border-slate-800 rounded-xl p-5 flex flex-col justify-between space-y-5 hover:border-slate-700 transition-colors"
                >
                  <div className="space-y-2">
                    {/* Quiet Unboxed Kicker */}
                    <div className="flex items-center justify-between text-xs text-slate-400">
                      <span>{topic.category}</span>
                      <button
                        type="button"
                        onClick={() => onDeleteTopic(topic.id)}
                        className="text-slate-600 hover:text-rose-400 transition-colors"
                        title="Delete Topic"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>

                    <h3 className="text-base font-semibold text-slate-100 leading-snug">
                      {topic.title}
                    </h3>

                    <p className="text-xs text-slate-400 leading-relaxed line-clamp-2">
                      {topic.description}
                    </p>
                  </div>

                  <div className="space-y-3 pt-3 border-t border-slate-800">
                    {/* Unboxed Tabular Stats */}
                    <div className="flex flex-wrap items-center gap-1.5 text-xs text-slate-400 tabular-nums">
                      <span>
                        {topicMaps.length} {topicMaps.length === 1 ? 'map' : 'maps'}
                      </span>
                      <span aria-hidden="true">·</span>
                      <span>{topicCards.length} cards</span>
                      <span aria-hidden="true">·</span>
                      <span className={topicDue > 0 ? 'text-sky-400 font-semibold' : ''}>
                        {topicDue} due
                      </span>
                      {latestBlurt && (
                        <>
                          <span aria-hidden="true">·</span>
                          <span>Last blurt {latestBlurt.scorePercent}%</span>
                        </>
                      )}
                    </div>

                    {/* Action Buttons */}
                    <div className="grid grid-cols-3 gap-1.5">
                      <button
                        type="button"
                        onClick={() =>
                          topicMaps[0]
                            ? onOpenMindMap(topicMaps[0].id)
                            : onNavigateTab('mindmaps')
                        }
                        className="py-1.5 px-2 text-xs font-medium text-slate-300 bg-slate-800/80 hover:bg-slate-800 border border-slate-700/80 rounded-lg transition-colors text-center whitespace-nowrap"
                      >
                        Mind Map
                      </button>
                      <button
                        type="button"
                        onClick={() => onStudyTopicFlashcards(topic.id)}
                        className="py-1.5 px-2 text-xs font-medium text-slate-300 bg-slate-800/80 hover:bg-slate-800 border border-slate-700/80 rounded-lg transition-colors text-center whitespace-nowrap"
                      >
                        Study ({topicDue})
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          topicMaps[0]
                            ? onLaunchBlurtFromMap(topicMaps[0].id)
                            : onNavigateTab('blurting')
                        }
                        className="py-1.5 px-2 text-xs font-medium text-sky-300 bg-sky-950/60 hover:bg-sky-900/60 border border-sky-800/60 rounded-lg transition-colors text-center whitespace-nowrap"
                      >
                        Blurt
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-10 text-center space-y-3">
            <h3 className="text-base font-semibold text-slate-100">
              No Study Topics Created Yet
            </h3>
            <p className="text-xs text-slate-400 max-w-md mx-auto">
              Start fresh by creating your first Study Topic, or jump directly to Mind Maps or
              Flashcards to begin building your personal knowledge base.
            </p>
            <div className="pt-2">
              <button
                type="button"
                onClick={() => setShowNewTopicModal(true)}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-slate-950 bg-sky-400 rounded-lg hover:bg-sky-300 transition-colors"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Create First Study Topic</span>
              </button>
            </div>
          </div>
        )}
      </section>

      {/* Section 3: Immediate Priority Queue & 14-Day Study Cadence */}
      <section className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* Up Next in Spaced Repetition Queue (7 cols) */}
        <div className="lg:col-span-7 bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-slate-800">
            <div>
              <h2 className="text-base font-semibold text-slate-100">
                Priority Spaced Repetition Queue
              </h2>
              <p className="text-xs text-slate-400">
                Cards due for immediate active recall based on SM-2 ease and interval decay.
              </p>
            </div>
            <button
              type="button"
              onClick={() => onStudyTopicFlashcards('all')}
              className="inline-flex items-center gap-1 text-xs font-semibold text-sky-400 hover:text-sky-300 whitespace-nowrap"
            >
              <span>Review All</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>

          {dueCards.length > 0 ? (
            <div className="divide-y divide-slate-800">
              {dueCards.slice(0, 5).map((card) => {
                const topic = topics.find((t) => t.id === card.topicId);
                const dueRel = formatDueRelative(card.dueDate, now);
                return (
                  <div
                    key={card.id}
                    className="py-3 first:pt-1 last:pb-1 flex items-start justify-between gap-4"
                  >
                    <div className="space-y-1 min-w-0">
                      <div className="flex items-center gap-1.5 text-[11px] text-slate-400 tabular-nums">
                        <span>{topic?.category || 'Study'}</span>
                        <span aria-hidden="true">·</span>
                        <span className="uppercase font-mono">{card.type}</span>
                        <span aria-hidden="true">·</span>
                        <span>Ease {card.easeFactor.toFixed(2)}</span>
                      </div>
                      <p className="text-xs font-medium text-slate-100 line-clamp-1">
                        {card.front}
                      </p>
                    </div>

                    <button
                      type="button"
                      onClick={() => onStudyTopicFlashcards(card.topicId)}
                      className="text-xs font-mono tabular-nums text-sky-400 hover:underline whitespace-nowrap shrink-0"
                    >
                      {dueRel.label} →
                    </button>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="py-8 text-center text-xs text-slate-400 flex flex-col items-center gap-2">
              <CheckCircle2 className="w-6 h-6 text-emerald-400" />
              <span>All due flashcards have been reviewed!</span>
            </div>
          )}
        </div>

        {/* 14-Day Study Activity Cadence (5 cols) */}
        <div className="lg:col-span-5 bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-4">
          <div className="pb-3 border-b border-slate-800">
            <h2 className="text-base font-semibold text-slate-100">
              14-Day Active Recall Cadence
            </h2>
            <p className="text-xs text-slate-400">
              Daily flashcard reviews and free-recall blurts logged in local IndexedDB.
            </p>
          </div>

          <div className="grid grid-cols-7 gap-2">
            {last14Days.map((day) => {
              const active = day.count > 0;
              return (
                <div
                  key={day.dateStr}
                  className={`p-2 rounded-lg border text-center space-y-1 ${
                    active
                      ? 'bg-sky-950/60 border-sky-800/80 text-slate-100'
                      : 'bg-slate-950/60 border-slate-800/80 text-slate-500'
                  }`}
                >
                  <div className="text-[10px] truncate">{day.label.split(' ')[0]}</div>
                  <div className="text-xs font-mono font-semibold tabular-nums">
                    {day.count > 0 ? `${day.count}×` : '—'}
                  </div>
                  <div className="text-[10px] font-mono tabular-nums text-slate-400">
                    {day.minutes > 0 ? `${day.minutes}m` : '0m'}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* Create New Study Topic Modal */}
      {showNewTopicModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
          <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-xl shadow-xl p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-semibold text-slate-100">Create New Study Topic</h3>
              <button
                type="button"
                onClick={() => setShowNewTopicModal(false)}
                className="p-1 text-slate-400 hover:text-slate-200"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleCreateTopicSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">
                  Topic Title
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g., Organic Synthesis & Reaction Mechanisms"
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  className="w-full px-3 py-2 text-sm text-slate-100 bg-slate-950 border border-slate-800 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-500"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">
                  Discipline / Category
                </label>
                <input
                  type="text"
                  placeholder="e.g., Chemistry, Systems Engineering, Medicine"
                  value={newCategory}
                  onChange={(e) => setNewCategory(e.target.value)}
                  className="w-full px-3 py-2 text-sm text-slate-100 bg-slate-950 border border-slate-800 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-500"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">
                  Scope Description
                </label>
                <textarea
                  rows={3}
                  placeholder="Key subtopics, exams, or textbooks covered in this space..."
                  value={newDescription}
                  onChange={(e) => setNewDescription(e.target.value)}
                  className="w-full px-3 py-2 text-xs text-slate-100 bg-slate-950 border border-slate-800 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-500"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowNewTopicModal(false)}
                  className="px-4 py-2 text-xs font-medium text-slate-400 hover:text-slate-200"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 text-xs font-semibold text-slate-950 bg-sky-400 rounded-lg hover:bg-sky-300 transition-colors"
                >
                  Create Topic
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
