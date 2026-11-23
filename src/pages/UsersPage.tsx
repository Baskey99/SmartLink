import React from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { apiRequest } from '../lib/api';
import { useAuth, type UserProfile } from '../context/AuthContext';
import { formatShortDate } from '../lib/utils';
import { Button, ErrorState, Panel, Select, Skeleton } from '../components/ui/primitives';

export function UsersPage() {
  const { profile: currentUser } = useAuth();
  const queryClient = useQueryClient();

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['admin-users'],
    queryFn: () => apiRequest<{ users: UserProfile[] }>('/api/users'),
  });

  const updateMutation = useMutation({
    mutationFn: (payload: { id: string; role?: UserProfile['role']; status?: UserProfile['status'] }) =>
      apiRequest(`/api/users/${payload.id}`, {
        method: 'PUT',
        body: {
          ...(payload.role ? { role: payload.role } : {}),
          ...(payload.status ? { status: payload.status } : {}),
        },
      }),
    onSuccess: () => {
      toast.success('User account updated');
      void queryClient.invalidateQueries({ queryKey: ['admin-users'] });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold tracking-tight text-slate-950 dark:text-white">
          User Management
        </h1>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
          Assign workspace roles (Super Admin, Admin, User) and manage account access.
        </p>
      </div>

      {isError && (
        <ErrorState
          message={(error as Error)?.message || 'Failed to load workspace users.'}
          onRetry={() => void refetch()}
        />
      )}

      <Panel className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900/50 text-xs font-medium text-slate-500 dark:text-slate-400">
                <th className="py-3 px-4">User</th>
                <th className="py-3 px-4">Role</th>
                <th className="py-3 px-4">Status</th>
                <th className="py-3 px-4">Joined</th>
                <th className="py-3 px-4 text-right">Access Control</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80 text-sm">
              {isLoading
                ? Array.from({ length: 4 }).map((_, i) => (
                    <tr key={i}>
                      <td colSpan={5} className="py-3.5 px-4">
                        <Skeleton className="h-6 w-full" />
                      </td>
                    </tr>
                  ))
                : (data?.users || []).map((user) => {
                    const isSelf = user.id === currentUser?.id;
                    return (
                      <tr key={user.id} className="hover:bg-slate-50/60 dark:hover:bg-slate-800/30">
                        <td className="py-3.5 px-4">
                          <div className="font-medium text-slate-950 dark:text-white">
                            {user.fullName}{' '}
                            {isSelf && (
                              <span className="text-xs font-normal text-slate-500">(You)</span>
                            )}
                          </div>
                          <div className="text-xs text-slate-500 dark:text-slate-400">
                            {user.email}
                          </div>
                        </td>
                        <td className="py-3.5 px-4 w-48">
                          <Select
                            aria-label={`Role for ${user.email}`}
                            value={user.role}
                            disabled={isSelf || updateMutation.isPending}
                            onChange={(e) =>
                              updateMutation.mutate({
                                id: user.id,
                                role: e.target.value as UserProfile['role'],
                              })
                            }
                            className="h-9 text-xs"
                          >
                            <option value="super_admin">Super Admin</option>
                            <option value="admin">Admin</option>
                            <option value="user">User</option>
                          </Select>
                        </td>
                        <td className="py-3.5 px-4 text-xs font-medium">
                          <span
                            className={
                              user.status === 'active'
                                ? 'text-emerald-600 dark:text-emerald-400'
                                : 'text-red-600 dark:text-red-400'
                            }
                          >
                            {user.status === 'active' ? 'Active' : 'Deactivated'}
                          </span>
                        </td>
                        <td className="py-3.5 px-4 text-xs text-slate-500 dark:text-slate-400 tabular-nums">
                          {formatShortDate(user.createdAt)}
                        </td>
                        <td className="py-3.5 px-4 text-right">
                          <Button
                            variant="secondary"
                            size="sm"
                            disabled={isSelf || updateMutation.isPending}
                            onClick={() =>
                              updateMutation.mutate({
                                id: user.id,
                                status: user.status === 'active' ? 'inactive' : 'active',
                              })
                            }
                          >
                            {user.status === 'active' ? 'Deactivate' : 'Activate'}
                          </Button>
                        </td>
                      </tr>
                    );
                  })}
            </tbody>
          </table>
        </div>
      </Panel>
    </div>
  );
}
