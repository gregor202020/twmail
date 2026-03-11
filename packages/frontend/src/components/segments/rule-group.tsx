'use client';
import { Plus, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { RuleRow } from './rule-row';
import type { SegmentRule, SegmentRuleGroup } from '@/types';

interface RuleGroupProps {
  group: SegmentRuleGroup;
  onChange: (group: SegmentRuleGroup) => void;
  onRemove: () => void;
}

function createEmptyRule(): SegmentRule {
  return { field: 'email', operator: 'eq', value: '' };
}

export function RuleGroup({ group, onChange, onRemove }: RuleGroupProps) {
  const rules = group.rules as SegmentRule[];
  const logic = group.logic;

  const toggleLogic = () => {
    onChange({ ...group, logic: logic === 'and' ? 'or' : 'and' });
  };

  const addRule = () => {
    onChange({ ...group, rules: [...rules, createEmptyRule()] });
  };

  const updateRule = (index: number, updated: SegmentRule) => {
    const next = [...rules];
    next[index] = updated;
    onChange({ ...group, rules: next });
  };

  const removeRule = (index: number) => {
    if (rules.length <= 1) {
      onRemove();
      return;
    }
    onChange({ ...group, rules: rules.filter((_, i) => i !== index) });
  };

  return (
    <div className="border border-card-border rounded-xl bg-card p-4 space-y-0">
      <div className="flex items-center justify-between mb-3">
        <span className="text-[10px] uppercase tracking-wider text-text-muted font-medium">
          Match {logic === 'and' ? 'all' : 'any'} of the following
        </span>
        <Button
          variant="ghost"
          size="icon-xs"
          onClick={onRemove}
          className="text-text-muted hover:text-status-danger"
        >
          <X className="w-3.5 h-3.5" />
        </Button>
      </div>

      <div className="space-y-2">
        {rules.map((rule, i) => (
          <div key={i}>
            {i > 0 && (
              <div className="flex items-center gap-2 py-1.5">
                <button
                  onClick={toggleLogic}
                  className="text-[10px] uppercase tracking-wider font-semibold text-tw-blue bg-tw-blue-light px-2 py-0.5 rounded-full hover:bg-tw-blue/20 transition-colors"
                >
                  {logic === 'and' ? 'AND' : 'OR'}
                </button>
                <div className="flex-1 h-px bg-card-border" />
              </div>
            )}
            <RuleRow
              rule={rule}
              onChange={(updated) => updateRule(i, updated)}
              onRemove={() => removeRule(i)}
            />
          </div>
        ))}
      </div>

      <Button
        variant="ghost"
        size="xs"
        onClick={addRule}
        className="mt-3 text-tw-blue hover:text-tw-blue-dark"
      >
        <Plus className="w-3 h-3" />
        Add Rule
      </Button>
    </div>
  );
}
