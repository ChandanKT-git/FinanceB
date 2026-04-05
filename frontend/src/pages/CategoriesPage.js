import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { categoriesApi } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Plus, Edit2, Palette } from 'lucide-react';
import { toast } from 'sonner';
import { PageTransition, StaggerContainer, StaggerItem } from '@/components/MotionWrappers';

const COLOR_OPTIONS = [
  '#22c55e', '#10b981', '#14b8a6', '#ef4444', '#f97316', '#eab308',
  '#ec4899', '#8b5cf6', '#6366f1', '#3b82f6', '#d946ef', '#64748b',
  '#4A6B53', '#B85C38', '#D48D4C',
];

const ICON_OPTIONS = [
  'briefcase', 'laptop', 'trending-up', 'home', 'utensils', 'car',
  'heart-pulse', 'gamepad-2', 'zap', 'graduation-cap', 'shopping-bag',
  'circle-dot', 'gift', 'plane', 'music', 'camera',
];

export default function CategoriesPage() {
  const { hasPermission } = useAuth();
  const queryClient = useQueryClient();
  const canWrite = hasPermission('transactions:write');
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [formName, setFormName] = useState('');
  const [formType, setFormType] = useState('expense');
  const [formColor, setFormColor] = useState('#6366f1');
  const [formIcon, setFormIcon] = useState('circle-dot');

  const { data: categoriesData, isLoading } = useQuery({
    queryKey: ['categories'],
    queryFn: () => categoriesApi.list().then(r => r.data.data),
  });

  const categories = categoriesData || [];
  const incomeCategories = categories.filter(c => c.type === 'income');
  const expenseCategories = categories.filter(c => c.type === 'expense');

  const createMutation = useMutation({
    mutationFn: (data) => categoriesApi.create(data),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['categories'] }); toast.success('Category created'); setFormOpen(false); },
    onError: (err) => toast.error(err.response?.data?.detail || 'Failed'),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }) => categoriesApi.update(id, data),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['categories'] }); toast.success('Category updated'); setFormOpen(false); setEditing(null); },
    onError: (err) => toast.error(err.response?.data?.detail || 'Failed'),
  });

  const openCreate = () => {
    setEditing(null);
    setFormName(''); setFormType('expense'); setFormColor('#6366f1'); setFormIcon('circle-dot');
    setFormOpen(true);
  };

  const openEdit = (cat) => {
    setEditing(cat);
    setFormName(cat.name); setFormType(cat.type); setFormColor(cat.color_hex); setFormIcon(cat.icon || 'circle-dot');
    setFormOpen(true);
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    const data = { name: formName, type: formType, color_hex: formColor, icon: formIcon };
    if (editing) updateMutation.mutate({ id: editing.id, data });
    else createMutation.mutate(data);
  };

  const CategoryGroup = ({ title, items }) => (
    <Card className="border border-border shadow-sm" data-testid={`category-group-${title.toLowerCase()}`}>
      <CardHeader className="pb-2">
        <CardTitle className="text-[10px] font-bold tracking-[0.2em] uppercase text-muted-foreground">{title} Categories ({items.length})</CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Color</TableHead>
              <TableHead>Name</TableHead>
              <TableHead>Icon</TableHead>
              {canWrite && <TableHead className="text-right">Actions</TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map(cat => (
              <TableRow key={cat.id} data-testid={`category-row-${cat.id}`}>
                <TableCell>
                  <div className="h-6 w-6 rounded-md" style={{ backgroundColor: cat.color_hex }} />
                </TableCell>
                <TableCell className="font-medium text-sm">{cat.name}</TableCell>
                <TableCell className="text-xs text-muted-foreground">{cat.icon || '-'}</TableCell>
                {canWrite && (
                  <TableCell className="text-right">
                    <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => openEdit(cat)} data-testid={`edit-category-${cat.id}`}>
                      <Edit2 className="h-3.5 w-3.5" />
                    </Button>
                  </TableCell>
                )}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );

  return (
    <PageTransition>
      <div className="space-y-6" data-testid="categories-page">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="font-heading text-2xl sm:text-3xl font-bold tracking-tight" data-testid="categories-heading">Categories</h1>
            <p className="text-sm text-muted-foreground mt-1">Manage transaction categories</p>
          </div>
          {canWrite && (
            <Button size="sm" onClick={openCreate} data-testid="add-category-btn">
              <Plus className="h-4 w-4 mr-1" /> Add Category
            </Button>
          )}
        </div>

        <StaggerContainer className="grid grid-cols-1 xl:grid-cols-2 gap-6">
          <StaggerItem><CategoryGroup title="Income" items={incomeCategories} /></StaggerItem>
          <StaggerItem><CategoryGroup title="Expense" items={expenseCategories} /></StaggerItem>
        </StaggerContainer>

        <Dialog open={formOpen} onOpenChange={setFormOpen}>
          <DialogContent className="max-w-md" data-testid="category-form-dialog">
            <DialogHeader>
              <DialogTitle>{editing ? 'Edit Category' : 'New Category'}</DialogTitle>
              <DialogDescription>{editing ? 'Update category details' : 'Create a new transaction category'}</DialogDescription>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label className="text-xs font-bold tracking-[0.1em] uppercase text-muted-foreground">Name</Label>
                <Input value={formName} onChange={e => setFormName(e.target.value)} placeholder="Category name" required data-testid="category-name-input" />
              </div>
              <div className="space-y-2">
                <Label className="text-xs font-bold tracking-[0.1em] uppercase text-muted-foreground">Type</Label>
                <Select value={formType} onValueChange={setFormType}>
                  <SelectTrigger data-testid="category-type-select"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="income">Income</SelectItem>
                    <SelectItem value="expense">Expense</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label className="text-xs font-bold tracking-[0.1em] uppercase text-muted-foreground">Color</Label>
                <div className="flex flex-wrap gap-2">
                  {COLOR_OPTIONS.map(c => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setFormColor(c)}
                      className={`h-7 w-7 rounded-md border-2 transition-transform ${formColor === c ? 'border-foreground scale-110' : 'border-transparent'}`}
                      style={{ backgroundColor: c }}
                      data-testid={`color-option-${c}`}
                    />
                  ))}
                </div>
              </div>
              <div className="space-y-2">
                <Label className="text-xs font-bold tracking-[0.1em] uppercase text-muted-foreground">Icon Name</Label>
                <Select value={formIcon} onValueChange={setFormIcon}>
                  <SelectTrigger data-testid="category-icon-select"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {ICON_OPTIONS.map(ic => <SelectItem key={ic} value={ic}>{ic}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setFormOpen(false)}>Cancel</Button>
                <Button type="submit" disabled={createMutation.isPending || updateMutation.isPending} data-testid="category-submit-btn">
                  {editing ? 'Update' : 'Create'}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>
    </PageTransition>
  );
}
