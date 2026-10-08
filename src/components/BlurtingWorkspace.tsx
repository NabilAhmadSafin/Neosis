import React, { useState, useEffect, useMemo } from 'react';
import {
  Flame,
  Clock,
  Lock,
  Unlock,
  CheckCircle2,
  AlertTriangle,
  Plus,
  RotateCcw,
  BookOpen,
  Trash2,
  ArrowRight,
  Check,
  Network,
} from 'lucide-react';
import {
  BlurtConceptCheck,
  BlurtSession,
  ConceptRecallStatus,
  Flashcard,
  MindMap,
  StudyLog,
  Topic,
} from '../types/study';
import { analyzeBlurtCoverage, computeBlurtScore } from '../utils/srs';

interface BlurtingWorkspaceProps {
  topics: Topic[];
  mindmaps: MindMap[];
  blurtSessions: BlurtSession[];
  initialMindMapId?: string | null;
  onSaveBlurtSession: (session: BlurtSession) => Promise<void>;
  onDeleteBlurtSession: (id: string) => Promise<void>;
  onCreateFlashcardsBatch: (cards: Flashcard[]) => Promise<void>;
  onUpdateMindMap: (map: MindMap) => Promise<void>;
  onLogStudyActivity: (log: StudyLog) => Promise<void>;
  onOpenMindMap: (mapId: string) => void;
}

type BlurtStage = 'setup' | 'writing' | 'review';

