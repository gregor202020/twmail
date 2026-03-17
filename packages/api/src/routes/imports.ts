import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { getDb, getRedis, ErrorCode, ImportType, ImportStatus } from '@twmail/shared';
import { Queue, type ConnectionOptions } from 'bullmq';
import { requireAuth } from '../middleware/auth.js';
import { AppError } from '../plugins/error-handler.js';

const pasteSchema = z.object({
  text: z.string().min(1),
  list_id: z.number().optional(),
  update_existing: z.boolean().optional(),
});

const csvSchema = z.object({
  csv_content: z.string().min(1),
  mapping: z.record(z.string()).optional(),
  list_id: z.number().optional(),
  update_existing: z.boolean().optional(),
});

const mappingPresetSchema = z.object({
  name: z.string().min(1).max(100),
  mapping: z.record(z.string()),
});

// Auto-detection mappings for common column names
const AUTO_FIELD_MAP: Record<string, string> = {
  email: 'email',
  'e-mail': 'email',
  email_address: 'email',
  emailaddress: 'email',
  first_name: 'first_name',
  firstname: 'first_name',
  first: 'first_name',
  given_name: 'first_name',
  last_name: 'last_name',
  lastname: 'last_name',
  last: 'last_name',
  surname: 'last_name',
  family_name: 'last_name',
  phone: 'phone',
  telephone: 'phone',
  mobile: 'phone',
  company: 'company',
  organization: 'company',
  org: 'company',
  city: 'city',
  town: 'city',
  country: 'country',
};

function autoDetectMapping(headers: string[]): Record<string, string> {
  const mapping: Record<string, string> = {};
  for (const header of headers) {
    const normalized = header.toLowerCase().replace(/[^a-z_]/g, '');
    mapping[header] = AUTO_FIELD_MAP[normalized] ?? `custom.${header}`;
  }
  return mapping;
}

function parsePastedText(text: string): Array<Record<string, string>> {
  const lines = text
    .trim()
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);
  if (lines.length === 0) return [];

  const firstLine = lines[0]!;
  let delimiter: string;

  if (firstLine.includes('\t')) {
    delimiter = '\t';
  } else if (firstLine.includes(',')) {
    delimiter = ',';
  } else {
    // One email per line
    return lines.map((line) => ({ email: line.trim() }));
  }

  const headers = firstLine.split(delimiter).map((h) => h.trim().toLowerCase());
  return lines.slice(1).map((line) => {
    const values = line.split(delimiter);
    const row: Record<string, string> = {};
    headers.forEach((h, i) => {
      row[h] = (values[i] ?? '').trim();
    });
    return row;
  });
}

function parseCsvLine(line: string, delimiter: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i]!;
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === delimiter && !inQuotes) {
      result.push(current);
      current = '';
    } else {
      current += ch;
    }
  }
  result.push(current);

  return result;
}

function parseCsv(content: string): Array<Record<string, string>> {
  const lines = content
    .trim()
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);
  if (lines.length < 2) return [];

  const firstLine = lines[0]!;
  let delimiter = ',';
  if (firstLine.includes('\t')) delimiter = '\t';
  else if (firstLine.includes(';')) delimiter = ';';
  else if (firstLine.includes('|')) delimiter = '|';

  const headers = parseCsvLine(firstLine, delimiter).map((h) => h.trim().toLowerCase());

  return lines.slice(1).map((line) => {
    const values = parseCsvLine(line, delimiter);
    const row: Record<string, string> = {};
    headers.forEach((h, i) => {
      row[h] = (values[i] ?? '').trim();
    });
    return row;
  });
}

export const importRoutes: FastifyPluginAsync = async (app) => {
  app.addHook('preHandler', requireAuth);

  // POST /api/contacts/import/paste
  app.post('/paste', async (request, reply) => {
    const body = pasteSchema.parse(request.body);
    const db = getDb();
    const redis = getRedis();

    const rows = parsePastedText(body.text);
    if (rows.length === 0) {
      throw new AppError(400, ErrorCode.VALIDATION_ERROR, 'No valid data found in pasted text');
    }

    const headers = Object.keys(rows[0]!);
    const mapping = autoDetectMapping(headers);

    // Create import record
    const imp = await db
      .insertInto('imports')
      .values({
        type: ImportType.PASTE,
        status: ImportStatus.PROCESSING,
        total_rows: rows.length,
        mapping_config: mapping,
      })
      .returningAll()
      .executeTakeFirstOrThrow();

    // Enqueue for worker via BullMQ
    const importQueue = new Queue('import', { connection: redis as unknown as ConnectionOptions });
    await importQueue.add('process', {
      importId: imp.id,
      rows,
      mapping,
      updateExisting: body.update_existing ?? true,
      listId: body.list_id,
    });
    await importQueue.close();

    return reply.status(202).send({ data: imp });
  });

  // POST /api/contacts/import/csv
  app.post('/csv', async (request, reply) => {
    const body = csvSchema.parse(request.body);
    const db = getDb();
    const redis = getRedis();

    const rows = parseCsv(body.csv_content);
    if (rows.length === 0) {
      throw new AppError(400, ErrorCode.VALIDATION_ERROR, 'No valid data found in CSV');
    }

    const headers = Object.keys(rows[0]!);
    const mapping = body.mapping ?? autoDetectMapping(headers);

    // Create import record
    const imp = await db
      .insertInto('imports')
      .values({
        type: ImportType.CSV,
        status: ImportStatus.PROCESSING,
        total_rows: rows.length,
        mapping_config: mapping,
      })
      .returningAll()
      .executeTakeFirstOrThrow();

    // Enqueue for worker via BullMQ
    const importQueue = new Queue('import', { connection: redis as unknown as ConnectionOptions });
    await importQueue.add('process', {
      importId: imp.id,
      rows,
      mapping,
      updateExisting: body.update_existing ?? true,
      listId: body.list_id,
    });
    await importQueue.close();

    return reply.status(202).send({ data: imp });
  });

  // GET /api/contacts/import/:id
  app.get<{ Params: { id: string } }>('/:id', async (request, reply) => {
    const db = getDb();

    const imp = await db
      .selectFrom('imports')
      .selectAll()
      .where('id', '=', Number(request.params.id))
      .executeTakeFirst();

    if (!imp) {
      throw new AppError(404, ErrorCode.NOT_FOUND, 'Import not found');
    }

    return reply.send({ data: imp });
  });

  // GET /api/contacts/import/:id/errors
  app.get<{ Params: { id: string } }>('/:id/errors', async (request, reply) => {
    const db = getDb();

    const imp = await db
      .selectFrom('imports')
      .selectAll()
      .where('id', '=', Number(request.params.id))
      .executeTakeFirst();

    if (!imp) {
      throw new AppError(404, ErrorCode.NOT_FOUND, 'Import not found');
    }

    return reply.send({ data: imp.errors });
  });

  // POST /api/contacts/import/mappings
  app.post('/mappings', async (request, reply) => {
    const body = mappingPresetSchema.parse(request.body);
    const redis = getRedis();
    await redis.hset('twmail:mapping-presets', body.name, JSON.stringify(body.mapping));

    return reply.status(201).send({ data: { message: 'Mapping preset saved' } });
  });

  // GET /api/contacts/import/mappings
  app.get('/mappings', async (_request, reply) => {
    const redis = getRedis();
    const presets = await redis.hgetall('twmail:mapping-presets');
    const result: Record<string, Record<string, string>> = {};
    for (const [name, json] of Object.entries(presets)) {
      result[name] = JSON.parse(json) as Record<string, string>;
    }

    return reply.send({ data: result });
  });
};
