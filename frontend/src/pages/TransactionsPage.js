import { useState, useCallback, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { transactionsApi, categoriesApi } from '@/lib/api';
import { formatCurrency, formatDate } from '@/lib/formatters';
import { useAuth } from '@/lib/auth-context';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Textarea } from '@/components/ui/textarea';
import { Plus, Search, Download, Edit2, Trash2, ChevronLeft, ChevronRight, ArrowUpDown, FileJson, FileSpreadsheet, X } from 'lucide-react';
import { toast } from 'sonner';
import Papa from 'papaparse';

export default function TransactionsPage() {
  const { hasPermission } = useAuth();
  const queryClient = useQueryClient();
  const canWrite = hasPermission('transactions:write');

  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [typeFilter, setTypeFilter] = useState('all');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [searchDebounced, setSearchDebounced] = useState('');
  const [sortBy, setSortBy] = useState('date');
  const [sortOrder, setSortOrder] = useState('desc');
  const [formOpen, setFormOpen] = useState(false);
  const [editingTxn, setEditingTxn] = useState(null);
  const [deleteConfirm, setDeleteConfirm] = useState(null);

  // Form state
  const [formAmount, setFormAmount] = useState('');
  const [formType, setFormType] = useState('expense');
  const [formCategoryId, setFormCategoryId] = useState('');
  const [formDescription, setFormDescription] = useState('');
  const [formDate, setFormDate] = useState(new Date().toISOString().split('T')[0]);
  const [formTags, setFormTags] = useState('');
  const [formNotes, setFormNotes] = useState('');

  // Debounce search
  useEffect(() => {
    const timer = setTimeout(() => setSearchDebounced(search), 300);
    return () => clearTimeout(timer);
  }, [search]);

  const params = {
    page, page_size: pageSize, sort_by: sortBy, sort_order: sortOrder,
    ...(typeFilter !== 'all' && { type: typeFilter }),
    ...(categoryFilter !== 'all' && { category_id: categoryFilter }),
    ...(searchDebounced && { search: searchDebounced }),
  };

  const { data: txnData, isLoading } = useQuery({
    queryKey: ['transactions', params],
    queryFn: () => transactionsApi.list(params).then(r => r.data.data),
  });

  const { data: categoriesData } = useQuery({
    queryKey: ['categories'],
    queryFn: () => categoriesApi.list().then(r => r.data.data),
  });

  const categories = categoriesData || [];
  const items = txnData?.items || [];
  const pagination = txnData?.pagination || { page: 1, total_pages: 1, total_items: 0 };

  const filteredCategories = categories.filter(c => formType === 'all' ? true : c.type === formType);

  const createMutation = useMutation({
    mutationFn: (data) => transactionsApi.create(data),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['transactions'] }); queryClient.invalidateQueries({ queryKey: ['dashboard'] }); toast.success('Transaction created'); setFormOpen(false); },
    onError: (err) => toast.error(err.response?.data?.detail || 'Failed to create'),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }) => transactionsApi.update(id, data),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['transactions'] }); queryClient.invalidateQueries({ queryKey: ['dashboard'] }); toast.success('Transaction updated'); setFormOpen(false); setEditingTxn(null); },
    onError: (err) => toast.error(err.response?.data?.detail || 'Failed to update'),
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => transactionsApi.delete(id),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['transactions'] }); queryClient.invalidateQueries({ queryKey: ['dashboard'] }); toast.success('Transaction deleted'); setDeleteConfirm(null); },
    onError: (err) => toast.error(err.response?.data?.detail || 'Failed to delete'),
  });

  const openCreateForm = () => {
    setEditingTxn(null);
    setFormAmount(''); setFormType('expense'); setFormCategoryId('');
    setFormDescription(''); setFormDate(new Date().toISOString().split('T')[0]);
    setFormTags(''); setFormNotes('');
    setFormOpen(true);
  };

  const openEditForm = (txn) => {
    setEditingTxn(txn);
    setFormAmount((txn.amount_cents / 100).toString());
    setFormType(txn.type);
    setFormCategoryId(txn.category?.id || '');
    setFormDescription(txn.description || '');
    setFormDate(txn.date);
    setFormTags((txn.tags || []).join(', '));
    setFormNotes(txn.notes || '');
    setFormOpen(true);
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    const data = {
      amount: parseFloat(formAmount),
      type: formType,
      category_id: formCategoryId,
      description: formDescription,
      date: formDate,
      tags: formTags ? formTags.split(',').map(t => t.trim()).filter(Boolean) : [],
      notes: formNotes,
    };
    if (editingTxn) {
      updateMutation.mutate({ id: editingTxn.id, data });
    } else {
      createMutation.mutate(data);
    }
  };

  const exportCSV = () => {
    const csvData = items.map(t => ({
      Date: t.date, Type: t.type, Category: t.category?.name || '',
      Description: t.description, Amount: (t.amount_cents / 100).toFixed(2),
      Tags: (t.tags || []).join('; '), Notes: t.notes || '',
    }));
    const csv = Papa.unparse(csvData);
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'transactions.csv'; a.click();
    URL.revokeObjectURL(url);
    toast.success('CSV exported');
  };

  const exportJSON = () => {
    const jsonData = items.map(t => ({
      date: t.date, type: t.type, category: t.category?.name || '',
      description: t.description, amount: (t.amount_cents / 100).toFixed(2),
      tags: t.tags || [], notes: t.notes || '',
    }));
    const blob = new Blob([JSON.stringify(jsonData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'transactions.json'; a.click();
    URL.revokeObjectURL(url);
    toast.success('JSON exported');
  };

  const toggleSort = (col) => {
    if (sortBy === col) setSortOrder(prev => prev === 'asc' ? 'desc' : 'asc');
    else { setSortBy(col); setSortOrder('desc'); }
  };

  return (
    <div className="space-y-6" data-testid="transactions-page">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="font-heading text-2xl sm:text-3xl font-bold tracking-tight" data-testid="transactions-heading">Transactions</h1>
          <p className="text-sm text-muted-foreground mt-1">{pagination.total_items} total records</p>
        </div>
        <div className="flex items-center gap-2">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" data-testid="export-menu-btn">
                <Download className="h-4 w-4 mr-1" /> Export
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              <DropdownMenuItem onClick={exportCSV} data-testid="export-csv-btn"><FileSpreadsheet className="h-4 w-4 mr-2" />CSV</DropdownMenuItem>
              <DropdownMenuItem onClick={exportJSON} data-testid="export-json-btn"><FileJson className="h-4 w-4 mr-2" />JSON</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          {canWrite && (
            <Button size="sm" onClick={openCreateForm} data-testid="add-transaction-btn">
              <Plus className="h-4 w-4 mr-1" /> Add Transaction
            </Button>
          )}
        </div>
      </div>

      {/* Filters */}
      <Card className="border border-border shadow-sm" data-testid="filters-card">
        <CardContent className="p-4">
          <div className="flex flex-wrap gap-3 items-end">
            <div className="flex-1 min-w-[200px]">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search description or notes..."
                  value={search}
                  onChange={e => { setSearch(e.target.value); setPage(1); }}
                  className="pl-9"
                  data-testid="search-input"
                />
              </div>
            </div>
            <Select value={typeFilter} onValueChange={v => { setTypeFilter(v); setPage(1); }}>
              <SelectTrigger className="w-32" data-testid="type-filter">
                <SelectValue placeholder="Type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Types</SelectItem>
                <SelectItem value="income">Income</SelectItem>
                <SelectItem value="expense">Expense</SelectItem>
              </SelectContent>
            </Select>
            <Select value={categoryFilter} onValueChange={v => { setCategoryFilter(v); setPage(1); }}>
              <SelectTrigger className="w-40" data-testid="category-filter">
                <SelectValue placeholder="Category" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Categories</SelectItem>
                {categories.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={String(pageSize)} onValueChange={v => { setPageSize(Number(v)); setPage(1); }}>
              <SelectTrigger className="w-24" data-testid="page-size-select">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="10">10</SelectItem>
                <SelectItem value="20">20</SelectItem>
                <SelectItem value="50">50</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Table */}
      <Card className="border border-border shadow-sm" data-testid="transactions-table-card">
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="cursor-pointer" onClick={() => toggleSort('date')} data-testid="sort-date">
                    <div className="flex items-center gap-1">Date <ArrowUpDown className="h-3 w-3" /></div>
                  </TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead>Tags</TableHead>
                  <TableHead className="cursor-pointer text-right" onClick={() => toggleSort('amount_cents')} data-testid="sort-amount">
                    <div className="flex items-center justify-end gap-1">Amount <ArrowUpDown className="h-3 w-3" /></div>
                  </TableHead>
                  <TableHead>Type</TableHead>
                  {canWrite && <TableHead className="text-right">Actions</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  Array.from({ length: 5 }).map((_, i) => (
                    <TableRow key={i}>
                      {Array.from({ length: canWrite ? 7 : 6 }).map((_, j) => (
                        <TableCell key={j}><div className="h-4 bg-muted rounded animate-pulse" /></TableCell>
                      ))}
                    </TableRow>
                  ))
                ) : items.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={canWrite ? 7 : 6} className="text-center py-12">
                      <p className="text-muted-foreground">No transactions found</p>
                    </TableCell>
                  </TableRow>
                ) : items.map(txn => (
                  <TableRow key={txn.id} data-testid={`txn-row-${txn.id}`}>
                    <TableCell className="font-mono text-xs whitespace-nowrap" style={{ fontVariantNumeric: 'tabular-nums' }}>{formatDate(txn.date)}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <div className="h-6 w-6 rounded flex items-center justify-center text-[10px] font-bold" style={{ backgroundColor: txn.category?.color_hex + '20', color: txn.category?.color_hex }}>
                          {txn.category?.name?.charAt(0)}
                        </div>
                        <span className="text-sm">{txn.category?.name}</span>
                      </div>
                    </TableCell>
                    <TableCell className="max-w-[200px] truncate text-sm">{txn.description}</TableCell>
                    <TableCell>
                      <div className="flex gap-1 flex-wrap">
                        {(txn.tags || []).map(tag => (
                          <Badge key={tag} variant="outline" className="text-[10px] px-1.5 py-0">{tag}</Badge>
                        ))}
                      </div>
                    </TableCell>
                    <TableCell className="text-right font-mono text-sm font-medium whitespace-nowrap" style={{ color: txn.type === 'income' ? 'var(--fin-income)' : 'var(--fin-expense)', fontVariantNumeric: 'tabular-nums' }}>
                      {txn.type === 'income' ? '+' : '-'}${(txn.amount_cents / 100).toFixed(2)}
                    </TableCell>
                    <TableCell>
                      <Badge variant={txn.type === 'income' ? 'default' : 'destructive'} className="text-[10px] uppercase tracking-wider">
                        {txn.type}
                      </Badge>
                    </TableCell>
                    {canWrite && (
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => openEditForm(txn)} data-testid={`edit-txn-${txn.id}`}>
                            <Edit2 className="h-3.5 w-3.5" />
                          </Button>
                          <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-destructive hover:text-destructive" onClick={() => setDeleteConfirm(txn)} data-testid={`delete-txn-${txn.id}`}>
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </TableCell>
                    )}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          {/* Pagination */}
          <div className="flex items-center justify-between p-4 border-t border-border" data-testid="pagination">
            <p className="text-xs text-muted-foreground">
              Page {pagination.page} of {pagination.total_pages} ({pagination.total_items} records)
            </p>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" disabled={!pagination.has_prev} onClick={() => setPage(p => p - 1)} data-testid="prev-page-btn">
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Button variant="outline" size="sm" disabled={!pagination.has_next} onClick={() => setPage(p => p + 1)} data-testid="next-page-btn">
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Create/Edit Dialog */}
      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent className="max-w-md" data-testid="transaction-form-dialog">
          <DialogHeader>
            <DialogTitle data-testid="transaction-form-title">{editingTxn ? 'Edit Transaction' : 'New Transaction'}</DialogTitle>
            <DialogDescription>
              {editingTxn ? 'Update transaction details' : 'Add a new financial transaction'}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label className="text-xs font-bold tracking-[0.1em] uppercase text-muted-foreground">Amount ($)</Label>
                <Input type="number" step="0.01" min="0.01" value={formAmount} onChange={e => setFormAmount(e.target.value)} placeholder="0.00" required data-testid="txn-amount-input" />
              </div>
              <div className="space-y-2">
                <Label className="text-xs font-bold tracking-[0.1em] uppercase text-muted-foreground">Type</Label>
                <Select value={formType} onValueChange={v => { setFormType(v); setFormCategoryId(''); }}>
                  <SelectTrigger data-testid="txn-type-select"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="income">Income</SelectItem>
                    <SelectItem value="expense">Expense</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2">
              <Label className="text-xs font-bold tracking-[0.1em] uppercase text-muted-foreground">Category</Label>
              <Select value={formCategoryId} onValueChange={setFormCategoryId}>
                <SelectTrigger data-testid="txn-category-select"><SelectValue placeholder="Select category" /></SelectTrigger>
                <SelectContent>
                  {filteredCategories.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label className="text-xs font-bold tracking-[0.1em] uppercase text-muted-foreground">Date</Label>
              <Input type="date" value={formDate} onChange={e => setFormDate(e.target.value)} required data-testid="txn-date-input" />
            </div>
            <div className="space-y-2">
              <Label className="text-xs font-bold tracking-[0.1em] uppercase text-muted-foreground">Description</Label>
              <Input value={formDescription} onChange={e => setFormDescription(e.target.value)} placeholder="Transaction description" data-testid="txn-description-input" />
            </div>
            <div className="space-y-2">
              <Label className="text-xs font-bold tracking-[0.1em] uppercase text-muted-foreground">Tags (comma separated)</Label>
              <Input value={formTags} onChange={e => setFormTags(e.target.value)} placeholder="recurring, business" data-testid="txn-tags-input" />
            </div>
            <div className="space-y-2">
              <Label className="text-xs font-bold tracking-[0.1em] uppercase text-muted-foreground">Notes</Label>
              <Textarea value={formNotes} onChange={e => setFormNotes(e.target.value)} placeholder="Additional notes..." rows={2} data-testid="txn-notes-input" />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setFormOpen(false)} data-testid="txn-cancel-btn">Cancel</Button>
              <Button type="submit" disabled={createMutation.isPending || updateMutation.isPending} data-testid="txn-submit-btn">
                {editingTxn ? 'Update' : 'Create'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <Dialog open={!!deleteConfirm} onOpenChange={() => setDeleteConfirm(null)}>
        <DialogContent className="max-w-sm" data-testid="delete-confirm-dialog">
          <DialogHeader>
            <DialogTitle>Delete Transaction</DialogTitle>
            <DialogDescription>This will soft-delete the transaction. It can be recovered by an admin.</DialogDescription>
          </DialogHeader>
          <p className="text-sm">Are you sure you want to delete <strong>{deleteConfirm?.description}</strong>?</p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteConfirm(null)} data-testid="delete-cancel-btn">Cancel</Button>
            <Button variant="destructive" onClick={() => deleteMutation.mutate(deleteConfirm.id)} disabled={deleteMutation.isPending} data-testid="delete-confirm-btn">Delete</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
