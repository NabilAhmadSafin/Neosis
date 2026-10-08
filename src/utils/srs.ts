import { BlurtConceptCheck, Flashcard, RatingGrade } from '../types/study';

const MINUTE_MS = 60 * 1000;
const DAY_MS = 24 * 60 * MINUTE_MS;

/**
 * Computes the next Spaced Repetition schedule for a flashcard using an enhanced SM-2 / FSRS-inspired algorithm.
 */
export function scheduleFlashcardReview(
  card: Flashcard,
  grade: RatingGrade,
  now: number = Date.now()
): Flashcard {
  let { easeFactor, interval, repetitions, lapses, state } = card;

  // Minimum ease factor is 1.3
  easeFactor = Math.max(1.3, easeFactor || 2.5);

  let nextDueDate = now;

  if (grade === 1) {
    // Again: reset repetitions, increment lapses if previously reviewed, schedule in 10 minutes
    if (repetitions > 0) {
      lapses += 1;
      state = 'relearning';
    } else {
      state = 'learning';
    }
    repetitions = 0;
    interval = 10 / (24 * 60); // 10 minutes expressed in days
    easeFactor = Math.max(1.3, easeFactor - 0.2);
    nextDueDate = now + 10 * MINUTE_MS;
  } else if (grade === 2) {
    // Hard
    if (repetitions === 0) {
      state = 'learning';
      interval = 1;
      repetitions = 1;
      nextDueDate = now + DAY_MS;
    } else {
      state = 'review';
      interval = Math.max(1, Math.round(interval * 1.2 * 10) / 10);
      repetitions += 1;
      nextDueDate = now + Math.round(interval * DAY_MS);
    }
    easeFactor = Math.max(1.3, easeFactor - 0.15);
  } else if (grade === 3) {
    // Good
    if (repetitions === 0) {
      state = 'learning';
      interval = 1;
      repetitions = 1;
    } else if (repetitions === 1) {
      state = 'review';
      interval = 4;
      repetitions = 2;
    } else {
      state = 'review';
      interval = Math.max(2, Math.round(interval * easeFactor));
      repetitions += 1;
    }
    nextDueDate = now + Math.round(interval * DAY_MS);
  } else if (grade === 4) {
    // Easy
    state = 'review';
    if (repetitions === 0) {
      interval = 4;
      repetitions = 1;
    } else if (repetitions === 1) {
      interval = 7;
      repetitions = 2;
    } else {
      interval = Math.max(4, Math.round(interval * easeFactor * 1.3));
      repetitions += 1;
    }
    easeFactor = Math.min(3.2, easeFactor + 0.15);
    nextDueDate = now + Math.round(interval * DAY_MS);
  }

  return {
    ...card,
    state,
    easeFactor: Math.round(easeFactor * 100) / 100,
    interval,
    repetitions,
    lapses,
    dueDate: nextDueDate,
    lastReviewedAt: now,
  };
}

/**
 * Formats an interval in days into a compact human-readable label for tabular display.
 */
export function formatIntervalLabel(intervalDays: number): string {
  if (intervalDays <= 0) return 'Now';
  if (intervalDays < 1 / 24) {
    const mins = Math.max(1, Math.round(intervalDays * 24 * 60));
    return `${mins}m`;
  }
  if (intervalDays < 1) {
    const hours = Math.max(1, Math.round(intervalDays * 24));
    return `${hours}h`;
  }
  const days = Math.round(intervalDays);
  if (days < 30) return `${days}d`;
  if (days < 365) return `${(days / 30).toFixed(1)}mo`;
  return `${(days / 365).toFixed(1)}y`;
}

/**
 * Previews the next interval string for each of the 4 rating buttons.
 */
export function previewNextIntervals(card: Flashcard): Record<RatingGrade, string> {
  const now = Date.now();
  return {
    1: formatIntervalLabel(scheduleFlashcardReview(card, 1, now).interval),
    2: formatIntervalLabel(scheduleFlashcardReview(card, 2, now).interval),
    3: formatIntervalLabel(scheduleFlashcardReview(card, 3, now).interval),
    4: formatIntervalLabel(scheduleFlashcardReview(card, 4, now).interval),
  };
}

/**
 * Formats relative due status for clean unboxed metadata.
 */
