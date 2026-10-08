import React, { useState, useEffect, useMemo } from 'react';
import {
  Plus,
  Search,
  CheckCircle2,
  Trash2,
  Edit3,
  Eye,
  Network,
  Keyboard,
  X,
} from 'lucide-react';
import {
  Flashcard,
  FlashcardType,
  MindMap,
  RatingGrade,
  StudyLog,
  Topic,
} from '../types/study';
import {
  formatDueRelative,
  formatIntervalLabel,
  parseClozeSegments,
  previewNextIntervals,
  scheduleFlashcardReview,
} from '../utils/srs';

interface FlashcardsWorkspaceProps {
  topics: Topic[];
  mindmaps: MindMap[];
  flashcards: Flashcard[];
  initialTopicFilter?: string;
  onSaveFlashcard: (card: Flashcard) => Promise<void>;
  onDeleteFlashcard: (id: string) => Promise<void>;
  onLogStudyActivity: (log: StudyLog) => Promise<void>;
  onOpenMindMap: (mapId: string) => void;
  onCreateTopic: (topic: Topic) => Promise<void>;
}

type SessionQueueFilter = 'due' | 'all_cram' | 'new_only' | 'lapsed';

export const FlashcardsWorkspace: React.FC<FlashcardsWorkspaceProps> = ({
  topics,
  mindmaps,
  flashcards,
  initialTopicFilter,
  onSaveFlashcard,
  onDeleteFlashcard,
  onLogStudyActivity,
  onOpenMindMap,
  onCreateTopic,
}) => {
  const [subView, setSubView] = useState<'session' | 'browser'>('session');
  const [topicFilter, setTopicFilter] = useState<string>(initialTopicFilter || 'all');
  const [queueFilter, setQueueFilter] = useState<SessionQueueFilter>('due');

  // Active review session state
  const [isFlipped, setIsFlipped] = useState(false);
  const [typedAttempt, setTypedAttempt] = useState('');
  const [enableScratchpad, setEnableScratchpad] = useState(true);
  const [sessionReviewedCount, setSessionReviewedCount] = useState(0);
  const [sessionGrades, setSessionGrades] = useState<RatingGrade[]>([]);
  const [cardStartTime, setCardStartTime] = useState<number>(Date.now());

  // Browser state
  const [searchQuery, setSearchQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState<'all' | FlashcardType>('all');

  // Create / Edit Modal state
  const [editingCard, setEditingCard] = useState<Flashcard | null>(null);
  const [showCardModal, setShowCardModal] = useState(false);
  const [formTopicId, setFormTopicId] = useState(topics[0]?.id || '__new__');
  const [newTopicTitle, setNewTopicTitle] = useState('');
  const [formType, setFormType] = useState<FlashcardType>('qa');
  const [formFront, setFormFront] = useState('');
  const [formBack, setFormBack] = useState('');
  const [formKeyTerms, setFormKeyTerms] = useState('');

  useEffect(() => {
    if (initialTopicFilter) {
      setTopicFilter(initialTopicFilter);
    }
  }, [initialTopicFilter]);

  const now = Date.now();

  const studyQueue = useMemo(() => {
    return flashcards
      .filter((c) => (topicFilter === 'all' ? true : c.topicId === topicFilter))
      .filter((c) => {
        if (queueFilter === 'due') return c.dueDate <= Date.now();
        if (queueFilter === 'new_only') return c.state === 'new';
        if (queueFilter === 'lapsed') return c.lapses > 0 || c.easeFactor < 2.3;
        return true;
      })
      .sort((a, b) => a.dueDate - b.dueDate);
  }, [flashcards, topicFilter, queueFilter]);

  const currentCard = studyQueue[0] || null;

  useEffect(() => {
    setIsFlipped(false);
    setTypedAttempt('');
    setCardStartTime(Date.now());
  }, [currentCard?.id]);

  // Keyboard shortcuts during active review session
  useEffect(() => {
    if (subView !== 'session' || showCardModal || !currentCard) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT') {
        if ((e.metaKey || e.ctrlKey) && e.key === 'Enter' && !isFlipped) {
          e.preventDefault();
          setIsFlipped(true);
        }
        return;
      }

      if (e.code === 'Space') {
        e.preventDefault();
        setIsFlipped((prev) => !prev);
      } else if (isFlipped) {
        if (e.key === '1') handleGradeCard(1);
        if (e.key === '2') handleGradeCard(2);
        if (e.key === '3') handleGradeCard(3);
        if (e.key === '4') handleGradeCard(4);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [subView, showCardModal, currentCard, isFlipped]);

  const handleGradeCard = async (grade: RatingGrade) => {
    if (!currentCard) return;
    const reviewTimeSec = Math.max(2, Math.round((Date.now() - cardStartTime) / 1000));
    const updated = scheduleFlashcardReview(currentCard, grade, Date.now());
    await onSaveFlashcard(updated);

    const log: StudyLog = {
      id: `log-fc-${Date.now()}`,
      dateStr: new Date().toISOString().slice(0, 10),
      activityType: 'flashcard_review',
      topicId: currentCard.topicId,
      durationSeconds: Math.min(120, reviewTimeSec),
      scoreOrGrade: grade,
      timestamp: Date.now(),
    };
    await onLogStudyActivity(log);

    setSessionReviewedCount((c) => c + 1);
    setSessionGrades((prev) => [...prev, grade]);
    setIsFlipped(false);
    setTypedAttempt('');
  };

  const openCreateModal = () => {
    setEditingCard(null);
    setFormTopicId(
      topicFilter !== 'all' ? topicFilter : topics[0]?.id || '__new__'
    );
    setNewTopicTitle('');
    setFormType('qa');
    setFormFront('');
    setFormBack('');
    setFormKeyTerms('');
    setShowCardModal(true);
  };

  const openEditModal = (card: Flashcard) => {
    setEditingCard(card);
    setFormTopicId(card.topicId);
    setNewTopicTitle('');
    setFormType(card.type);
    setFormFront(card.front);
    setFormBack(card.back);
    setFormKeyTerms(card.keyTerms.join(', '));
    setShowCardModal(true);
  };

  const handleInsertClozeHelper = () => {
    const nextIndex = (formFront.match(/\{\{c\d+::/g) || []).length + 1;
    setFormFront((prev) =>
      prev ? `${prev} {{c${nextIndex}::term}}` : `{{c1::term}}`
    );
    setFormType('cloze');
  };

  const handleSaveCardModal = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formFront.trim()) return;

    const nowTs = Date.now();
    let targetTopicId = formTopicId;

    if (formTopicId === '__new__' || !topics.length) {
      const createdTopic: Topic = {
        id: `topic-${nowTs}`,
        title: newTopicTitle.trim() || 'General Study',
        category: 'Personal Study',
        description: '',
        createdAt: nowTs,
        updatedAt: nowTs,
      };
      await onCreateTopic(createdTopic);
      targetTopicId = createdTopic.id;
    }

    const terms = formKeyTerms
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean);

    if (editingCard) {
      await onSaveFlashcard({
        ...editingCard,
        topicId: targetTopicId,
        type: formType,
        front: formFront.trim(),
        back: formBack.trim(),
        keyTerms: terms,
      });
    } else {
      const created: Flashcard = {
        id: `fc-${nowTs}`,
        topicId: targetTopicId,
        type: formType,
        front: formFront.trim(),
        back: formBack.trim(),
        keyTerms: terms,
        state: 'new',
        easeFactor: 2.5,
        interval: 0,
        repetitions: 0,
        lapses: 0,
        dueDate: nowTs,
        createdAt: nowTs,
      };
      await onSaveFlashcard(created);
    }

    setShowCardModal(false);
  };

  const filteredBrowserCards = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    return flashcards
      .filter((c) => (topicFilter === 'all' ? true : c.topicId === topicFilter))
      .filter((c) => (typeFilter === 'all' ? true : c.type === typeFilter))
      .filter((c) => {
        if (!q) return true;
        return (
          c.front.toLowerCase().includes(q) ||
          c.back.toLowerCase().includes(q) ||
          c.keyTerms.some((t) => t.toLowerCase().includes(q))
        );
      });
  }, [flashcards, topicFilter, typeFilter, searchQuery]);

  const renderCardContent = (card: Flashcard, revealed: boolean) => {
    if (card.type === 'cloze') {
      const segments = parseClozeSegments(card.front);
      return (
        <div className="space-y-4">
          <p className="text-lg md:text-xl font-medium text-slate-100 leading-relaxed">
            {segments.map((seg, idx) => {
              if (seg.type === 'text') {
                return <span key={idx}>{seg.content}</span>;
              }
              if (!revealed) {
                return (
                  <span
                    key={idx}
                    className="inline-block mx-1 px-2.5 py-0.5 font-mono text-sm font-semibold text-sky-300 bg-sky-950/80 border-b-2 border-sky-400 rounded-xs"
                  >
                    [{seg.hint || `...`}]
                  </span>
                );
              }
              return (
                <span
                  key={idx}
                  className="inline-block mx-1 px-2 py-0.5 font-semibold text-emerald-300 bg-emerald-950/80 border-b-2 border-emerald-400 rounded-xs"
                >
                  {seg.content}
                </span>
              );
            })}
          </p>
          {revealed && card.back && (
            <div className="pt-4 border-t border-slate-800 text-sm text-slate-300 leading-relaxed whitespace-pre-line">
              {card.back}
            </div>
          )}
        </div>
      );
    }

    return (
      <div className="space-y-5">
        <p className="text-lg md:text-xl font-medium text-slate-100 leading-relaxed">
          {card.front}
        </p>
        {revealed && (
          <div className="pt-5 border-t border-slate-800 space-y-3">
            <div className="text-xs font-medium text-slate-400">Reference Answer</div>
            <div className="text-base text-slate-200 leading-relaxed whitespace-pre-line">
              {card.back}
            </div>
          </div>
        )}
      </div>
    );
  };

  const dueNowTotal = flashcards.filter(
    (c) => (topicFilter === 'all' || c.topicId === topicFilter) && c.dueDate <= now
  ).length;

  const nextIntervals = currentCard ? previewNextIntervals(currentCard) : null;
  const linkedMap = currentCard?.mindMapId
    ? mindmaps.find((m) => m.id === currentCard.mindMapId)
    : null;
  const linkedNode =
    linkedMap && currentCard?.sourceNodeId
      ? linkedMap.nodes.find((n) => n.id === currentCard.sourceNodeId)
      : null;

  return (
    <div className="max-w-7xl mx-auto px-6 py-8 space-y-6">
      {/* Top Action & Filter Bar */}
      <div className="flex flex-wrap items-center justify-between gap-4 pb-5 border-b border-slate-800">
        <div>
          <h1 className="text-2xl font-semibold text-slate-100 tracking-tight">
            Spaced Repetition Flashcards
          </h1>
          <div className="flex items-center gap-2 text-xs text-slate-400 mt-1 tabular-nums">
            <span>{dueNowTotal} cards due now</span>
            <span aria-hidden="true">·</span>
            <span>{flashcards.length} total cards in IndexedDB</span>
            <span aria-hidden="true">·</span>
            <span>{sessionReviewedCount} reviewed this session</span>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <select
            value={topicFilter}
            onChange={(e) => setTopicFilter(e.target.value)}
            className="px-3 py-1.5 text-xs font-medium text-slate-200 bg-slate-900 border border-slate-800 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-500"
          >
            <option value="all">All Study Topics ({flashcards.length})</option>
            {topics.map((t) => {
              const count = flashcards.filter((c) => c.topicId === t.id).length;
              return (
                <option key={t.id} value={t.id}>
                  {t.title} ({count})
                </option>
              );
            })}
          </select>

          <div className="flex items-center gap-1 p-1 bg-slate-900 border border-slate-800 rounded-lg">
            <button
              type="button"
              onClick={() => setSubView('session')}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                subView === 'session'
                  ? 'bg-slate-800 text-slate-100 shadow-xs'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Active Study Queue ({studyQueue.length})
            </button>
            <button
              type="button"
              onClick={() => setSubView('browser')}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                subView === 'browser'
                  ? 'bg-slate-800 text-slate-100 shadow-xs'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Browse &amp; Manage ({flashcards.length})
            </button>
          </div>

          <button
            type="button"
            onClick={openCreateModal}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-slate-950 bg-sky-400 rounded-lg hover:bg-sky-300 transition-colors whitespace-nowrap"
          >
            <Plus className="w-3.5 h-3.5" />
            New Flashcard
          </button>
        </div>
      </div>

      {subView === 'session' ? (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          {/* Left / Main Flashcard Review Stage (8 cols) */}
          <div className="lg:col-span-8 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-1 p-1 bg-slate-900 border border-slate-800 rounded-lg">
                <button
                  type="button"
                  onClick={() => setQueueFilter('due')}
                  className={`px-3 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                    queueFilter === 'due'
                      ? 'bg-slate-800 text-slate-100 shadow-xs'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  Due Now ({dueNowTotal})
                </button>
                <button
                  type="button"
                  onClick={() => setQueueFilter('new_only')}
                  className={`px-3 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                    queueFilter === 'new_only'
                      ? 'bg-slate-800 text-slate-100 shadow-xs'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  New Only
                </button>
                <button
                  type="button"
                  onClick={() => setQueueFilter('lapsed')}
                  className={`px-3 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                    queueFilter === 'lapsed'
                      ? 'bg-slate-800 text-slate-100 shadow-xs'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  Struggling / Lapsed
                </button>
                <button
                  type="button"
                  onClick={() => setQueueFilter('all_cram')}
                  className={`px-3 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                    queueFilter === 'all_cram'
                      ? 'bg-slate-800 text-slate-100 shadow-xs'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  Cram All
                </button>
              </div>

              <label className="inline-flex items-center gap-2 text-xs text-slate-400 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={enableScratchpad}
                  onChange={(e) => setEnableScratchpad(e.target.checked)}
                  className="rounded border-slate-700 bg-slate-900 text-sky-500 focus:ring-sky-500"
                />
                <span>Type answer scratchpad before flipping</span>
              </label>
            </div>

            {currentCard ? (
              <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 md:p-8 space-y-6">
                {/* Quiet Unboxed Card Metadata Header */}
                <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-400 pb-4 border-b border-slate-800">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-slate-200">
                      {topics.find((t) => t.id === currentCard.topicId)?.title || 'General Deck'}
                    </span>
                    <span aria-hidden="true">·</span>
                    <span>
                      {currentCard.type === 'cloze'
                        ? 'Cloze Deletion'
                        : currentCard.type === 'branch'
                        ? 'Mind Map Branch'
                        : 'Concept Q&A'}
                    </span>
                    {linkedNode && (
                      <>
                        <span aria-hidden="true">·</span>
                        <span>Node: {linkedNode.label}</span>
                      </>
                    )}
                  </div>

                  <div className="flex items-center gap-2 font-mono tabular-nums">
                    <span>Ease {currentCard.easeFactor.toFixed(2)}</span>
                    <span aria-hidden="true">·</span>
                    <span>Interval {formatIntervalLabel(currentCard.interval)}</span>
                    <span aria-hidden="true">·</span>
                    <button
                      type="button"
                      onClick={() => openEditModal(currentCard)}
                      className="text-slate-500 hover:text-slate-200 ml-1"
                      title="Edit Flashcard"
                    >
                      <Edit3 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                {/* Primary Card Prompt & Answer */}
                <div className="min-h-44 flex flex-col justify-center">
                  {renderCardContent(currentCard, isFlipped)}
                </div>

                {/* Optional Active Recall Scratchpad */}
                {enableScratchpad && (
                  <div className="pt-2">
                    <label className="block text-xs font-medium text-slate-400 mb-1.5">
                      Active Recall Scratchpad (Test your memory before flipping)
                    </label>
                    <textarea
                      rows={2}
                      value={typedAttempt}
                      onChange={(e) => setTypedAttempt(e.target.value)}
                      placeholder="Jot down key mechanisms, stoichiometry, or definitions..."
                      className="w-full px-3.5 py-2.5 text-sm text-slate-100 bg-slate-950 border border-slate-800 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-500"
                    />
                  </div>
                )}

                {/* Expected Key Terms + Mind Map Bridge when Flipped */}
                {isFlipped && (
                  <div className="flex flex-wrap items-center justify-between gap-3 pt-4 border-t border-slate-800 text-xs text-slate-400">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="font-medium text-slate-300">Key Concepts:</span>
                      {currentCard.keyTerms.length > 0 ? (
                        currentCard.keyTerms.map((term, i) => {
                          const matchedInAttempt =
                            typedAttempt.trim().length > 0 &&
                            typedAttempt.toLowerCase().includes(term.toLowerCase());
                          return (
                            <React.Fragment key={term}>
                              {i > 0 && <span aria-hidden="true">·</span>}
                              <span
                                className={
                                  matchedInAttempt
                                    ? 'text-emerald-400 font-semibold underline decoration-emerald-500'
                                    : 'text-slate-400'
                                }
                              >
                                {matchedInAttempt ? `✓ ${term}` : term}
                              </span>
                            </React.Fragment>
                          );
                        })
                      ) : (
                        <span>None specified</span>
                      )}
                    </div>

                    {linkedMap && (
                      <button
                        type="button"
                        onClick={() => onOpenMindMap(linkedMap.id)}
                        className="inline-flex items-center gap-1.5 text-xs font-medium text-sky-400 hover:text-sky-300 whitespace-nowrap"
                      >
                        <Network className="w-3.5 h-3.5" />
                        <span>View in Mind Map ({linkedMap.title})</span>
                      </button>
                    )}
                  </div>
                )}

                {/* Action Bar: Reveal Button OR 4 SM-2 Grading Buttons */}
                <div className="pt-4 border-t border-slate-800">
                  {!isFlipped ? (
                    <button
                      type="button"
                      onClick={() => setIsFlipped(true)}
                      className="w-full py-3 px-4 text-sm font-semibold text-slate-950 bg-sky-400 rounded-xl hover:bg-sky-300 transition-colors flex items-center justify-center gap-2"
                    >
                      <Eye className="w-4 h-4" />
                      <span>Reveal Answer</span>
                      <span className="text-xs font-mono text-slate-800 ml-2">[Space]</span>
                    </button>
                  ) : (
                    <div className="space-y-2">
                      <div className="text-xs text-slate-400 text-center">
                        Rate recall difficulty to schedule next review in IndexedDB
                      </div>
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                        <button
                          type="button"
                          onClick={() => handleGradeCard(1)}
                          className="flex flex-col items-center justify-center py-2.5 px-3 bg-rose-950/60 hover:bg-rose-900/70 border border-rose-800/70 rounded-xl transition-colors"
                        >
                          <span className="text-[11px] font-mono tabular-nums text-rose-300">
                            {nextIntervals?.[1]}
                          </span>
                          <span className="text-xs font-semibold text-rose-200 mt-0.5">
                            1 · Again
                          </span>
                        </button>

                        <button
                          type="button"
                          onClick={() => handleGradeCard(2)}
                          className="flex flex-col items-center justify-center py-2.5 px-3 bg-amber-950/60 hover:bg-amber-900/70 border border-amber-800/70 rounded-xl transition-colors"
                        >
                          <span className="text-[11px] font-mono tabular-nums text-amber-300">
                            {nextIntervals?.[2]}
                          </span>
                          <span className="text-xs font-semibold text-amber-200 mt-0.5">
                            2 · Hard
                          </span>
                        </button>

                        <button
                          type="button"
                          onClick={() => handleGradeCard(3)}
                          className="flex flex-col items-center justify-center py-2.5 px-3 bg-emerald-950/60 hover:bg-emerald-900/70 border border-emerald-800/70 rounded-xl transition-colors"
                        >
                          <span className="text-[11px] font-mono tabular-nums text-emerald-300">
                            {nextIntervals?.[3]}
                          </span>
                          <span className="text-xs font-semibold text-emerald-200 mt-0.5">
                            3 · Good
                          </span>
                        </button>

                        <button
                          type="button"
                          onClick={() => handleGradeCard(4)}
                          className="flex flex-col items-center justify-center py-2.5 px-3 bg-sky-950/60 hover:bg-sky-900/70 border border-sky-800/70 rounded-xl transition-colors"
                        >
                          <span className="text-[11px] font-mono tabular-nums text-sky-300">
                            {nextIntervals?.[4]}
                          </span>
                          <span className="text-xs font-semibold text-sky-200 mt-0.5">
                            4 · Easy
                          </span>
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            ) : (
              /* Queue Complete / Empty State */
              <div className="bg-slate-900 border border-slate-800 rounded-xl p-10 text-center space-y-4">
                <CheckCircle2 className="w-10 h-10 text-emerald-400 mx-auto" />
                <div className="space-y-1">
                  <h2 className="text-lg font-semibold text-slate-100">
                    {flashcards.length === 0
                      ? 'No Flashcards in Your Deck Yet'
                      : 'All Scheduled Cards Reviewed'}
                  </h2>
                  <p className="text-xs text-slate-400 max-w-md mx-auto">
                    {flashcards.length === 0
                      ? 'Create your first Q&A or Cloze Deletion flashcard below, or generate cards directly from nodes in your Mind Maps.'
                      : 'You have cleared your current spaced repetition queue. You can switch to Cram Mode to practice all cards regardless of due date, or add new cards.'}
                  </p>
                </div>
                <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
                  {flashcards.length > 0 && (
                    <button
                      type="button"
                      onClick={() => setQueueFilter('all_cram')}
                      className="px-4 py-2 text-xs font-semibold text-slate-950 bg-sky-400 rounded-lg hover:bg-sky-300 transition-colors"
                    >
                      Practice All in Cram Mode ({flashcards.length})
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={openCreateModal}
                    className="px-4 py-2 text-xs font-semibold text-slate-200 bg-slate-800 border border-slate-700 rounded-lg hover:bg-slate-700 transition-colors"
                  >
                    + Create Flashcard
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Right Column: Algorithm & Session Telemetry (4 cols) */}
          <div className="lg:col-span-4 space-y-5">
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-4">
              <h3 className="text-sm font-semibold text-slate-100">
                Session Retention Breakdown
              </h3>

              <div className="grid grid-cols-2 gap-4 pt-1 border-t border-slate-800">
                <div>
                  <div className="text-xs text-slate-400">Queue Remaining</div>
                  <div className="text-xl font-semibold text-slate-100 font-mono tabular-nums mt-0.5">
                    {studyQueue.length}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-slate-400">Completed Today</div>
                  <div className="text-xl font-semibold text-emerald-400 font-mono tabular-nums mt-0.5">
                    {sessionReviewedCount}
                  </div>
                </div>
              </div>

              {sessionGrades.length > 0 && (
                <div className="pt-3 border-t border-slate-800 space-y-2 text-xs">
                  <div className="flex items-center justify-between text-slate-400 tabular-nums">
                    <span>Recall Accuracy (Good / Easy)</span>
                    <span className="font-mono font-semibold text-slate-100">
                      {Math.round(
                        (sessionGrades.filter((g) => g >= 3).length / sessionGrades.length) * 100
                      )}
                      %
                    </span>
                  </div>
                </div>
              )}

              <div className="pt-3 border-t border-slate-800 space-y-2">
                <div className="text-xs font-medium text-slate-300">
                  Deck Maturity Distribution
                </div>
                <div className="space-y-1.5 text-xs text-slate-400 tabular-nums">
                  <div className="flex justify-between">
                    <span>○ New / Unseen</span>
                    <span className="font-mono text-slate-200">
                      {flashcards.filter((c) => c.state === 'new').length}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span>◐ Learning / Relearning</span>
                    <span className="font-mono text-slate-200">
                      {
                        flashcards.filter(
                          (c) => c.state === 'learning' || c.state === 'relearning'
                        ).length
                      }
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span>● Graduated Review</span>
                    <span className="font-mono text-slate-200">
                      {flashcards.filter((c) => c.state === 'review').length}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* Keyboard Shortcuts Guide */}
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-3">
              <div className="flex items-center gap-2 text-xs font-semibold text-slate-100">
                <Keyboard className="w-4 h-4 text-slate-400" />
                <span>Keyboard-First Controls</span>
              </div>
              <div className="space-y-2 text-xs text-slate-400">
                <div className="flex items-center justify-between">
                  <span>Flip / Reveal Answer</span>
                  <kbd className="px-2 py-0.5 font-mono text-[11px] text-slate-200 bg-slate-950 border border-slate-800 rounded">
                    Space
                  </kbd>
                </div>
                <div className="flex items-center justify-between">
                  <span>Rate Again (Reset to 10m)</span>
                  <kbd className="px-2 py-0.5 font-mono text-[11px] text-slate-200 bg-slate-950 border border-slate-800 rounded">
                    1
                  </kbd>
                </div>
                <div className="flex items-center justify-between">
                  <span>Rate Hard (1.2× Interval)</span>
                  <kbd className="px-2 py-0.5 font-mono text-[11px] text-slate-200 bg-slate-950 border border-slate-800 rounded">
                    2
                  </kbd>
                </div>
                <div className="flex items-center justify-between">
                  <span>Rate Good (Standard SM-2)</span>
                  <kbd className="px-2 py-0.5 font-mono text-[11px] text-slate-200 bg-slate-950 border border-slate-800 rounded">
                    3
                  </kbd>
                </div>
                <div className="flex items-center justify-between">
                  <span>Rate Easy (Bonus Interval)</span>
                  <kbd className="px-2 py-0.5 font-mono text-[11px] text-slate-200 bg-slate-950 border border-slate-800 rounded">
                    4
                  </kbd>
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : (
        /* Card Browser & Deck Table View */
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3 bg-slate-900 p-4 border border-slate-800 rounded-xl">
            <div className="relative flex-1 min-w-64">
              <Search className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Search flashcards by prompt, answer, or key term..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-3 py-1.5 text-xs text-slate-100 bg-slate-950 border border-slate-800 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-500"
              />
            </div>

            <div className="flex items-center gap-1 p-1 bg-slate-950 border border-slate-800 rounded-lg">
              {(['all', 'qa', 'cloze', 'branch'] as const).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setTypeFilter(t)}
                  className={`px-3 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                    typeFilter === t
                      ? 'bg-slate-800 text-slate-100 shadow-xs'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {t === 'all'
                    ? 'All Types'
                    : t === 'qa'
                    ? 'Q&A'
                    : t === 'cloze'
                    ? 'Cloze'
                    : 'Branch'}
                </button>
              ))}
            </div>
          </div>

          <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-800 bg-slate-950/60 text-[11px] font-semibold text-slate-400">
                    <th className="py-3 px-4">Prompt / Cloze Template</th>
                    <th className="py-3 px-4">Topic &amp; Type</th>
                    <th className="py-3 px-4 text-right">Ease</th>
                    <th className="py-3 px-4 text-right">Interval</th>
                    <th className="py-3 px-4 text-right">Schedule</th>
                    <th className="py-3 px-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800 text-xs">
                  {filteredBrowserCards.map((card) => {
                    const topic = topics.find((t) => t.id === card.topicId);
                    const dueInfo = formatDueRelative(card.dueDate, now);
                    return (
                      <tr key={card.id} className="hover:bg-slate-800/40 transition-colors">
                        <td className="py-3 px-4 max-w-md">
                          <div className="font-medium text-slate-100 line-clamp-1">
                            {card.front}
                          </div>
                          <div className="text-slate-400 line-clamp-1 mt-0.5">{card.back}</div>
                        </td>
                        <td className="py-3 px-4 whitespace-nowrap text-slate-300">
                          <span>{topic?.category || 'Study'}</span>
                          <span className="mx-1.5" aria-hidden="true">
                            ·
                          </span>
                          <span className="uppercase text-[11px] font-mono text-slate-400">
                            {card.type}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-right font-mono tabular-nums text-slate-300">
                          {card.easeFactor.toFixed(2)}
                        </td>
                        <td className="py-3 px-4 text-right font-mono tabular-nums text-slate-300">
                          {formatIntervalLabel(card.interval)}
                        </td>
                        <td className="py-3 px-4 text-right whitespace-nowrap tabular-nums">
                          <span
                            className={
                              dueInfo.isDue
                                ? 'text-sky-400 font-semibold'
                                : 'text-slate-400'
                            }
                          >
                            {dueInfo.label}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-right whitespace-nowrap">
                          <div className="inline-flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => openEditModal(card)}
                              className="p-1 text-slate-500 hover:text-slate-200"
                              title="Edit Card"
                            >
                              <Edit3 className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => onDeleteFlashcard(card.id)}
                              className="p-1 text-slate-500 hover:text-rose-400"
                              title="Delete Card"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                  {filteredBrowserCards.length === 0 && (
                    <tr>
                      <td colSpan={6} className="py-8 text-center text-slate-400">
                        No flashcards match your current filter.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Create / Edit Flashcard Modal */}
      {showCardModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
          <div className="w-full max-w-lg bg-slate-900 border border-slate-800 rounded-xl shadow-xl p-6 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <h3 className="text-base font-semibold text-slate-100">
                {editingCard ? 'Edit Flashcard' : 'Create Spaced Repetition Flashcard'}
              </h3>
              <button
                type="button"
                onClick={() => setShowCardModal(false)}
                className="p-1 text-slate-400 hover:text-slate-200"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveCardModal} className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">
                    Study Topic
                  </label>
                  <select
                    value={formTopicId}
                    onChange={(e) => setFormTopicId(e.target.value)}
                    className="w-full px-3 py-2 text-xs font-medium text-slate-100 bg-slate-950 border border-slate-800 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-500"
                  >
                    {topics.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.title}
                      </option>
                    ))}
                    <option value="__new__">+ Create New Study Topic...</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">
                    Card Format
                  </label>
                  <select
                    value={formType}
                    onChange={(e) => setFormType(e.target.value as FlashcardType)}
                    className="w-full px-3 py-2 text-xs font-medium text-slate-100 bg-slate-950 border border-slate-800 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-500"
                  >
                    <option value="qa">Standard Question &amp; Answer</option>
                    <option value="cloze">Cloze Deletion ({'{{c1::term}}'})</option>
                    <option value="branch">Mind Map Branch Synthesis</option>
                  </select>
                </div>
              </div>

              {(formTopicId === '__new__' || topics.length === 0) && (
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">
                    New Topic Title
                  </label>
                  <input
                    type="text"
                    required
                    value={newTopicTitle}
                    onChange={(e) => setNewTopicTitle(e.target.value)}
                    placeholder="Enter study topic name..."
                    className="w-full px-3 py-2 text-sm text-slate-100 bg-slate-950 border border-slate-800 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-500"
                  />
                </div>
              )}

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-xs font-medium text-slate-300">
                    {formType === 'cloze'
                      ? 'Cloze Template (Use {{c1::hidden phrase}})'
                      : 'Front Prompt / Question'}
                  </label>
                  <button
                    type="button"
                    onClick={handleInsertClozeHelper}
                    className="text-xs font-medium text-sky-400 hover:text-sky-300"
                  >
                    + Insert {'{{c1::Cloze}}'}
                  </button>
                </div>
                <textarea
                  rows={3}
                  required
                  value={formFront}
                  onChange={(e) => setFormFront(e.target.value)}
                  placeholder={
                    formType === 'cloze'
                      ? 'e.g., Complex I oxidizes {{c1::NADH}} via {{c2::FMN and Fe-S clusters}} while pumping 4 protons.'
                      : 'Enter a precise active-recall question...'
                  }
                  className="w-full px-3 py-2 text-sm text-slate-100 bg-slate-950 border border-slate-800 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-500"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">
                  {formType === 'cloze' ? 'Extra Context / Back Notes' : 'Back Answer / Explanation'}
                </label>
                <textarea
                  rows={3}
                  value={formBack}
                  onChange={(e) => setFormBack(e.target.value)}
                  placeholder="Detailed synthesis answer or mechanistic explanation..."
                  className="w-full px-3 py-2 text-sm text-slate-100 bg-slate-950 border border-slate-800 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-500"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">
                  Target Key Terms (Comma-separated, checked in Scratchpad)
                </label>
                <input
                  type="text"
                  value={formKeyTerms}
                  onChange={(e) => setFormKeyTerms(e.target.value)}
                  placeholder="e.g., ubiquinone, 4 H+, iron-sulfur"
                  className="w-full px-3 py-2 text-xs text-slate-100 bg-slate-950 border border-slate-800 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-500"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowCardModal(false)}
                  className="px-4 py-2 text-xs font-medium text-slate-400 hover:text-slate-200"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 text-xs font-semibold text-slate-950 bg-sky-400 rounded-lg hover:bg-sky-300 transition-colors"
                >
                  {editingCard ? 'Save Changes' : 'Add to Deck'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
