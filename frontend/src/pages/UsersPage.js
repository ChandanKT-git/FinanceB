import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { usersApi } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Switch } from '@/components/ui/switch';
import { UserPlus, Shield, ShieldCheck, Eye } from 'lucide-react';
import { toast } from 'sonner';
import { PageTransition } from '@/components/MotionWrappers';

const ROLE_CONFIG = {
  admin: { label: 'Admin', color: 'bg-primary/10 text-primary border-primary/20', icon: ShieldCheck },
  analyst: { label: 'Analyst', color: 'bg-amber-500/10 text-amber-600 border-amber-500/20', icon: Shield },
  viewer: { label: 'Viewer', color: 'bg-blue-500/10 text-blue-600 border-blue-500/20', icon: Eye },
};

export default function UsersPage() {
  const { hasPermission, user: currentUser } = useAuth();
  const queryClient = useQueryClient();
  const [formOpen, setFormOpen] = useState(false);
  const [formName, setFormName] = useState('');
  const [formEmail, setFormEmail] = useState('');
  const [formPassword, setFormPassword] = useState('');
  const [formRole, setFormRole] = useState('viewer');

  const { data: usersData, isLoading } = useQuery({
    queryKey: ['users'],
    queryFn: () => usersApi.list({ page_size: 100 }).then(r => r.data.data),
    enabled: hasPermission('users:read'),
  });

  const users = usersData?.items || [];

  const createMutation = useMutation({
    mutationFn: (data) => usersApi.create(data),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['users'] }); toast.success('User created'); setFormOpen(false); resetForm(); },
    onError: (err) => toast.error(err.response?.data?.detail || 'Failed to create user'),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }) => usersApi.update(id, data),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['users'] }); toast.success('User updated'); },
    onError: (err) => toast.error(err.response?.data?.detail || 'Failed to update user'),
  });

  const deactivateMutation = useMutation({
    mutationFn: (id) => usersApi.delete(id),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['users'] }); toast.success('User deactivated'); },
    onError: (err) => toast.error(err.response?.data?.detail || 'Failed to deactivate user'),
  });

  const resetForm = () => {
    setFormName(''); setFormEmail(''); setFormPassword(''); setFormRole('viewer');
  };

  const handleCreate = (e) => {
    e.preventDefault();
    createMutation.mutate({ full_name: formName, email: formEmail, password: formPassword, role: formRole });
  };

  const handleRoleChange = (userId, newRole) => {
    updateMutation.mutate({ id: userId, data: { role: newRole } });
  };

  const handleToggleActive = (userId, isActive) => {
    if (!isActive) {
      deactivateMutation.mutate(userId);
    } else {
      updateMutation.mutate({ id: userId, data: { is_active: true } });
    }
  };

  if (!hasPermission('users:read')) {
    return (
      <div className="flex items-center justify-center h-[60vh]" data-testid="users-access-denied">
        <Card className="border border-border shadow-sm max-w-md">
          <CardContent className="p-8 text-center">
            <Shield className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <h2 className="font-heading text-xl font-bold mb-2">Admin Only</h2>
            <p className="text-sm text-muted-foreground">User management is restricted to administrators.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <PageTransition>
    <div className="space-y-6" data-testid="users-page">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-heading text-2xl sm:text-3xl font-bold tracking-tight" data-testid="users-heading">Users</h1>
          <p className="text-sm text-muted-foreground mt-1">Manage team members and their roles</p>
        </div>
        <Button size="sm" onClick={() => setFormOpen(true)} data-testid="invite-user-btn">
          <UserPlus className="h-4 w-4 mr-1" /> Invite User
        </Button>
      </div>

      <Card className="border border-border shadow-sm" data-testid="users-table-card">
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Last Login</TableHead>
                  <TableHead className="text-right">Active</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  Array.from({ length: 3 }).map((_, i) => (
                    <TableRow key={i}>
                      {Array.from({ length: 6 }).map((_, j) => (
                        <TableCell key={j}><div className="h-4 bg-muted rounded animate-pulse" /></TableCell>
                      ))}
                    </TableRow>
                  ))
                ) : users.map(u => {
                  const rc = ROLE_CONFIG[u.role] || ROLE_CONFIG.viewer;
                  const isSelf = u.id === currentUser?.id;
                  return (
                    <TableRow key={u.id} data-testid={`user-row-${u.id}`}>
                      <TableCell>
                        <div className="flex items-center gap-3">
                          <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold text-xs">
                            {u.full_name?.charAt(0) || 'U'}
                          </div>
                          <span className="text-sm font-medium">{u.full_name}</span>
                        </div>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">{u.email}</TableCell>
                      <TableCell>
                        <Select value={u.role} onValueChange={v => handleRoleChange(u.id, v)} disabled={isSelf}>
                          <SelectTrigger className="w-28 h-7 text-xs" data-testid={`role-select-${u.id}`}>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="viewer">Viewer</SelectItem>
                            <SelectItem value="analyst">Analyst</SelectItem>
                            <SelectItem value="admin">Admin</SelectItem>
                          </SelectContent>
                        </Select>
                      </TableCell>
                      <TableCell>
                        <Badge variant={u.is_active ? 'default' : 'secondary'} className="text-[10px]" data-testid={`user-status-${u.id}`}>
                          {u.is_active ? 'Active' : 'Inactive'}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground font-mono" style={{ fontVariantNumeric: 'tabular-nums' }}>
                        {u.last_login ? new Date(u.last_login).toLocaleDateString() : 'Never'}
                      </TableCell>
                      <TableCell className="text-right">
                        <Switch
                          checked={u.is_active}
                          onCheckedChange={checked => handleToggleActive(u.id, checked)}
                          disabled={isSelf}
                          data-testid={`toggle-active-${u.id}`}
                        />
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Create User Dialog */}
      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent className="max-w-md" data-testid="create-user-dialog">
          <DialogHeader>
            <DialogTitle>Invite User</DialogTitle>
            <DialogDescription>Add a new team member with the appropriate role</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleCreate} className="space-y-4">
            <div className="space-y-2">
              <Label className="text-xs font-bold tracking-[0.1em] uppercase text-muted-foreground">Full Name</Label>
              <Input value={formName} onChange={e => setFormName(e.target.value)} placeholder="Jane Doe" required data-testid="user-name-input" />
            </div>
            <div className="space-y-2">
              <Label className="text-xs font-bold tracking-[0.1em] uppercase text-muted-foreground">Email</Label>
              <Input type="email" value={formEmail} onChange={e => setFormEmail(e.target.value)} placeholder="jane@company.com" required data-testid="user-email-input" />
            </div>
            <div className="space-y-2">
              <Label className="text-xs font-bold tracking-[0.1em] uppercase text-muted-foreground">Password</Label>
              <Input type="password" value={formPassword} onChange={e => setFormPassword(e.target.value)} placeholder="Minimum 6 characters" required data-testid="user-password-input" />
            </div>
            <div className="space-y-2">
              <Label className="text-xs font-bold tracking-[0.1em] uppercase text-muted-foreground">Role</Label>
              <Select value={formRole} onValueChange={setFormRole}>
                <SelectTrigger data-testid="user-role-select"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="viewer">Viewer</SelectItem>
                  <SelectItem value="analyst">Analyst</SelectItem>
                  <SelectItem value="admin">Admin</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setFormOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={createMutation.isPending} data-testid="create-user-submit-btn">
                {createMutation.isPending ? 'Creating...' : 'Create User'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
    </PageTransition>
  );
}
