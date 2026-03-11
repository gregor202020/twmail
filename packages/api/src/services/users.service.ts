import { getDb } from '@twmail/shared';
import { hashPassword } from './auth.service.js';
import { AppError } from '../plugins/error-handler.js';
import { ErrorCode } from '@twmail/shared';
import type { PaginationParams } from '@twmail/shared';

interface CreateUserInput {
  email: string;
  name: string;
  password: string;
  role: number;
}

interface UpdateUserInput {
  name?: string;
  role?: number;
}

const USER_FIELDS = ['id', 'email', 'name', 'role', 'last_login_at', 'created_at', 'updated_at'] as const;

export async function listUsers(params: PaginationParams = {}) {
  const db = getDb();
  const page = params.page ?? 1;
  const perPage = params.per_page ?? 50;
  const offset = (page - 1) * perPage;

  const [users, countResult] = await Promise.all([
    db.selectFrom('users')
      .select([...USER_FIELDS])
      .orderBy('created_at', 'desc')
      .limit(perPage)
      .offset(offset)
      .execute(),
    db.selectFrom('users')
      .select(db.fn.countAll().as('total'))
      .executeTakeFirstOrThrow(),
  ]);

  const total = Number(countResult.total);

  return {
    data: users,
    meta: { page, per_page: perPage, total, total_pages: Math.ceil(total / perPage) },
  };
}

export async function getUser(id: number) {
  const db = getDb();
  const user = await db.selectFrom('users')
    .select([...USER_FIELDS])
    .where('id', '=', id)
    .executeTakeFirst();

  if (!user) {
    throw new AppError(404, ErrorCode.NOT_FOUND, 'User not found');
  }
  return user;
}

export async function createUser(input: CreateUserInput) {
  const db = getDb();

  const existing = await db.selectFrom('users')
    .select('id')
    .where('email', '=', input.email.toLowerCase())
    .executeTakeFirst();

  if (existing) {
    throw new AppError(409, ErrorCode.CONFLICT, 'A user with this email already exists');
  }

  const passwordHash = await hashPassword(input.password);

  const user = await db.insertInto('users')
    .values({
      email: input.email.toLowerCase(),
      name: input.name,
      password_hash: passwordHash,
      role: input.role,
    })
    .returning([...USER_FIELDS])
    .executeTakeFirstOrThrow();

  return user;
}

export async function updateUser(id: number, input: UpdateUserInput) {
  const db = getDb();

  const user = await db.updateTable('users')
    .set({ ...input, updated_at: new Date() })
    .where('id', '=', id)
    .returning([...USER_FIELDS])
    .executeTakeFirst();

  if (!user) {
    throw new AppError(404, ErrorCode.NOT_FOUND, 'User not found');
  }
  return user;
}

export async function resetUserPassword(id: number, newPassword: string) {
  const db = getDb();
  const passwordHash = await hashPassword(newPassword);

  const user = await db.updateTable('users')
    .set({ password_hash: passwordHash, updated_at: new Date() })
    .where('id', '=', id)
    .returning(['id'])
    .executeTakeFirst();

  if (!user) {
    throw new AppError(404, ErrorCode.NOT_FOUND, 'User not found');
  }
}

export async function deleteUser(id: number, requesterId: number) {
  if (id === requesterId) {
    throw new AppError(400, ErrorCode.VALIDATION_ERROR, 'You cannot delete your own account');
  }

  const db = getDb();
  const result = await db.deleteFrom('users')
    .where('id', '=', id)
    .executeTakeFirst();

  if (Number(result.numDeletedRows) === 0) {
    throw new AppError(404, ErrorCode.NOT_FOUND, 'User not found');
  }
}
