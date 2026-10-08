export type MindMapNodeColor = 'slate' | 'azure' | 'emerald' | 'amber' | 'rose' | 'violet';

export type NodeMastery = 'untested' | 'learning' | 'mastered';

export interface Topic {
  id: string;
  title: string;
  category: string;
  description: string;
  createdAt: number;
  updatedAt: number;
}

export interface MindMapNode {
  id: string;
  label: string;
  summary: string;
  keyTerms: string[];
  x: number;
  y: number;
  color: MindMapNodeColor;
  mastery: NodeMastery;
}

export interface MindMapEdge {
  id: string;
  source: string;
  target: string;
  label?: string;
  style?: 'solid' | 'dashed';
}

export interface MindMap {
  id: string;
  topicId: string;
  title: string;
  description: string;
  nodes: MindMapNode[];
  edges: MindMapEdge[];
  createdAt: number;
  updatedAt: number;
}

export type FlashcardState = 'new' | 'learning' | 'review' | 'relearning';
export type FlashcardType = 'qa' | 'cloze' | 'branch';
export type RatingGrade = 1 | 2 | 3 | 4; // 1 = Again, 2 = Hard, 3 = Good, 4 = Easy

export interface Flashcard {
  id: string;
  topicId: string;
  mindMapId?: string;
  sourceNodeId?: string;
  type: FlashcardType;
  front: string;
  back: string;
  keyTerms: string[];
  state: FlashcardState;
  easeFactor: number;
  interval: number; // in days; <1 represents fractional day (minutes)
  repetitions: number;
  lapses: number;
  dueDate: number; // epoch ms
  lastReviewedAt?: number;
  createdAt: number;
}

export type ConceptRecallStatus = 'recalled' | 'partial' | 'missed';

export interface BlurtConceptCheck {
  id: string;
  concept: string;
  details: string;
  keyTerms: string[];
  sourceNodeId?: string;
  status: ConceptRecallStatus;
  matchedTerms: string[];
  autoDetected: boolean;
}

export interface BlurtSession {
  id: string;
  topicId: string;
  mindMapId?: string;
  title: string;
  prompt: string;
  durationSeconds: number;
  timeLimitSeconds: number;
  rawBlurtText: string;
  wordCount: number;
  conceptChecks: BlurtConceptCheck[];
  scorePercent: number;
  selfReflection: string;
  createdAt: number;
}

export interface StudyLog {
  id: string;
  dateStr: string; // YYYY-MM-DD
  activityType: 'flashcard_review' | 'blurt_session' | 'mindmap_edit' | 'focus_block';
  topicId?: string;
  durationSeconds: number;
  scoreOrGrade?: number;
  timestamp: number;
}

export type ActiveWorkspaceTab = 'dashboard' | 'mindmaps' | 'flashcards' | 'blurting' | 'library';
