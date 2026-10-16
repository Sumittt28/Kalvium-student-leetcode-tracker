'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Shield, ShieldAlert, Trash2, UserPlus } from 'lucide-react';
import { toast } from 'sonner';

import { api } from '@/lib/api';
import {
  Badge,
  Button,
  Card,
  CardHeader,
  EmptyState,
  Modal,
  TableShell,
  TableSkeleton,
  Td,
  Th,
} from '@/components/ui';

interface Admin {
  id: string;
  email: string;
  name: string;
  isSuperAdmin: boolean;
  createdAt: string;
}

export function AdminManagement({ isSuperAdmin }: { isSuperAdmin: boolean }) {
  const queryClient = useQueryClient();
  const [showAddModal, setShowAddModal] = useState(false);
  const [newEmail, setNewEmail] = useState('');
  const [newName, setNewName] = useState('');

  const admins = useQuery({
    queryKey: ['admins'],
    queryFn: api.listAdmins,
  });

  const addAdmin = useMutation({
    mutationFn: (data: { email: string; name: string }) => api.addAdmin(data),
    onSuccess: () => {
      toast.success('Admin added successfully');
      void queryClient.invalidateQueries({ queryKey: ['admins'] });
      setShowAddModal(false);
      setNewEmail('');
      setNewName('');
    },
    onError: (error: Error) => toast.error('Failed to add admin', { description: error.message }),
  });

  const removeAdmin = useMutation({
    mutationFn: (id: string) => api.removeAdmin(id),
    onSuccess: () => {
      toast.success('Admin removed');
      void queryClient.invalidateQueries({ queryKey: ['admins'] });
    },
    onError: (error: Error) => toast.error('Failed to remove admin', { description: error.message }),
  });

  return (
    <>
      <Card>
        <CardHeader
          title={
            <span className="flex items-center gap-2">
              <Shield className="size-4" />
              Administrators
            </span>
          }
          description="Users with admin access to this platform"
          action={
            isSuperAdmin ? (
              <Button variant="primary" onClick={() => setShowAddModal(true)}>
                <UserPlus className="size-4" />
                Add Admin
              </Button>
            ) : null
          }
        />

        {admins.isLoading ? (
          <TableSkeleton rows={3} cols={4} />
        ) : !admins.data || admins.data.length === 0 ? (
          <EmptyState
            title="No admins found"
            description="Add administrators to manage the platform."
          />
        ) : (
          <TableShell>
            <thead>
              <tr>
                <Th>Name</Th>
                <Th>Email</Th>
                <Th>Role</Th>
                <Th>Added</Th>
                {isSuperAdmin ? <Th className="text-right">Actions</Th> : null}
              </tr>
            </thead>
            <tbody>
              {admins.data.map((admin: Admin) => (
                <tr key={admin.id} className="transition hover:bg-[var(--color-surface-sunken)]">
                  <Td className="font-medium">{admin.name}</Td>
                  <Td className="text-[var(--color-fg-muted)]">{admin.email}</Td>
                  <Td>
                    {admin.isSuperAdmin ? (
                      <Badge tone="brand" className="flex items-center gap-1 w-fit">
                        <ShieldAlert className="size-3" />
                        Super Admin
                      </Badge>
                    ) : (
                      <Badge tone="info">Admin</Badge>
                    )}
                  </Td>
                  <Td className="text-[var(--color-fg-muted)] text-xs">
                    {new Date(admin.createdAt).toLocaleDateString()}
                  </Td>
                  {isSuperAdmin ? (
                    <Td className="text-right">
                      {!admin.isSuperAdmin ? (
                        <Button
                          variant="ghost"
                          className="text-xs text-[var(--color-danger)]"
                          onClick={() => {
                            if (confirm(`Remove ${admin.name} as admin?`)) {
                              removeAdmin.mutate(admin.id);
                            }
                          }}
                        >
                          <Trash2 className="size-3.5" />
                          Remove
                        </Button>
                      ) : (
                        <span className="text-xs text-[var(--color-fg-subtle)]">Protected</span>
                      )}
                    </Td>
                  ) : null}
                </tr>
              ))}
            </tbody>
          </TableShell>
        )}
      </Card>

      {/* Add Admin Modal */}
      <Modal
        open={showAddModal}
        onClose={() => setShowAddModal(false)}
        title="Add New Administrator"
      >
        <form
          onSubmit={(e) => {
            e.preventDefault();
            addAdmin.mutate({ email: newEmail.trim(), name: newName.trim() });
          }}
          className="space-y-4"
        >
          <div>
            <label className="mb-1.5 block text-xs font-medium">Name</label>
            <input
              type="text"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="John Doe"
              required
              className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm outline-none focus:border-[var(--color-brand)]"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-medium">Email</label>
            <input
              type="email"
              value={newEmail}
              onChange={(e) => setNewEmail(e.target.value)}
              placeholder="email@kalvium.com"
              required
              className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm outline-none focus:border-[var(--color-brand)]"
            />
          </div>
          <p className="text-xs text-[var(--color-fg-muted)]">
            The new admin will receive a temporary password and must change it on first login.
          </p>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => setShowAddModal(false)}>
              Cancel
            </Button>
            <Button
              type="submit"
              variant="primary"
              loading={addAdmin.isPending}
              disabled={!newEmail.trim() || !newName.trim()}
            >
              Add Admin
            </Button>
          </div>
        </form>
      </Modal>
    </>
  );
}
