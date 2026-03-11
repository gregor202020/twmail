'use client';
import { X } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import {
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
} from '@/components/ui/select';
import type { SegmentRule } from '@/types';

const FIELD_OPTIONS = [
  { value: 'email', label: 'Email' },
  { value: 'first_name', label: 'First Name' },
  { value: 'last_name', label: 'Last Name' },
  { value: 'phone', label: 'Phone' },
  { value: 'company', label: 'Company' },
  { value: 'created_at', label: 'Created At' },
  { value: 'status', label: 'Status' },
];

const OPERATOR_OPTIONS = [
  { value: 'eq', label: 'equals' },
  { value: 'neq', label: 'not equals' },
  { value: 'contains', label: 'contains' },
  { value: 'not_contains', label: 'not contains' },
  { value: 'starts_with', label: 'starts with' },
  { value: 'gt', label: 'greater than' },
  { value: 'lt', label: 'less than' },
  { value: 'before', label: 'before' },
  { value: 'after', label: 'after' },
  { value: 'is_set', label: 'is set' },
  { value: 'is_not_set', label: 'is not set' },
];

const STATUS_OPTIONS = [
  { value: '1', label: 'Active' },
  { value: '2', label: 'Unsubscribed' },
  { value: '3', label: 'Bounced' },
  { value: '4', label: 'Complained' },
];

const DATE_FIELDS = ['created_at'];
const NO_VALUE_OPERATORS = ['is_set', 'is_not_set'];

interface RuleRowProps {
  rule: SegmentRule;
  onChange: (rule: SegmentRule) => void;
  onRemove: () => void;
}

export function RuleRow({ rule, onChange, onRemove }: RuleRowProps) {
  const isDateField = DATE_FIELDS.includes(rule.field);
  const isStatusField = rule.field === 'status';
  const hideValue = NO_VALUE_OPERATORS.includes(rule.operator);

  const handleFieldChange = (val: string | null) => {
    if (!val) return;
    onChange({ ...rule, field: val, value: '' });
  };

  const handleOperatorChange = (val: string | null) => {
    if (!val) return;
    onChange({
      ...rule,
      operator: val as SegmentRule['operator'],
      value: NO_VALUE_OPERATORS.includes(val) ? undefined : rule.value,
    });
  };

  const handleValueChange = (val: string) => {
    onChange({ ...rule, value: val });
  };

  const handleSelectValueChange = (val: string | null) => {
    if (val) handleValueChange(val);
  };

  return (
    <div className="flex items-center gap-2">
      <Select value={rule.field} onValueChange={handleFieldChange}>
        <SelectTrigger className="w-[140px] text-xs">
          <SelectValue placeholder="Field" />
        </SelectTrigger>
        <SelectContent>
          {FIELD_OPTIONS.map((f) => (
            <SelectItem key={f.value} value={f.value}>
              {f.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select value={rule.operator} onValueChange={handleOperatorChange}>
        <SelectTrigger className="w-[140px] text-xs">
          <SelectValue placeholder="Operator" />
        </SelectTrigger>
        <SelectContent>
          {OPERATOR_OPTIONS.map((o) => (
            <SelectItem key={o.value} value={o.value}>
              {o.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {!hideValue && (
        <>
          {isStatusField ? (
            <Select
              value={String(rule.value ?? '')}
              onValueChange={handleSelectValueChange}
            >
              <SelectTrigger className="w-[140px] text-xs">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                {STATUS_OPTIONS.map((s) => (
                  <SelectItem key={s.value} value={s.value}>
                    {s.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : isDateField ? (
            <Input
              type="date"
              value={String(rule.value ?? '')}
              onChange={(e) => handleValueChange(e.target.value)}
              className="w-[160px] text-xs"
            />
          ) : (
            <Input
              type="text"
              value={String(rule.value ?? '')}
              onChange={(e) => handleValueChange(e.target.value)}
              placeholder="Value"
              className="w-[160px] text-xs"
            />
          )}
        </>
      )}

      <Button
        variant="ghost"
        size="icon-xs"
        onClick={onRemove}
        className="text-text-muted hover:text-status-danger shrink-0"
      >
        <X className="w-3.5 h-3.5" />
      </Button>
    </div>
  );
}
