import { BlurtSession, Flashcard, MindMap, StudyLog, Topic } from '../types/study';

const DB_NAME = 'noesis_study_db';
const DB_VERSION = 1;

export const STORES = {
  TOPICS: 'topics',
  MINDMAPS: 'mindmaps',
  FLASHCARDS: 'flashcards',
  BLURT_SESSIONS: 'blurtSessions',
  STUDY_LOGS: 'studyLogs',
} as const;

let dbPromise: Promise<IDBDatabase> | null = null;

export function openStudyDatabase(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;

  dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;

      if (!db.objectStoreNames.contains(STORES.TOPICS)) {
        db.createObjectStore(STORES.TOPICS, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(STORES.MINDMAPS)) {
        const mmStore = db.createObjectStore(STORES.MINDMAPS, { keyPath: 'id' });
        mmStore.createIndex('topicId', 'topicId', { unique: false });
      }
      if (!db.objectStoreNames.contains(STORES.FLASHCARDS)) {
        const fcStore = db.createObjectStore(STORES.FLASHCARDS, { keyPath: 'id' });
        fcStore.createIndex('topicId', 'topicId', { unique: false });
        fcStore.createIndex('dueDate', 'dueDate', { unique: false });
      }
      if (!db.objectStoreNames.contains(STORES.BLURT_SESSIONS)) {
        const bsStore = db.createObjectStore(STORES.BLURT_SESSIONS, { keyPath: 'id' });
        bsStore.createIndex('topicId', 'topicId', { unique: false });
      }
      if (!db.objectStoreNames.contains(STORES.STUDY_LOGS)) {
        const slStore = db.createObjectStore(STORES.STUDY_LOGS, { keyPath: 'id' });
        slStore.createIndex('dateStr', 'dateStr', { unique: false });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });

  return dbPromise;
}

async function getAllFromStore<T>(storeName: string): Promise<T[]> {
  const db = await openStudyDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readonly');
    const store = tx.objectStore(storeName);
    const req = store.getAll();
    req.onsuccess = () => resolve(req.result as T[]);
    req.onerror = () => reject(req.error);
  });
}

async function putInStore<T>(storeName: string, item: T): Promise<T> {
  const db = await openStudyDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readwrite');
    const store = tx.objectStore(storeName);
    const req = store.put(item);
    req.onsuccess = () => resolve(item);
    req.onerror = () => reject(req.error);
  });
}

async function deleteFromStore(storeName: string, id: string): Promise<void> {
  const db = await openStudyDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readwrite');
    const store = tx.objectStore(storeName);
    const req = store.delete(id);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

export async function clearAllStores(): Promise<void> {
  const db = await openStudyDatabase();
  const storeNames = Object.values(STORES);
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeNames, 'readwrite');
    for (const name of storeNames) {
      tx.objectStore(name).clear();
    }
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export interface FullStudySnapshot {
  topics: Topic[];
  mindmaps: MindMap[];
  flashcards: Flashcard[];
  blurtSessions: BlurtSession[];
  studyLogs: StudyLog[];
}

export async function loadDatabase(): Promise<FullStudySnapshot> {
  // Ensure any previously seeded example data is wiped once to guarantee a clean slate
  const freshSlateApplied = localStorage.getItem('noesis_fresh_slate_v2');
  if (!freshSlateApplied) {
    await clearAllStores();
    localStorage.removeItem('noesis_idb_initialized_v1');
    localStorage.setItem('noesis_fresh_slate_v2', 'true');
    return {
      topics: [],
      mindmaps: [],
      flashcards: [],
      blurtSessions: [],
      studyLogs: [],
    };
  }

  const [topics, mindmaps, flashcards, blurtSessions, studyLogs] = await Promise.all([
    getAllFromStore<Topic>(STORES.TOPICS),
    getAllFromStore<MindMap>(STORES.MINDMAPS),
    getAllFromStore<Flashcard>(STORES.FLASHCARDS),
    getAllFromStore<BlurtSession>(STORES.BLURT_SESSIONS),
    getAllFromStore<StudyLog>(STORES.STUDY_LOGS),
  ]);

  return {
    topics: topics.sort((a, b) => b.updatedAt - a.updatedAt),
    mindmaps: mindmaps.sort((a, b) => b.updatedAt - a.updatedAt),
    flashcards: flashcards.sort((a, b) => a.dueDate - b.dueDate),
    blurtSessions: blurtSessions.sort((a, b) => b.createdAt - a.createdAt),
    studyLogs: studyLogs.sort((a, b) => b.timestamp - a.timestamp),
  };
}

export async function restoreSnapshotToIndexedDB(snapshot: FullStudySnapshot): Promise<void> {
  await clearAllStores();
  const db = await openStudyDatabase();
  const storeNames = Object.values(STORES);

  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeNames, 'readwrite');

    for (const t of snapshot.topics || []) {
      tx.objectStore(STORES.TOPICS).put(t);
    }
    for (const m of snapshot.mindmaps || []) {
      tx.objectStore(STORES.MINDMAPS).put(m);
    }
    for (const f of snapshot.flashcards || []) {
      tx.objectStore(STORES.FLASHCARDS).put(f);
    }
    for (const b of snapshot.blurtSessions || []) {
      tx.objectStore(STORES.BLURT_SESSIONS).put(b);
    }
    for (const l of snapshot.studyLogs || []) {
      tx.objectStore(STORES.STUDY_LOGS).put(l);
    }

    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function clearAllDatabaseData(): Promise<FullStudySnapshot> {
  await clearAllStores();
  return {
    topics: [],
    mindmaps: [],
    flashcards: [],
    blurtSessions: [],
    studyLogs: [],
  };
}

// Individual entity helpers
export const dbOperations = {
  saveTopic: (topic: Topic) => putInStore(STORES.TOPICS, topic),
  deleteTopic: async (topicId: string) => {
    await deleteFromStore(STORES.TOPICS, topicId);
  },
  saveMindMap: (mindMap: MindMap) => putInStore(STORES.MINDMAPS, mindMap),
  deleteMindMap: (id: string) => deleteFromStore(STORES.MINDMAPS, id),
  saveFlashcard: (card: Flashcard) => putInStore(STORES.FLASHCARDS, card),
  saveFlashcardsBatch: async (cards: Flashcard[]) => {
    const db = await openStudyDatabase();
    return new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORES.FLASHCARDS, 'readwrite');
      const store = tx.objectStore(STORES.FLASHCARDS);
      for (const c of cards) {
        store.put(c);
      }
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  },
  deleteFlashcard: (id: string) => deleteFromStore(STORES.FLASHCARDS, id),
  saveBlurtSession: (session: BlurtSession) => putInStore(STORES.BLURT_SESSIONS, session),
  deleteBlurtSession: (id: string) => deleteFromStore(STORES.BLURT_SESSIONS, id),
  saveStudyLog: (log: StudyLog) => putInStore(STORES.STUDY_LOGS, log),
};
