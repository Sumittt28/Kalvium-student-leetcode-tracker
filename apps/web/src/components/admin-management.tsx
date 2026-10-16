'use client';

import { useQuery } from '@tanstack/react-query';
import { Mail, Phone, Shield, User } from 'lucide-react';

import { api } from '@/lib/api';
import {
  Badge,
  Card,
  CardHeader,
  EmptyState,
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
  const admins = useQuery({
    queryKey: ['admins'],
    queryFn: api.listAdmins,
  });

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
        />

        {admins.isLoading ? (
          <TableSkeleton rows={3} cols={4} />
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
                </tr>
              );
              })}
            </tbody>
          </TableShell>
        )}
      </Card>
    </div>
  );
}
