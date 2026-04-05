import { useState } from 'react';
import { format } from 'date-fns';
import { Calendar as CalendarIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';

export function DateRangePicker({ from, to, onSelect, className }) {
  const [open, setOpen] = useState(false);

  const handleSelect = (range) => {
    if (range?.from && range?.to) {
      onSelect({ from: range.from, to: range.to });
    } else if (range?.from) {
      onSelect({ from: range.from, to: to || range.from });
    }
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          className={cn('justify-start text-left font-normal h-9 text-xs', !from && 'text-muted-foreground', className)}
          data-testid="date-range-picker-trigger"
        >
          <CalendarIcon className="mr-2 h-3.5 w-3.5" />
          {from ? (
            to ? (
              <span>{format(from, 'MMM d')} - {format(to, 'MMM d, yyyy')}</span>
            ) : (
              format(from, 'MMM d, yyyy')
            )
          ) : (
            'Pick date range'
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="end">
        <Calendar
          mode="range"
          selected={{ from, to }}
          onSelect={handleSelect}
          numberOfMonths={2}
          defaultMonth={from || new Date()}
          data-testid="date-range-calendar"
        />
        <div className="flex items-center justify-between p-3 border-t border-border">
          <Button
            variant="ghost"
            size="sm"
            className="text-xs"
            onClick={() => {
              const now = new Date();
              const start = new Date(now.getFullYear(), now.getMonth(), 1);
              onSelect({ from: start, to: now });
            }}
            data-testid="date-range-this-month"
          >
            This Month
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="text-xs"
            onClick={() => {
              const now = new Date();
              const start = new Date(now.getFullYear(), now.getMonth() - 3, 1);
              onSelect({ from: start, to: now });
            }}
            data-testid="date-range-last-3m"
          >
            Last 3 Months
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="text-xs"
            onClick={() => {
              const now = new Date();
              const start = new Date(now.getFullYear(), 0, 1);
              onSelect({ from: start, to: now });
            }}
            data-testid="date-range-ytd"
          >
            Year to Date
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
