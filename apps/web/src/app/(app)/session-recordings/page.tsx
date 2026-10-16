'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Edit2, ExternalLink, Plus, Trash2, Video } from 'lucide-react';
import { toast } from 'sonner';

import { api } from '@/lib/api';
import { Badge, Button, Card, CardHeader } from '@/components/ui';

type SessionRecording = {
  id: string;
  cohort: number;
  sessionDate: string;
  recordingUrl: string;
  topic: string | null;
};

const COHORT_INFO: Record<number, { group: string; belt: string; color: 'brand' | 'info' }> = {
  1: { group: 'G1', belt: 'Belt 4', color: 'brand' },
  2: { group: 'G1', belt: 'Belt 5', color: 'brand' },
  3: { group: 'G2', belt: 'Belt 6+', color: 'info' },
};

export default function SessionRecordingsPage() {
  const queryClient = useQueryClient();
  
  // Only ADMIN can manage session recordings (they're global across all campuses)
  const me = useQuery({ queryKey: ['me'], queryFn: api.me });
  const canEdit = me.data?.role === 'ADMIN';

  const { data: recordings = [], isLoading } = useQuery({
    queryKey: ['session-recordings'],
    queryFn: () => api.sessionRecordings(),
    staleTime: 5 * 60_000,
  });

  const [addingToCohort, setAddingToCohort] = useState<number | null>(null);
  const [newRecording, setNewRecording] = useState({ sessionDate: '', recordingUrl: '', topic: '' });
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editData, setEditData] = useState({ sessionDate: '', recordingUrl: '', topic: '' });

  const createMutation = useMutation({
    mutationFn: (data: { cohort: number; sessionDate: string; recordingUrl: string; topic?: string }) =>
      api.createSessionRecording(data),
    onSuccess: () => {
      toast.success('Recording added');
      void queryClient.invalidateQueries({ queryKey: ['session-recordings'] });
      setAddingToCohort(null);
      setNewRecording({ sessionDate: '', recordingUrl: '', topic: '' });
    },
    onError: (err: Error) => toast.error('Failed to add', { description: err.message }),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: { recordingUrl?: string; topic?: string; sessionDate?: string } }) =>
      api.updateSessionRecording(id, data),
    onSuccess: () => {
      toast.success('Recording updated');
      void queryClient.invalidateQueries({ queryKey: ['session-recordings'] });
      setEditingId(null);
    },
    onError: (err: Error) => toast.error('Failed to update', { description: err.message }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.deleteSessionRecording(id),
    onSuccess: () => {
      toast.success('Recording deleted');
      void queryClient.invalidateQueries({ queryKey: ['session-recordings'] });
    },
    onError: (err: Error) => toast.error('Failed to delete', { description: err.message }),
  });

  // Group recordings by cohort
  const recordingsByCohort = new Map<number, SessionRecording[]>();
  for (const r of recordings) {
    const list = recordingsByCohort.get(r.cohort) ?? [];
    list.push(r);
    recordingsByCohort.set(r.cohort, list);
  }

  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr + 'T00:00:00');
    return d.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
  };

  const cohorts = [1, 2, 3];

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-[var(--color-brand)] border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Session Recordings</h1>
        <p className="text-[var(--color-fg-muted)]">
          Manage session recordings by cohort. All students in a cohort watch the same sessions regardless of campus.
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {cohorts.map((cohort) => {
          const info = COHORT_INFO[cohort];
          const recs = recordingsByCohort.get(cohort) ?? [];
          const isAdding = addingToCohort === cohort;

          return (
            <Card key={cohort}>
              <CardHeader
                title={
                  <div className="flex items-center gap-2">
                    <Video className="h-4 w-4" />
                    <Badge tone={info.color}>{info.group} · Cohort {cohort}</Badge>
                  </div>
                }
                description={`${info.belt} students · ${recs.length} recording${recs.length !== 1 ? 's' : ''}`}
                action={
                  canEdit ? (
                    <Button
                      variant="ghost"
                      onClick={() => {
                        setAddingToCohort(cohort);
                        setNewRecording({ sessionDate: new Date().toISOString().split('T')[0], recordingUrl: '', topic: '' });
                      }}
                    >
                      <Plus className="h-4 w-4" />
                      Add
                    </Button>
                  ) : null
                }
              />

              <div className="p-4 space-y-3">
                {/* Add new recording form */}
                {isAdding && (
                  <div className="space-y-3 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-sunken)] p-3">
                    <div>
                      <label className="text-xs font-medium text-[var(--color-fg-muted)]">Date</label>
                      <input
                        type="date"
                        value={newRecording.sessionDate}
                        onChange={(e) => setNewRecording({ ...newRecording, sessionDate: e.target.value })}
                        className="mt-1 w-full rounded border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm"
                      />
                    </div>
                    <div>
                      <label className="text-xs font-medium text-[var(--color-fg-muted)]">Topic</label>
                      <input
                        type="text"
                        placeholder="e.g., Arrays & Hashing"
                        value={newRecording.topic}
                        onChange={(e) => setNewRecording({ ...newRecording, topic: e.target.value })}
                        className="mt-1 w-full rounded border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm"
                      />
                    </div>
                    <div>
                      <label className="text-xs font-medium text-[var(--color-fg-muted)]">Recording URL</label>
                      <input
                        type="url"
                        placeholder="https://drive.google.com/..."
                        value={newRecording.recordingUrl}
                        onChange={(e) => setNewRecording({ ...newRecording, recordingUrl: e.target.value })}
                        className="mt-1 w-full rounded border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm"
                      />
                    </div>
                    <div className="flex gap-2">
                      <Button
                        variant="primary"
                        loading={createMutation.isPending}
                        disabled={!newRecording.sessionDate || !newRecording.recordingUrl}
                        onClick={() => createMutation.mutate({
                          cohort,
                          sessionDate: newRecording.sessionDate,
                          recordingUrl: newRecording.recordingUrl,
                          topic: newRecording.topic || undefined,
                        })}
                      >
                        Save Recording
                      </Button>
                      <Button variant="ghost" onClick={() => setAddingToCohort(null)}>
                        Cancel
                      </Button>
                    </div>
                  </div>
                )}

                {/* List of recordings */}
                {recs.length === 0 && !isAdding ? (
                  <div className="rounded-lg border border-dashed border-[var(--color-border)] py-8 text-center">
                    <Video className="mx-auto h-8 w-8 text-[var(--color-fg-subtle)]" />
                    <p className="mt-2 text-sm text-[var(--color-fg-muted)]">No recordings yet</p>
                    {canEdit && (
                      <Button
                        variant="ghost"
                        className="mt-2"
                        onClick={() => {
                          setAddingToCohort(cohort);
                          setNewRecording({ sessionDate: new Date().toISOString().split('T')[0], recordingUrl: '', topic: '' });
                        }}
                      >
                        Add first recording
                      </Button>
                    )}
                  </div>
                ) : (
                  <div className="space-y-2">
                    {recs.map((rec) => (
                      <div
                        key={rec.id}
                        className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-3"
                      >
                        {editingId === rec.id ? (
                          <div className="space-y-2">
                            <input
                              type="date"
                              value={editData.sessionDate}
                              onChange={(e) => setEditData({ ...editData, sessionDate: e.target.value })}
                              className="w-full rounded border border-[var(--color-border)] px-2 py-1 text-sm"
                            />
                            <input
                              type="text"
                              value={editData.topic}
                              onChange={(e) => setEditData({ ...editData, topic: e.target.value })}
                              placeholder="Topic"
                              className="w-full rounded border border-[var(--color-border)] px-2 py-1 text-sm"
                            />
                            <input
                              type="url"
                              value={editData.recordingUrl}
                              onChange={(e) => setEditData({ ...editData, recordingUrl: e.target.value })}
                              placeholder="URL"
                              className="w-full rounded border border-[var(--color-border)] px-2 py-1 text-sm"
                            />
                            <div className="flex gap-2">
                              <Button
                                variant="primary"
                                className="text-sm"
                                loading={updateMutation.isPending}
                                onClick={() => updateMutation.mutate({ id: rec.id, data: editData })}
                              >
                                Save
                              </Button>
                              <Button variant="ghost" className="text-sm" onClick={() => setEditingId(null)}>
                                Cancel
                              </Button>
                            </div>
                          </div>
                        ) : (
                          <div>
                            <div className="flex items-start justify-between">
                              <div>
                                <p className="text-sm font-medium">{rec.topic || 'Untitled Session'}</p>
                                <p className="text-xs text-[var(--color-fg-muted)]">{formatDate(rec.sessionDate)}</p>
                              </div>
                              {canEdit && (
                                <div className="flex gap-1">
                                  <button
                                    onClick={() => {
                                      setEditingId(rec.id);
                                      setEditData({
                                        sessionDate: rec.sessionDate,
                                        recordingUrl: rec.recordingUrl,
                                        topic: rec.topic ?? '',
                                      });
                                    }}
                                    className="rounded p-1.5 text-[var(--color-fg-muted)] hover:bg-[var(--color-surface-sunken)] hover:text-[var(--color-brand)]"
                                  >
                                    <Edit2 className="h-4 w-4" />
                                  </button>
                                  <button
                                    onClick={() => {
                                      if (confirm('Delete this recording?')) deleteMutation.mutate(rec.id);
                                    }}
                                    className="rounded p-1.5 text-[var(--color-fg-muted)] hover:bg-[var(--color-surface-sunken)] hover:text-[var(--color-danger)]"
                                  >
                                    <Trash2 className="h-4 w-4" />
                                  </button>
                                </div>
                              )}
                            </div>
                            <a
                              href={rec.recordingUrl}
                              target="_blank"
                              rel="noreferrer"
                              className="mt-2 inline-flex items-center gap-1.5 rounded-md bg-[var(--color-brand)] px-3 py-1.5 text-sm font-medium text-white hover:opacity-90"
                            >
                              <ExternalLink className="h-4 w-4" />
                              Watch Recording
                            </a>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
