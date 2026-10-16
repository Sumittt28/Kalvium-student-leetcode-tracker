'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Mail, Phone, Plus, Shield, Trash2, User, UserPlus } from 'lucide-react';
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
  lastLoginAt?: string | null;
}

export function AdminManagement() {
  const queryClient = useQueryClient();
  const [showAddModal, setShowAddModal] = useState(false);
  const [newName, setNewName] = useState('');
  const [newEmail, setNewEmail] = useState('');

  const admins = useQuery({
    queryKey: ['admins'],
    queryFn: api.listAdmins,
  });

  const addAdmin = useMutation({
    mutationFn: (data: { name: string; email: string }) => api.addAdmin(data),
    onSuccess: (result) => {
      toast.success('Admin added', { 
        description: `${result.name} has been added. Temp password: ${result.tempPassword}` 
      });
      void queryClient.invalidateQueries({ queryKey: ['admins'] });
      setShowAddModal(false);
      setNewName('');
      setNewEmail('');
    },
    onError: (error: Error) => toast.error('Failed to add admin', { description: error.message }),
  });

  const removeAdmin = useMutation({
    mutationFn: (id: string) => api.removeAdmin(id),
    onSuccess: () => {
      toast.success('Admin removed');
      void queryClient.invalidateQueries({ queryKey: ['admins'] });
    },
    onError: (error: Error) => toast.error('Failed to remove', { description: error.message }),
  });

  // Protected emails that cannot be removed
  const protectedEmails = ['vishnu.murali@kalvium.com', 'sumit.singh@kalvium.com', 'admin@kalvium.com'];

  return (
    <div className="space-y-5">
      {/* Contact Information */}
      <Card>
        <CardHeader
          title={
            <span className="flex items-center gap-2">
              <Phone className="size-4" />
              Tool Support Contact
            </span>
          }
          description="For any tool-related issues or questions, contact:"
        />
        <div className="p-5">
          <div className="flex items-center gap-4 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-sunken)] p-4">
            <div className="grid size-12 place-items-center rounded-full bg-[var(--color-brand-soft)]">
              <User className="size-6 text-[var(--color-brand)]" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <p className="font-semibold">Vishnu Murali</p>
                <Badge tone="brand" className="text-xs">Owner</Badge>
              </div>
              <a 
                href="mailto:vishnu.murali@kalvium.com" 
                className="flex items-center gap-1.5 text-sm text-[var(--color-brand)] hover:underline"
              >
                <Mail className="size-3.5" />
                vishnu.murali@kalvium.com
              </a>
            </div>
          </div>
        </div>
      </Card>

      {/* Administrators List */}
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
            <Button variant="primary" onClick={() => setShowAddModal(true)}>
              <UserPlus className="size-4" />
              Add Admin
            </Button>
          }
        />

        {admins.isLoading ? (
          <TableSkeleton rows={3} cols={5} />
        ) : !admins.data || admins.data.length === 0 ? (
          <EmptyState
            title="No admins found"
            description="No administrator accounts exist yet."
          />
        ) : (
          <TableShell>
            <thead>
              <tr>
                <Th>Name</Th>
                <Th>Email</Th>
                <Th>Added On</Th>
                <Th>Last Login</Th>
                <Th className="text-right">Actions</Th>
              </tr>
            </thead>
            <tbody>
              {admins.data.map((admin: Admin) => {
                // Determine role badge based on email
                const roleBadge = admin.email === 'vishnu.murali@kalvium.com' 
                  ? <Badge tone="brand" className="text-xs">Owner</Badge>
                  : admin.email === 'sumit.singh@kalvium.com'
                    ? <Badge tone="info" className="text-xs">Maintainer</Badge>
                    : null;
                
                const isProtected = protectedEmails.includes(admin.email);
                
                return (
                <tr key={admin.id} className="transition hover:bg-[var(--color-surface-sunken)]">
                  <Td className="font-medium">
                    <span className="flex items-center gap-2">
                      {admin.name}
                      {roleBadge}
                    </span>
                  </Td>
                  <Td>
                    <a 
                      href={`mailto:${admin.email}`}
                      className="text-[var(--color-fg-muted)] hover:text-[var(--color-brand)] hover:underline"
                    >
                      {admin.email}
                    </a>
                  </Td>
                  <Td className="text-[var(--color-fg-muted)] text-sm">
                    {new Date(admin.createdAt).toLocaleDateString('en-IN', {
                      day: 'numeric',
                      month: 'short',
                      year: 'numeric',
                    })}
                  </Td>
                  <Td className="text-[var(--color-fg-muted)] text-sm">
                    {admin.lastLoginAt 
                      ? new Date(admin.lastLoginAt).toLocaleDateString('en-IN', {
                          day: 'numeric',
                          month: 'short',
                          year: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit',
                        })
                      : <span className="text-[var(--color-fg-subtle)]">Never</span>
                    }
                  </Td>
                  <Td className="text-right">
                    {isProtected ? (
                      <span className="text-xs text-[var(--color-fg-subtle)]">Protected</span>
                    ) : (
                      <Button
                        variant="ghost"
                        className="text-xs text-[var(--color-danger)] hover:bg-[var(--color-danger-soft)]"
                        onClick={() => {
                          if (confirm(`Remove ${admin.name} from admin access?`)) {
                            removeAdmin.mutate(admin.id);
                          }
                        }}
                      >
                        <Trash2 className="size-3.5" />
                        Remove
                      </Button>
                    )}
                  </Td>
                </tr>
              );
              })}
            </tbody>
          </TableShell>
        )}
      </Card>

      {/* Add Admin Modal */}
      <Modal
        open={showAddModal}
        onClose={() => setShowAddModal(false)}
        title="Add Administrator"
      >
        <form
          onSubmit={(e) => {
            e.preventDefault();
            addAdmin.mutate({ name: newName.trim(), email: newEmail.trim().toLowerCase() });
          }}
          className="space-y-4"
        >
          <div>
            <label className="mb-1.5 block text-xs font-medium">Name</label>
            <input
              type="text"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="Full name"
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
          <p className="rounded-lg bg-[var(--color-surface-sunken)] p-3 text-xs text-[var(--color-fg-muted)]">
            A temporary password will be generated. Share it with the new admin securely — they must change it on first login.
          </p>
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="ghost" onClick={() => setShowAddModal(false)}>
              Cancel
            </Button>
            <Button
              type="submit"
              variant="primary"
              loading={addAdmin.isPending}
              disabled={!newName.trim() || !newEmail.trim()}
            >
              <Plus className="size-4" />
              Add Admin
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