export const BlurtingWorkspace: React.FC<BlurtingWorkspaceProps> = ({
  topics,
  mindmaps,
  blurtSessions,
  initialMindMapId,
  onSaveBlurtSession,
  onDeleteBlurtSession,
  onCreateFlashcardsBatch,
  onUpdateMindMap,
  onLogStudyActivity,
  onOpenMindMap,
}) => {
  const [stage, setStage] = useState<BlurtStage>('setup');
  const [sourceMode, setSourceMode] = useState<'mindmap' | 'custom'>(
    mindmaps.length > 0 ? 'mindmap' : 'custom'
  );
  const [selectedMapId, setSelectedMapId] = useState<string>(
    initialMindMapId || mindmaps[0]?.id || ''
  );
  const [customTopicId, setCustomTopicId] = useState<string>(topics[0]?.id || 'general');
  const [customTitle, setCustomTitle] = useState<string>('');
  const [customPrompt, setCustomPrompt] = useState<string>('');
  const [customConceptsText, setCustomConceptsText] = useState<string>('');

  // Timer configuration (in seconds; 0 = untimed stopwatch)
  const [timeLimitSeconds, setTimeLimitSeconds] = useState<number>(300);
  const [elapsedSeconds, setElapsedSeconds] = useState<number>(0);
  const [timerRunning, setTimerRunning] = useState<boolean>(false);

  // Writing & Review state
  const [rawBlurtText, setRawBlurtText] = useState<string>('');
  const [activeSession, setActiveSession] = useState<BlurtSession | null>(null);
  const [createdCardIds, setCreatedCardIds] = useState<Record<string, boolean>>({});
  const [feedbackBanner, setFeedbackBanner] = useState<string | null>(null);

  useEffect(() => {
    if (initialMindMapId) {
      setSelectedMapId(initialMindMapId);
      setSourceMode('mindmap');
    }
  }, [initialMindMapId]);

  const selectedMap = useMemo(
    () => mindmaps.find((m) => m.id === selectedMapId) || mindmaps[0] || null,
    [mindmaps, selectedMapId]
  );

  // Live timer during writing stage
  useEffect(() => {
    if (stage !== 'writing' || !timerRunning) return;
    const interval = setInterval(() => {
      setElapsedSeconds((prev) => {
        const next = prev + 1;
        if (timeLimitSeconds > 0 && next >= timeLimitSeconds) {
          setTimerRunning(false);
        }
        return next;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [stage, timerRunning, timeLimitSeconds]);

  const showBanner = (msg: string) => {
    setFeedbackBanner(msg);
    setTimeout(() => {
      setFeedbackBanner((prev) => (prev === msg ? null : prev));
    }, 3500);
  };

  // Start Active Blurt Session
  const handleStartBlurt = () => {
    setRawBlurtText('');
    setElapsedSeconds(0);
    setTimerRunning(true);
    setCreatedCardIds({});
    setStage('writing');
  };

  // Complete Blurt & Run Concept Coverage Diff
  const handleFinishAndEvaluate = async () => {
    setTimerRunning(false);
    const now = Date.now();

    let targetChecks: Omit<BlurtConceptCheck, 'status' | 'matchedTerms' | 'autoDetected'>[] = [];
    let sessionTitle = '';
    let sessionPrompt = '';
    let sessionTopicId = topics[0]?.id || 'general';
    let sessionMapId: string | undefined = undefined;

    if (sourceMode === 'mindmap' && selectedMap) {
      sessionTitle = `${selectedMap.title} — Blurt Session`;
      sessionPrompt = `Recall all ${selectedMap.nodes.length} concept nodes, mechanisms, and key terms from "${selectedMap.title}".`;
      sessionTopicId = selectedMap.topicId;
      sessionMapId = selectedMap.id;

      targetChecks = selectedMap.nodes.map((node) => ({
        id: `chk-${node.id}`,
        concept: node.label,
        details: node.summary,
        keyTerms: node.keyTerms,
        sourceNodeId: node.id,
      }));
    } else {
      sessionTitle = customTitle.trim() || 'Active Recall Blurt';
      sessionPrompt =
        customPrompt.trim() ||
        'Write down everything you remember about the target concepts from memory.';
      sessionTopicId = customTopicId || topics[0]?.id || 'general';

      const lines = customConceptsText
        .split('\n')
        .map((l) => l.trim())
        .filter(Boolean);

      targetChecks = lines.map((line, idx) => {
        const parts = line.split('|').map((p) => p.trim());
        const concept = parts[0] || `Concept #${idx + 1}`;
        const details = parts[1] || parts[0] || '';
        const keyTerms = parts[2]
          ? parts[2]
              .split(',')
              .map((k) => k.trim())
              .filter(Boolean)
          : concept.split(' ').filter((w) => w.length > 3);

        return {
          id: `chk-custom-${idx}`,
          concept,
          details,
          keyTerms,
        };
      });
    }

    const { conceptChecks, scorePercent } = analyzeBlurtCoverage(rawBlurtText, targetChecks);
    const words = rawBlurtText
      .trim()
      .split(/\s+/)
      .filter(Boolean).length;

    const newSession: BlurtSession = {
      id: `blurt-${now}`,
      topicId: sessionTopicId,
      mindMapId: sessionMapId,
      title: sessionTitle,
      prompt: sessionPrompt,
      durationSeconds: Math.max(5, elapsedSeconds),
      timeLimitSeconds,
      rawBlurtText,
      wordCount: words,
      conceptChecks,
      scorePercent,
      selfReflection: '',
      createdAt: now,
    };

    await onSaveBlurtSession(newSession);
    await onLogStudyActivity({
      id: `log-blurt-${now}`,
      dateStr: new Date(now).toISOString().slice(0, 10),
      activityType: 'blurt_session',
      topicId: sessionTopicId,
      durationSeconds: Math.max(5, elapsedSeconds),
      scoreOrGrade: scorePercent,
      timestamp: now,
    });

    setActiveSession(newSession);
    setStage('review');
  };

  // Toggle individual concept recall status during Stage 3 review
  const handleToggleConceptStatus = async (checkId: string, nextStatus: ConceptRecallStatus) => {
    if (!activeSession) return;
    const updatedChecks = activeSession.conceptChecks.map((c) =>
      c.id === checkId ? { ...c, status: nextStatus, autoDetected: false } : c
    );
    const nextScore = computeBlurtScore(updatedChecks);
    const updatedSession: BlurtSession = {
      ...activeSession,
      conceptChecks: updatedChecks,
      scorePercent: nextScore,
    };
    setActiveSession(updatedSession);
    await onSaveBlurtSession(updatedSession);

    // Also sync mastery status back to the Mind Map node if linked
    const targetCheck = updatedChecks.find((c) => c.id === checkId);
    if (activeSession.mindMapId && targetCheck?.sourceNodeId) {
      const map = mindmaps.find((m) => m.id === activeSession.mindMapId);
      if (map) {
        const nextMastery =
          nextStatus === 'recalled'
            ? 'mastered'
            : nextStatus === 'partial'
            ? 'learning'
            : 'untested';
        const updatedNodes = map.nodes.map((n) =>
          n.id === targetCheck.sourceNodeId ? { ...n, mastery: nextMastery as any } : n
        );
        await onUpdateMindMap({ ...map, nodes: updatedNodes, updatedAt: Date.now() });
      }
    }
  };

  const handleUpdateReflection = async (reflectionText: string) => {
    if (!activeSession) return;
    const updated = { ...activeSession, selfReflection: reflectionText };
    setActiveSession(updated);
    await onSaveBlurtSession(updated);
  };

  // Convert a single missed/partial concept into a Flashcard
  const handleCreateCardFromGap = async (check: BlurtConceptCheck) => {
    if (!activeSession) return;
    const now = Date.now();
    const card: Flashcard = {
      id: `fc-gap-${now}-${check.id}`,
      topicId: activeSession.topicId,
      mindMapId: activeSession.mindMapId,
      sourceNodeId: check.sourceNodeId,
      type: 'qa',
      front: `[Blurt Gap] Explain the mechanism and key properties of ${check.concept}.`,
      back: check.details,
      keyTerms: check.keyTerms,
      state: 'new',
      easeFactor: 2.5,
      interval: 0,
      repetitions: 0,
      lapses: 0,
      dueDate: now,
      createdAt: now,
    };
    await onCreateFlashcardsBatch([card]);
    setCreatedCardIds((prev) => ({ ...prev, [check.id]: true }));
    showBanner(`Added "${check.concept}" to your Spaced Repetition deck`);
  };

  // Convert ALL missed or partial concepts into Flashcards at once
  const handleConvertAllGapsToFlashcards = async () => {
    if (!activeSession) return;
    const gaps = activeSession.conceptChecks.filter(
      (c) => (c.status === 'missed' || c.status === 'partial') && !createdCardIds[c.id]
    );
    if (gaps.length === 0) {
      showBanner('All missed/partial concepts have already been converted to flashcards.');
      return;
    }

    const now = Date.now();
    const newCards: Flashcard[] = gaps.map((check, i) => ({
      id: `fc-gap-${now}-${i}`,
      topicId: activeSession.topicId,
      mindMapId: activeSession.mindMapId,
      sourceNodeId: check.sourceNodeId,
      type: 'qa',
      front: `[Blurt Gap] Explain the mechanism and key details of ${check.concept}.`,
      back: check.details,
      keyTerms: check.keyTerms,
      state: 'new',
      easeFactor: 2.5,
      interval: 0,
      repetitions: 0,
      lapses: 0,
      dueDate: now,
      createdAt: now,
    }));

    await onCreateFlashcardsBatch(newCards);
    const nextCreated = { ...createdCardIds };
    for (const g of gaps) {
      nextCreated[g.id] = true;
    }
    setCreatedCardIds(nextCreated);
    showBanner(`Created ${newCards.length} flashcards from your blurt memory gaps!`);
  };

  const formatTimer = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  };

  const remainingSeconds =
    timeLimitSeconds > 0 ? Math.max(0, timeLimitSeconds - elapsedSeconds) : elapsedSeconds;

  const liveWordCount = useMemo(
    () =>
      rawBlurtText
        .trim()
        .split(/\s+/)
        .filter(Boolean).length,
    [rawBlurtText]
  );

  return (
    <div className="max-w-7xl mx-auto px-6 py-8 space-y-8">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 pb-5 border-b border-slate-200">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900 tracking-tight">
            Active Recall Blurting Studio
          </h1>
          <div className="flex items-center gap-2 text-xs text-slate-500 mt-1 tabular-nums">
            <span>Conceal reference notes</span>
            <span aria-hidden="true">·</span>
            <span>Timed free-recall dump</span>
            <span aria-hidden="true">·</span>
            <span>Automated concept gap detection &amp; flashcard generation</span>
          </div>
        </div>

        {stage !== 'setup' && (
          <button
            type="button"
            onClick={() => {
              setTimerRunning(false);
              setStage('setup');
            }}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            New Blurt Configuration
          </button>
        )}
      </div>

      {feedbackBanner && (
        <div className="flex items-center gap-2 px-4 py-2.5 bg-slate-900 text-white text-xs font-medium rounded-xl">
          <Check className="w-4 h-4 text-emerald-400" />
          <span>{feedbackBanner}</span>
        </div>
      )}

      {/* STAGE 1: SETUP &PAST SESSIONS */}
      {stage === 'setup' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          {/* Left Setup Card (7 cols) */}
          <div className="lg:col-span-7 bg-white border border-slate-200 rounded-xl p-6 space-y-6">
            <div className="flex items-center justify-between border-b border-slate-100 pb-4">
              <div>
                <h2 className="text-base font-semibold text-slate-900">
                  01. Configure Concealed Reference Source
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  Select a Mind Map or custom rubric to lock away while you blurt from memory.
                </p>
              </div>

              <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg">
                <button
                  type="button"
                  onClick={() => setSourceMode('mindmap')}
                  className={`px-3 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                    sourceMode === 'mindmap'
                      ? 'bg-white text-slate-900 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  From Mind Map
                </button>
                <button
                  type="button"
                  onClick={() => setSourceMode('custom')}
                  className={`px-3 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                    sourceMode === 'custom'
                      ? 'bg-white text-slate-900 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Custom Rubric
                </button>
              </div>
            </div>

            {sourceMode === 'mindmap' ? (
              mindmaps.length > 0 ? (
                <div className="space-y-4">
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1.5">
                      Target Mind Map (Nodes &amp; Key Terms will be concealed during writing)
                    </label>
                    <select
                      value={selectedMap?.id || ''}
                      onChange={(e) => setSelectedMapId(e.target.value)}
                      className="w-full px-3.5 py-2.5 text-sm font-medium text-slate-900 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:bg-white focus:ring-2 focus:ring-sky-600"
                    >
                      {mindmaps.map((m) => {
                        const t = topics.find((top) => top.id === m.topicId);
                        return (
                          <option key={m.id} value={m.id}>
                            {m.title} — {m.nodes.length} nodes ({t?.category || 'Study'})
                          </option>
                        );
                      })}
                    </select>
                  </div>

                  {selectedMap && (
                    <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-2">
                      <div className="flex items-center justify-between text-xs text-slate-600">
                        <span className="font-semibold text-slate-900">{selectedMap.title}</span>
                        <span className="font-mono tabular-nums">
                          {selectedMap.nodes.length} target concepts ·{' '}
                          {selectedMap.nodes.reduce((acc, n) => acc + n.keyTerms.length, 0)} key terms
                        </span>
                      </div>
                      {selectedMap.description && (
                        <p className="text-xs text-slate-500 leading-relaxed">
                          {selectedMap.description}
                        </p>
                      )}
                    </div>
                  )}
                </div>
              ) : (
                <div className="p-6 bg-slate-50 border border-slate-200 rounded-xl text-center space-y-3">
                  <p className="text-xs text-slate-600">
                    You don’t have any Mind Maps yet. Create a Mind Map first or use a Custom Rubric
                    for your blurt session.
                  </p>
                  <div className="flex items-center justify-center gap-2">
                    <button
                      type="button"
                      onClick={() => setSourceMode('custom')}
                      className="px-3.5 py-1.5 text-xs font-semibold text-white bg-slate-900 rounded-lg hover:bg-slate-800 transition-colors"
                    >
                      Use Custom Rubric
                    </button>
                  </div>
                </div>
              )
            ) : (
              <div className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">
                      Blurt Session Title
                    </label>
                    <input
                      type="text"
                      placeholder="Enter session title..."
                      value={customTitle}
                      onChange={(e) => setCustomTitle(e.target.value)}
                      className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:bg-white focus:ring-2 focus:ring-sky-600"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">
                      Study Topic
                    </label>
                    <select
                      value={customTopicId}
                      onChange={(e) => setCustomTopicId(e.target.value)}
                      className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:bg-white focus:ring-2 focus:ring-sky-600"
                    >
                      {topics.length === 0 && (
                        <option value="general">General Study</option>
                      )}
                      {topics.map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.title}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Recall Prompt
                  </label>
                  <input
                    type="text"
                    placeholder="What question or topic are you recalling from memory?"
                    value={customPrompt}
                    onChange={(e) => setCustomPrompt(e.target.value)}
                    className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:bg-white focus:ring-2 focus:ring-sky-600"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Target Concepts Checklist (Optional — One per line: Concept | Details | comma,keywords)
                  </label>
                  <textarea
                    rows={4}
                    value={customConceptsText}
                    onChange={(e) => setCustomConceptsText(e.target.value)}
                    placeholder="Concept Name | Reference explanation | keyword1, keyword2"
                    className="w-full px-3 py-2 text-xs font-mono bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:bg-white focus:ring-2 focus:ring-sky-600"
                  />
                </div>
              </div>
            )}

            {/* Timer Selection */}
            <div className="pt-4 border-t border-slate-100 space-y-3">
              <label className="block text-xs font-semibold text-slate-900">
                02. Select Time Constraint
              </label>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {[
                  { sec: 180, label: '3 Min Sprint' },
                  { sec: 300, label: '5 Min Standard' },
                  { sec: 600, label: '10 Min Deep' },
                  { sec: 0, label: 'Untimed Stopwatch' },
                ].map((opt) => (
                  <button
                    key={opt.sec}
                    type="button"
                    onClick={() => setTimeLimitSeconds(opt.sec)}
                    className={`py-2 px-3 text-xs font-medium rounded-lg border transition-colors whitespace-nowrap ${
                      timeLimitSeconds === opt.sec
                        ? 'bg-slate-900 text-white border-slate-900'
                        : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            <button
              type="button"
              onClick={handleStartBlurt}
              className="w-full py-3 px-4 text-sm font-semibold text-white bg-sky-600 rounded-xl hover:bg-sky-700 transition-colors flex items-center justify-center gap-2"
            >
              <Lock className="w-4 h-4" />
              <span>Lock Reference Notes &amp; Start Blurt Timer</span>
            </button>
          </div>

          {/* Right Column: Past Blurt History & Progression (5 cols) */}
          <div className="lg:col-span-5 space-y-4">
            <h2 className="text-base font-semibold text-slate-900">
              Recent Blurt Sessions ({blurtSessions.length})
            </h2>

            <div className="space-y-3">
              {blurtSessions.map((session) => {
                const recalledCount = session.conceptChecks.filter(
                  (c) => c.status === 'recalled'
                ).length;
                const missedCount = session.conceptChecks.filter(
                  (c) => c.status === 'missed'
                ).length;

                return (
                  <div
                    key={session.id}
                    className="bg-white border border-slate-200 rounded-xl p-4 space-y-3 hover:border-slate-300 transition-colors"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <h3 className="text-sm font-semibold text-slate-900">{session.title}</h3>
                        <div className="flex items-center gap-1.5 text-xs text-slate-500 mt-0.5 tabular-nums">
                          <span>
                            {new Date(session.createdAt).toLocaleDateString(undefined, {
                              month: 'short',
                              day: 'numeric',
                            })}
                          </span>
                          <span aria-hidden="true">·</span>
                          <span>{session.wordCount} words</span>
                          <span aria-hidden="true">·</span>
                          <span>{formatTimer(session.durationSeconds)}</span>
                        </div>
                      </div>

                      <div className="text-right font-mono tabular-nums">
                        <div
                          className={`text-base font-semibold ${
                            session.scorePercent >= 80
                              ? 'text-emerald-700'
                              : session.scorePercent >= 50
                              ? 'text-amber-700'
                              : 'text-rose-700'
                          }`}
                        >
                          {session.scorePercent}%
                        </div>
                        <div className="text-[11px] text-slate-500">Recall</div>
                      </div>
                    </div>

                    <p className="text-xs text-slate-600 line-clamp-2 italic">
                      "{session.rawBlurtText}"
                    </p>

                    <div className="flex items-center justify-between pt-2 border-t border-slate-100 text-xs">
                      <div className="text-slate-500 tabular-nums">
                        <span>● {recalledCount} recalled</span>
                        <span className="mx-1.5" aria-hidden="true">
                          ·
                        </span>
                        <span className={missedCount > 0 ? 'text-rose-700 font-medium' : ''}>
                          ▲ {missedCount} gaps
                        </span>
                      </div>

                      <div className="flex items-center gap-3">
                        <button
                          type="button"
                          onClick={() => {
                            setActiveSession(session);
                            setCreatedCardIds({});
                            setStage('review');
                          }}
                          className="font-medium text-sky-700 hover:text-sky-800"
                        >
                          Inspect Gaps
                        </button>
                        <button
                          type="button"
                          onClick={() => onDeleteBlurtSession(session.id)}
                          className="text-slate-400 hover:text-rose-600"
                          title="Delete Session"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}

              {blurtSessions.length === 0 && (
                <div className="bg-white border border-slate-200 rounded-xl p-6 text-center text-xs text-slate-500">
                  No blurt sessions recorded yet. Start your first active recall sprint on the left!
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* STAGE 2: ACTIVE WRITING / FREE-RECALL PHASE */}
      {stage === 'writing' && (
        <div className="max-w-4xl mx-auto bg-white border border-slate-200 rounded-xl p-6 md:p-8 space-y-6">
          {/* Top Concealed Status & Live Timer */}
          <div className="flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-slate-200">
            <div className="space-y-1">
              <div className="inline-flex items-center gap-1.5 text-xs font-medium text-amber-700">
                <Lock className="w-3.5 h-3.5" />
                <span>
                  Reference Vault Locked (
                  {sourceMode === 'mindmap' && selectedMap
                    ? `${selectedMap.nodes.length} Mind Map Nodes Concealed`
                    : 'Custom Rubric Concealed'}
                  )
                </span>
              </div>
              <h2 className="text-lg font-semibold text-slate-900">
                {sourceMode === 'mindmap' && selectedMap
                  ? selectedMap.title
                  : customTitle || 'Active Recall Blurt'}
              </h2>
            </div>

            <div className="flex items-center gap-4">
              <div className="text-right">
                <div className="text-[11px] text-slate-500">
                  {timeLimitSeconds > 0 ? 'Time Remaining' : 'Elapsed Time'}
                </div>
                <div
                  className={`text-2xl font-mono font-semibold tabular-nums ${
                    timeLimitSeconds > 0 && remainingSeconds <= 30
                      ? 'text-rose-600'
                      : 'text-slate-900'
                  }`}
                >
                  {formatTimer(remainingSeconds)}
                </div>
              </div>

              <button
                type="button"
                onClick={handleFinishAndEvaluate}
                className="inline-flex items-center gap-2 px-4 py-2.5 text-xs font-semibold text-white bg-emerald-600 rounded-xl hover:bg-emerald-700 transition-colors whitespace-nowrap"
              >
                <Unlock className="w-4 h-4" />
                <span>Finish &amp; Reveal Gaps</span>
              </button>
            </div>
          </div>

          {/* Prompt Cue */}
          <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-700 leading-relaxed">
            <strong>Active Recall Prompt:</strong>{' '}
            {sourceMode === 'mindmap' && selectedMap
              ? `Write out everything you remember about "${selectedMap.title}". Include core definitions, causal links between nodes, stoichiometry/numbers, and boundary conditions.`
              : customPrompt ||
                'Write down everything you remember from memory without consulting external notes.'}
          </div>

          {/* Distraction-Free Writing Area */}
          <div>
            <textarea
              autoFocus
              rows={12}
              value={rawBlurtText}
              onChange={(e) => setRawBlurtText(e.target.value)}
              placeholder="Start typing everything you can recall... Don't worry about perfection—focus on retrieving mechanisms, key terms, and relationships from memory."
              className="w-full p-4 text-base leading-relaxed text-slate-900 bg-slate-50/50 border border-slate-200 rounded-xl focus:outline-none focus:bg-white focus:ring-2 focus:ring-sky-600"
            />
            <div className="flex items-center justify-between text-xs text-slate-500 mt-2 font-mono tabular-nums">
              <span>{liveWordCount} words written</span>
              <span>{rawBlurtText.length} characters</span>
            </div>
          </div>
        </div>
      )}

      {/* STAGE 3: GAP ANALYSIS, DIFF & FLASHCARD CONVERSION */}
      {stage === 'review' && activeSession && (
        <div className="space-y-6">
          {/* Summary Banner */}
          <div className="bg-white border border-slate-200 rounded-xl p-6 flex flex-wrap items-center justify-between gap-6">
            <div className="space-y-1">
              <div className="text-xs text-slate-500">
                Blurt Gap Analysis · {new Date(activeSession.createdAt).toLocaleString()}
              </div>
              <h2 className="text-xl font-semibold text-slate-900">{activeSession.title}</h2>
              <div className="flex flex-wrap items-center gap-3 text-xs text-slate-600 tabular-nums pt-1">
                <span className="text-emerald-700 font-medium">
                  ●{' '}
                  {activeSession.conceptChecks.filter((c) => c.status === 'recalled').length}{' '}
                  Recalled
                </span>
                <span aria-hidden="true">·</span>
                <span className="text-amber-700 font-medium">
                  ◐{' '}
                  {activeSession.conceptChecks.filter((c) => c.status === 'partial').length}{' '}
                  Partial
                </span>
                <span aria-hidden="true">·</span>
                <span className="text-rose-700 font-medium">
                  ▲{' '}
                  {activeSession.conceptChecks.filter((c) => c.status === 'missed').length} Missed
                  Gaps
                </span>
                <span aria-hidden="true">·</span>
                <span>{activeSession.wordCount} words in {formatTimer(activeSession.durationSeconds)}</span>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-4">
              <div className="text-right font-mono tabular-nums">
                <div className="text-xs text-slate-500">Recall Coverage Score</div>
                <div
                  className={`text-3xl font-bold ${
                    activeSession.scorePercent >= 80
                      ? 'text-emerald-700'
                      : activeSession.scorePercent >= 50
                      ? 'text-amber-700'
                      : 'text-rose-700'
                  }`}
                >
                  {activeSession.scorePercent}%
                </div>
              </div>

              <button
                type="button"
                onClick={handleConvertAllGapsToFlashcards}
                className="inline-flex items-center gap-2 px-4 py-2.5 text-xs font-semibold text-white bg-sky-600 rounded-xl hover:bg-sky-700 transition-colors whitespace-nowrap"
              >
                <BookOpen className="w-4 h-4" />
                <span>Convert All Gaps to Flashcards</span>
              </button>
            </div>
          </div>

          {/* Side-by-Side Comparison: Left = User's Blurt + Reflection | Right = Mind Map Reference Rubric */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            {/* Left Column: User's Raw Blurt & Self-Reflection (5 cols) */}
            <div className="lg:col-span-5 space-y-5">
              <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-slate-900">
                    Your Raw Free-Recall Blurt
                  </h3>
                  <span className="text-xs font-mono tabular-nums text-slate-500">
                    {activeSession.wordCount} words
                  </span>
                </div>

                <div className="p-4 bg-slate-50 border border-slate-200 rounded-lg text-sm text-slate-800 leading-relaxed whitespace-pre-wrap">
                  {activeSession.rawBlurtText || '(No text entered during blurt)'}
                </div>
              </div>

              <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-3">
                <label className="block text-sm font-semibold text-slate-900">
                  Self-Correction &amp; Gap Reflection Notes
                </label>
                <p className="text-xs text-slate-500">
                  Synthesize what you missed or confused so your next blurt locks it in.
                </p>
                <textarea
                  rows={4}
                  value={activeSession.selfReflection}
                  onChange={(e) => handleUpdateReflection(e.target.value)}
                  placeholder="What specific mechanism, term, or branch did you forget? Write the correction here..."
                  className="w-full p-3 text-xs leading-relaxed bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:bg-white focus:ring-2 focus:ring-sky-600"
                />
              </div>

              {activeSession.mindMapId && (
                <button
                  type="button"
                  onClick={() => onOpenMindMap(activeSession.mindMapId!)}
                  className="inline-flex items-center gap-1.5 text-xs font-medium text-sky-700 hover:text-sky-800"
                >
                  <Network className="w-4 h-4" />
                  <span>Open Reference Mind Map in Spatial Canvas</span>
                </button>
              )}
            </div>

            {/* Right Column: Reference Mind Map Rubric & Gap-to-Flashcard Generator (7 cols) */}
            <div className="lg:col-span-7 bg-white border border-slate-200 rounded-xl p-5 space-y-4">
              <div className="flex items-center justify-between pb-3 border-b border-slate-200">
                <div>
                  <h3 className="text-sm font-semibold text-slate-900">
                    Reference Concept Rubric &amp; Gap Detector
                  </h3>
                  <p className="text-xs text-slate-500">
                    Auto-scored by keyword stem matching. Adjust any concept’s recall state below or
                    turn missed concepts into flashcards.
                  </p>
                </div>
              </div>

              <div className="divide-y divide-slate-200">
                {activeSession.conceptChecks.map((check) => {
                  const isCardCreated = !!createdCardIds[check.id];
                  return (
                    <div key={check.id} className="py-4 first:pt-1 last:pb-1 space-y-2.5">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <h4 className="text-sm font-semibold text-slate-900">{check.concept}</h4>
                          <p className="text-xs text-slate-600 leading-relaxed mt-0.5">
                            {check.details}
                          </p>
                        </div>

                        {/* Interactive 3-state self-grading segmented control */}
                        <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg shrink-0">
                          <button
                            type="button"
                            onClick={() => handleToggleConceptStatus(check.id, 'recalled')}
                            className={`px-2.5 py-1 text-[11px] font-medium rounded transition-colors whitespace-nowrap ${
                              check.status === 'recalled'
                                ? 'bg-emerald-600 text-white'
                                : 'text-slate-600 hover:text-slate-900'
                            }`}
                          >
                            ● Recalled
                          </button>
                          <button
                            type="button"
                            onClick={() => handleToggleConceptStatus(check.id, 'partial')}
                            className={`px-2.5 py-1 text-[11px] font-medium rounded transition-colors whitespace-nowrap ${
                              check.status === 'partial'
                                ? 'bg-amber-600 text-white'
                                : 'text-slate-600 hover:text-slate-900'
                            }`}
                          >
                            ◐ Partial
                          </button>
                          <button
                            type="button"
                            onClick={() => handleToggleConceptStatus(check.id, 'missed')}
                            className={`px-2.5 py-1 text-[11px] font-medium rounded transition-colors whitespace-nowrap ${
                              check.status === 'missed'
                                ? 'bg-rose-600 text-white'
                                : 'text-slate-600 hover:text-slate-900'
                            }`}
                          >
                            ▲ Missed
                          </button>
                        </div>
                      </div>

                      {/* Key terms match row + Convert to Flashcard button */}
                      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="text-[11px] text-slate-400">Expected Terms:</span>
                          {check.keyTerms.map((term, idx) => {
                            const wasMatched = check.matchedTerms.some(
                              (m) =>
                                term.toLowerCase().includes(m) || m.includes(term.toLowerCase())
                            );
                            return (
                              <React.Fragment key={term}>
                                {idx > 0 && <span aria-hidden="true">·</span>}
                                <span
                                  className={
                                    wasMatched
                                      ? 'text-emerald-700 font-medium'
                                      : 'text-slate-500'
                                  }
                                >
                                  {wasMatched ? `✓ ${term}` : term}
                                </span>
                              </React.Fragment>
                            );
                          })}
                        </div>

                        <button
                          type="button"
                          disabled={isCardCreated}
                          onClick={() => handleCreateCardFromGap(check)}
                          className={`inline-flex items-center gap-1 text-xs font-medium whitespace-nowrap ${
                            isCardCreated
                              ? 'text-emerald-700 cursor-default'
                              : 'text-sky-700 hover:text-sky-800'
                          }`}
                        >
                          {isCardCreated ? (
                            <>
                              <Check className="w-3.5 h-3.5" />
                              <span>Added to Deck</span>
                            </>
                          ) : (
                            <>
                              <Plus className="w-3.5 h-3.5" />
                              <span>Make Flashcard</span>
                            </>
                          )}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
