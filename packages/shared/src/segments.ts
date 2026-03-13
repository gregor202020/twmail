import { sql, type ExpressionBuilder, type Expression, type SqlBool } from 'kysely';
import { getDb } from './db.js';
import { ContactStatus, SegmentType } from './types.js';
import type { Database } from './schema.js';
import type { SegmentRule, SegmentRuleGroup } from './types.js';

// ============================================================================
// Segment rule engine — shared between api and workers packages
// ============================================================================

// Contact table columns that can be filtered on
const ALLOWED_COLUMNS = new Set([
  'email',
  'status',
  'first_name',
  'last_name',
  'phone',
  'company',
  'city',
  'country',
  'timezone',
  'source',
  'engagement_score',
  'engagement_tier',
  'last_open_at',
  'last_click_at',
  'last_activity_at',
  'subscribed_at',
  'unsubscribed_at',
  'created_at',
  'updated_at',
]);

export function buildRuleFilter(
  group: SegmentRuleGroup,
): (eb: ExpressionBuilder<Database, 'contacts'>) => Expression<SqlBool> {
  return (eb: ExpressionBuilder<Database, 'contacts'>) => {
    const conditions = group.rules.map((rule) => {
      if ('logic' in rule) {
        // Nested group — TypeScript narrows to SegmentRuleGroup via 'logic' in rule
        return buildRuleFilter(rule)(eb);
      }
      return buildSingleRule(eb, rule);
    });

    if (conditions.length === 0) {
      return eb.val(true);
    }

    if (group.logic === 'or') {
      return eb.or(conditions);
    }
    return eb.and(conditions);
  };
}

export function buildSingleRule(eb: ExpressionBuilder<Database, 'contacts'>, rule: SegmentRule): Expression<SqlBool> {
  const { field, operator, value } = rule;

  // Handle custom_fields with jsonb path
  if (field.startsWith('custom_fields.')) {
    const jsonPath = field.replace('custom_fields.', '');
    return buildJsonbRule(eb, jsonPath, operator, value);
  }

  // Validate column name
  if (!ALLOWED_COLUMNS.has(field)) {
    throw new Error(`Invalid segment rule field: ${field}`);
  }

  // Use sql template for all comparisons to avoid Kysely's heterogeneous column
  // type-inference limitation (col is keyof Database['contacts'] — a union of all
  // column names — so Kysely cannot narrow the expected value type at compile time).
  // sql<SqlBool>`` returns Expression<SqlBool>, the correct return type.
  const colRef = sql.ref(field);

  switch (operator) {
    case 'eq':
      return sql<SqlBool>`${colRef} = ${sql.val(value)}`;
    case 'neq':
      return sql<SqlBool>`${colRef} != ${sql.val(value)}`;
    case 'gt':
      return sql<SqlBool>`${colRef} > ${sql.val(value)}`;
    case 'gte':
      return sql<SqlBool>`${colRef} >= ${sql.val(value)}`;
    case 'lt':
      return sql<SqlBool>`${colRef} < ${sql.val(value)}`;
    case 'lte':
      return sql<SqlBool>`${colRef} <= ${sql.val(value)}`;
    case 'contains':
      return sql<SqlBool>`${colRef} ILIKE ${sql.val(`%${String(value)}%`)}`;
    case 'not_contains':
      return sql<SqlBool>`${colRef} NOT ILIKE ${sql.val(`%${String(value)}%`)}`;
    case 'starts_with':
      return sql<SqlBool>`${colRef} ILIKE ${sql.val(`${String(value)}%`)}`;
    case 'ends_with':
      return sql<SqlBool>`${colRef} ILIKE ${sql.val(`%${String(value)}`)}`;
    case 'is_set':
      return sql<SqlBool>`${colRef} IS NOT NULL`;
    case 'is_not_set':
      return sql<SqlBool>`${colRef} IS NULL`;
    case 'in': {
      const inValues = value as (string | number)[];
      return eb(field as keyof Database['contacts'], 'in', inValues as unknown as string[]);
    }
    case 'not_in': {
      const notInValues = value as (string | number)[];
      return eb.not(eb(field as keyof Database['contacts'], 'in', notInValues as unknown as string[]));
    }
    case 'before':
      return sql<SqlBool>`${colRef} < ${sql.val(new Date(value as string))}`;
    case 'after':
      return sql<SqlBool>`${colRef} > ${sql.val(new Date(value as string))}`;
    case 'between': {
      const [low, high] = value as [string | number, string | number];
      return sql<SqlBool>`${colRef} >= ${sql.val(low)} AND ${colRef} <= ${sql.val(high)}`;
    }
    case 'within_days': {
      // "within last N days" means column >= (now - N * 86400000ms)
      const days = Number(value);
      const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
      return sql<SqlBool>`${colRef} >= ${sql.val(cutoff)}`;
    }
    default:
      throw new Error(`Unsupported operator: ${String(operator)}`);
  }
}

function buildJsonbRule(
  _eb: ExpressionBuilder<Database, 'contacts'>,
  path: string,
  operator: string,
  value: unknown,
): Expression<SqlBool> {
  switch (operator) {
    case 'eq':
      return sql`custom_fields->>${sql.lit(path)} = ${sql.lit(String(value))}`;
    case 'neq':
      return sql`custom_fields->>${sql.lit(path)} != ${sql.lit(String(value))}`;
    case 'contains':
      return sql`custom_fields->>${sql.lit(path)} ILIKE ${'%' + String(value) + '%'}`;
    case 'is_set':
      return sql`custom_fields ? ${sql.lit(path)}`;
    case 'is_not_set':
      return sql`NOT (custom_fields ? ${sql.lit(path)})`;
    default:
      throw new Error(`Unsupported operator for custom field: ${operator}`);
  }
}

// ============================================================================
// resolveSegmentContactIds — single source of truth for both api and workers
//
// For STATIC segments: queries the contact_segments pivot table.
// For DYNAMIC segments: evaluates segment rules via buildRuleFilter.
// Both paths filter to ContactStatus.ACTIVE contacts only.
// ============================================================================

export async function resolveSegmentContactIds(segmentId: number): Promise<number[]> {
  const db = getDb();

  const segment = await db.selectFrom('segments').selectAll().where('id', '=', segmentId).executeTakeFirst();

  if (!segment) {
    throw new Error(`Segment not found: ${segmentId}`);
  }

  if (segment.type === SegmentType.STATIC) {
    const rows = await db
      .selectFrom('contact_segments')
      .innerJoin('contacts', 'contacts.id', 'contact_segments.contact_id')
      .select('contacts.id')
      .where('contact_segments.segment_id', '=', segmentId)
      .where('contacts.status', '=', ContactStatus.ACTIVE)
      .execute();
    return rows.map((r) => r.id);
  }

  // Dynamic segment: evaluate rules on demand
  if (!segment.rules) return [];
  const ruleGroup = segment.rules as unknown as SegmentRuleGroup;
  const rows = await db
    .selectFrom('contacts')
    .select('id')
    .where('status', '=', ContactStatus.ACTIVE)
    .where(buildRuleFilter(ruleGroup))
    .execute();
  return rows.map((r) => r.id);
}
