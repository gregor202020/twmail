'use client';
import { useQuery } from '@tanstack/react-query';
import { Plus, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { RuleGroup } from './rule-group';
import { useDebounce } from '@/hooks/use-debounce';
import { api } from '@/lib/api-client';
import { queryKeys } from '@/lib/query-keys';
import { formatNumber } from '@/lib/utils';
import type { SegmentRule, SegmentRuleGroup } from '@/types';

function createEmptyGroup(): SegmentRuleGroup {
  return {
    logic: 'and',
    rules: [{ field: 'email', operator: 'eq', value: '' } as SegmentRule],
  };
}

interface RuleBuilderProps {
  groups: SegmentRuleGroup[];
  onChange: (groups: SegmentRuleGroup[]) => void;
  segmentId?: number;
}

export function RuleBuilder({ groups, onChange, segmentId }: RuleBuilderProps) {
  const debouncedGroups = useDebounce(groups, 500);

  const hasRules = debouncedGroups.length > 0 && debouncedGroups.some(
    (g) => (g.rules as SegmentRule[]).some((r) => r.field && r.operator)
  );

  const { data: countData } = useQuery({
    queryKey: segmentId
      ? queryKeys.segments.count(segmentId)
      : ['segments', 'estimate', JSON.stringify(debouncedGroups)],
    queryFn: () =>
      api.post<{ count: number }>('/segments/estimate', { rules: debouncedGroups }),
    enabled: hasRules,
  });

  const addGroup = () => {
    onChange([...groups, createEmptyGroup()]);
  };

  const updateGroup = (index: number, updated: SegmentRuleGroup) => {
    const next = [...groups];
    next[index] = updated;
    onChange(next);
  };

  const removeGroup = (index: number) => {
    onChange(groups.filter((_, i) => i !== index));
  };

  return (
    <div className="space-y-4">
      {hasRules && countData && (
        <div className="flex items-center gap-2 p-3 bg-tw-blue-light border border-tw-blue/20 rounded-lg">
          <Users className="w-4 h-4 text-tw-blue" />
          <span className="text-xs font-medium text-tw-blue">
            {formatNumber(countData.count)} matching contact{countData.count !== 1 ? 's' : ''}
          </span>
        </div>
      )}

      {groups.map((group, i) => (
        <div key={i}>
          {i > 0 && (
            <div className="flex items-center gap-3 py-2">
              <div className="flex-1 h-px bg-card-border" />
              <span className="text-[10px] uppercase tracking-wider font-semibold text-status-warning bg-amber-50 px-2.5 py-0.5 rounded-full">
                OR
              </span>
              <div className="flex-1 h-px bg-card-border" />
            </div>
          )}
          <RuleGroup
            group={group}
            onChange={(updated) => updateGroup(i, updated)}
            onRemove={() => removeGroup(i)}
          />
        </div>
      ))}

      <Button
        variant="outline"
        size="sm"
        onClick={addGroup}
        className="text-xs"
      >
        <Plus className="w-3 h-3" />
        Add Group
      </Button>
    </div>
  );
}
