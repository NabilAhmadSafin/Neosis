import React, { useRef, useState } from 'react';
import {
  Download,
  Upload,
  RotateCcw,
  Check,
  AlertCircle,
  HardDrive,
} from 'lucide-react';
import { FullStudySnapshot } from '../db/indexedDb';

interface DataSovereigntyViewProps {
  snapshot: FullStudySnapshot;
  onImportSnapshot: (snapshot: FullStudySnapshot) => Promise<void>;
  onClearAllData: () => Promise<void>;
}

export const DataSovereigntyView: React.FC<DataSovereigntyViewProps> = ({
  snapshot,
  onImportSnapshot,
  onClearAllData,
}) => {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);

  const handleExportJSON = () => {
    const payload = JSON.stringify(snapshot, null, 2);
    const blob = new Blob([payload], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const dateStr = new Date().toISOString().slice(0, 10);
    a.href = url;
    a.download = `noesis-indexeddb-backup-${dateStr}.json`;
    a.click();
    URL.revokeObjectURL(url);
    setStatusMessage('Exported full IndexedDB backup JSON file.');
    setErrorMessage(null);
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const parsed = JSON.parse(text) as FullStudySnapshot;
      if (!Array.isArray(parsed.topics) || !Array.isArray(parsed.mindmaps)) {
        throw new Error('Invalid backup format: missing topics or mindmaps arrays.');
      }
      await onImportSnapshot(parsed);
      setStatusMessage(
        `Imported ${parsed.topics.length} topics, ${parsed.mindmaps.length} mind maps, and ${
          parsed.flashcards?.length || 0
        } flashcards into IndexedDB.`
      );
      setErrorMessage(null);
    } catch (err: any) {
      setErrorMessage(err?.message || 'Failed to parse backup JSON file.');
      setStatusMessage(null);
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleReset = async () => {
    await onClearAllData();
    setConfirmReset(false);
    setStatusMessage('Cleared all local IndexedDB object stores.');
    setErrorMessage(null);
  };

  const totalNodes = snapshot.mindmaps.reduce((acc, m) => acc + m.nodes.length, 0);
  const totalEdges = snapshot.mindmaps.reduce((acc, m) => acc + m.edges.length, 0);

  return (
    <div className="max-w-5xl mx-auto px-6 py-8 space-y-8">
      <div className="pb-5 border-b border-slate-800">
        <h1 className="text-2xl font-semibold text-slate-100 tracking-tight">
          Local IndexedDB Storage &amp; Data Sovereignty
        </h1>
        <p className="text-xs text-slate-400 mt-1">
          All mind maps, spaced repetition schedules, and active recall blurt sessions are stored
          locally in your browser’s <code className="font-mono text-slate-300">noesis_study_db</code>{' '}
          IndexedDB database with zero external account requirement.
        </p>
      </div>

      {statusMessage && (
        <div className="flex items-center gap-2 p-4 bg-emerald-950/60 border border-emerald-800/70 rounded-xl text-xs font-medium text-emerald-200">
          <Check className="w-4 h-4 text-emerald-400 shrink-0" />
          <span>{statusMessage}</span>
        </div>
      )}

      {errorMessage && (
        <div className="flex items-center gap-2 p-4 bg-rose-950/60 border border-rose-800/70 rounded-xl text-xs font-medium text-rose-200">
          <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
          <span>{errorMessage}</span>
        </div>
      )}

      {/* Object Store Inventory Table */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <HardDrive className="w-4 h-4 text-slate-400" />
            <h2 className="text-sm font-semibold text-slate-100">
              IndexedDB Object Store Inventory (<code className="font-mono">noesis_study_db</code>)
            </h2>
          </div>
          <span className="text-xs text-emerald-400 font-medium">● Persistent Local Storage</span>
        </div>

        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="border-b border-slate-800 bg-slate-950/60 text-[11px] font-semibold text-slate-400">
              <th className="py-3 px-6">Object Store</th>
              <th className="py-3 px-6">Indexed Keys</th>
              <th className="py-3 px-6 text-right">Records Stored</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800 text-xs">
            <tr>
              <td className="py-3.5 px-6 font-mono font-medium text-slate-200">topics</td>
              <td className="py-3.5 px-6 font-mono text-slate-400">id (primary)</td>
              <td className="py-3.5 px-6 text-right font-mono tabular-nums text-slate-200">
                {snapshot.topics.length}
              </td>
            </tr>
            <tr>
              <td className="py-3.5 px-6 font-mono font-medium text-slate-200">mindmaps</td>
              <td className="py-3.5 px-6 font-mono text-slate-400">id, topicId</td>
              <td className="py-3.5 px-6 text-right font-mono tabular-nums text-slate-200">
                {snapshot.mindmaps.length} ({totalNodes} nodes · {totalEdges} edges)
              </td>
            </tr>
            <tr>
              <td className="py-3.5 px-6 font-mono font-medium text-slate-200">flashcards</td>
              <td className="py-3.5 px-6 font-mono text-slate-400">id, topicId, dueDate</td>
              <td className="py-3.5 px-6 text-right font-mono tabular-nums text-slate-200">
                {snapshot.flashcards.length}
              </td>
            </tr>
            <tr>
              <td className="py-3.5 px-6 font-mono font-medium text-slate-200">blurtSessions</td>
              <td className="py-3.5 px-6 font-mono text-slate-400">id, topicId</td>
              <td className="py-3.5 px-6 text-right font-mono tabular-nums text-slate-200">
                {snapshot.blurtSessions.length}
              </td>
            </tr>
            <tr>
              <td className="py-3.5 px-6 font-mono font-medium text-slate-200">studyLogs</td>
              <td className="py-3.5 px-6 font-mono text-slate-400">id, dateStr</td>
              <td className="py-3.5 px-6 text-right font-mono tabular-nums text-slate-200">
                {snapshot.studyLogs.length}
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* Backup, Restore & Wipe Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 flex flex-col justify-between space-y-4">
          <div className="space-y-1.5">
            <h3 className="text-sm font-semibold text-slate-100">Export JSON Snapshot</h3>
            <p className="text-xs text-slate-400 leading-relaxed">
              Download your entire IndexedDB database—including spatial coordinates, SM-2 intervals,
              and blurt transcripts—as a portable JSON file.
            </p>
          </div>
          <button
            type="button"
            onClick={handleExportJSON}
            className="inline-flex items-center justify-center gap-2 w-full py-2.5 px-4 text-xs font-semibold text-slate-950 bg-sky-400 rounded-lg hover:bg-sky-300 transition-colors"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Export Backup (.json)</span>
          </button>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 flex flex-col justify-between space-y-4">
          <div className="space-y-1.5">
            <h3 className="text-sm font-semibold text-slate-100">Import JSON Snapshot</h3>
            <p className="text-xs text-slate-400 leading-relaxed">
              Restore a previously exported Noesis JSON backup file directly into your browser’s
              IndexedDB object stores.
            </p>
          </div>
          <div>
            <input
              ref={fileInputRef}
              type="file"
              accept="application/json"
              onChange={handleFileChange}
              className="hidden"
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="inline-flex items-center justify-center gap-2 w-full py-2.5 px-4 text-xs font-semibold text-slate-200 bg-slate-800 border border-slate-700 rounded-lg hover:bg-slate-700 transition-colors"
            >
              <Upload className="w-3.5 h-3.5" />
              <span>Restore from File</span>
            </button>
          </div>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 flex flex-col justify-between space-y-4">
          <div className="space-y-1.5">
            <h3 className="text-sm font-semibold text-slate-100">Clear All Local Data</h3>
            <p className="text-xs text-slate-400 leading-relaxed">
              Permanently wipe all study topics, mind maps, flashcards, and blurt sessions from
              your browser’s IndexedDB database.
            </p>
          </div>
          {!confirmReset ? (
            <button
              type="button"
              onClick={() => setConfirmReset(true)}
              className="inline-flex items-center justify-center gap-2 w-full py-2.5 px-4 text-xs font-medium text-rose-300 bg-rose-950/50 border border-rose-800/70 rounded-lg hover:bg-rose-900/60 transition-colors"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Wipe IndexedDB</span>
            </button>
          ) : (
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleReset}
                className="flex-1 py-2 px-3 text-xs font-semibold text-white bg-rose-600 rounded-lg hover:bg-rose-500"
              >
                Confirm Wipe
              </button>
              <button
                type="button"
                onClick={() => setConfirmReset(false)}
                className="py-2 px-3 text-xs font-medium text-slate-400 hover:text-slate-200"
              >
                Cancel
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