export function formatDueRelative(dueDate: number, now: number = Date.now()): {
  label: string;
  isDue: boolean;
  isOverdue: boolean;
} {
  const diff = dueDate - now;
  if (diff <= 0) {
    const overdueHours = Math.abs(diff) / (60 * MINUTE_MS);
    if (overdueHours < 1) {
      return { label: 'Due now', isDue: true, isOverdue: false };
    }
    if (overdueHours < 24) {
      return { label: `Due · ${Math.floor(overdueHours)}h ago`, isDue: true, isOverdue: true };
    }
    const overdueDays = Math.floor(overdueHours / 24);
    return { label: `Overdue · ${overdueDays}d`, isDue: true, isOverdue: true };
  }

  const hours = diff / (60 * MINUTE_MS);
  if (hours < 1) {
    return { label: `In ${Math.max(1, Math.ceil(diff / MINUTE_MS))}m`, isDue: false, isOverdue: false };
  }
  if (hours < 24) {
    return { label: `In ${Math.ceil(hours)}h`, isDue: false, isOverdue: false };
  }
  const days = Math.ceil(hours / 24);
  return { label: `In ${days}d`, isDue: false, isOverdue: false };
}

/**
 * Parses Cloze deletion syntax like:
 * "The {{c1::mitochondrial matrix}} is the site of {{c2::oxidative decarboxylation}}."
 */
export interface ClozeSegment {
  type: 'text' | 'cloze';
  content: string;
  hint?: string;
  index?: number;
}

export function parseClozeSegments(template: string): ClozeSegment[] {
  const regex = /\{\{(?:c\d+::)?([^}:]+)(?:::([^}]+))?\}\}/g;
  const segments: ClozeSegment[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  let clozeCounter = 1;

  while ((match = regex.exec(template)) !== null) {
    if (match.index > lastIndex) {
      segments.push({
        type: 'text',
        content: template.slice(lastIndex, match.index),
      });
    }
    segments.push({
      type: 'cloze',
      content: match[1].trim(),
      hint: match[2]?.trim(),
      index: clozeCounter++,
    });
    lastIndex = regex.lastIndex;
  }

  if (lastIndex < template.length) {
    segments.push({
      type: 'text',
      content: template.slice(lastIndex),
    });
  }

  return segments;
}

/**
 * Analyzes a user's free-recall Blurt text against a list of target concepts & key terms.
 */
export function analyzeBlurtCoverage(
  rawBlurtText: string,
  checks: Omit<BlurtConceptCheck, 'status' | 'matchedTerms' | 'autoDetected'>[]
): {
  conceptChecks: BlurtConceptCheck[];
  scorePercent: number;
} {
  const normalizedBlurt = rawBlurtText.toLowerCase();

  const evaluated: BlurtConceptCheck[] = checks.map((item) => {
    // Build candidate terms from keyTerms and significant words in concept title
    const titleWords = item.concept
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, '')
      .split(/\s+/)
      .filter((w) => w.length >= 4 && !['with', 'from', 'that', 'this', 'into', 'over', 'role'].includes(w));

    const allTargetTerms = Array.from(
      new Set([
        ...item.keyTerms.map((t) => t.toLowerCase().trim()).filter(Boolean),
        ...titleWords,
      ])
    );

    const matchedTerms: string[] = [];
    for (const term of allTargetTerms) {
      if (!term) continue;
      // Check stem or phrase match
      const stem = term.length > 6 ? term.slice(0, term.length - 2) : term;
      if (normalizedBlurt.includes(term) || normalizedBlurt.includes(stem)) {
        matchedTerms.push(term);
      }
    }

    const totalTargets = Math.max(1, allTargetTerms.length);
    const ratio = matchedTerms.length / totalTargets;

    let status: 'recalled' | 'partial' | 'missed' = 'missed';
    if (ratio >= 0.55 || (matchedTerms.length >= 2 && ratio >= 0.4)) {
      status = 'recalled';
    } else if (matchedTerms.length >= 1) {
      status = 'partial';
    }

    return {
      ...item,
      status,
      matchedTerms,
      autoDetected: status !== 'missed',
    };
  });

  const scorePercent = computeBlurtScore(evaluated);
  return { conceptChecks: evaluated, scorePercent };
}

export function computeBlurtScore(checks: BlurtConceptCheck[]): number {
  if (checks.length === 0) return 0;
  const totalPoints = checks.reduce((acc, c) => {
    if (c.status === 'recalled') return acc + 1;
    if (c.status === 'partial') return acc + 0.5;
    return acc;
  }, 0);
  return Math.round((totalPoints / checks.length) * 100);
}
