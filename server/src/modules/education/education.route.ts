import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import {
  EDUCATION_CATEGORY_LABELS,
  PERMISSIONS,
  listEducationQuerySchema,
  upsertEducationSchema,
  type EducationCategory,
  type EducationLevel,
  type EducationResource,
  type UpsertEducationInput,
} from '@smd/shared';
import { ApiError } from '../../utils/ApiError.js';
import { sendPaginated, sendSuccess } from '../../utils/response.js';
import { authenticate, optionalAuthenticate, requireAuth } from '../../middleware/authenticate.js';
import { requirePermission } from '../../middleware/authorize.js';
import {
  body,
  params,
  query,
  validateBody,
  validateParams,
  validateQuery,
} from '../../middleware/validate.js';
import { EducationResourceModel, type EducationResourceDocument } from './education.model.js';
import { recordAudit } from '../admin/audit.service.js';

export const educationRouter: Router = Router();

const slugParam = z.object({ slug: z.string().trim().toLowerCase().min(1).max(160) });
const idParam = z.object({ id: z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid resource id.') });

function toDto(doc: EducationResourceDocument, includeContent: boolean): EducationResource {
  return {
    id: doc._id.toString(),
    title: doc.title,
    slug: doc.slug,
    summary: doc.summary,
    category: doc.category,
    level: doc.level,
    ...(includeContent ? { content: doc.content } : {}),
    readMinutes: doc.readMinutes,
    status: doc.status,
    tags: doc.tags,
    authorName: doc.authorName,
    createdAt: doc.createdAt.toISOString(),
    updatedAt: doc.updatedAt.toISOString(),
  };
}

function slugify(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 120);
}

/** Roughly 200 words per minute, floored at one. */
function estimateReadMinutes(content: string): number {
  return Math.max(1, Math.round(content.trim().split(/\s+/).length / 200));
}

// ------------------------------------------------------------------- reading

/**
 * Public listing. Readers see published articles only; an editor with
 * `education:manage` also sees their drafts.
 */
educationRouter.get(
  '/',
  optionalAuthenticate,
  validateQuery(listEducationQuerySchema),
  async (req: Request, res: Response) => {
    const { page, limit, category, level, q } = query<{
      page: number;
      limit: number;
      category?: EducationCategory;
      level?: EducationLevel;
      q?: string;
    }>(req);

    const canSeeDrafts = req.auth?.permissions.includes(PERMISSIONS.EDUCATION_MANAGE) ?? false;

    const filter: Record<string, unknown> = {};
    if (!canSeeDrafts) filter.status = 'published';
    if (category) filter.category = category;
    if (level) filter.level = level;
    if (q) {
      const pattern = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
      filter.$or = [{ title: pattern }, { summary: pattern }, { tags: pattern }];
    }

    const [docs, total] = await Promise.all([
      EducationResourceModel.find(filter)
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit),
      EducationResourceModel.countDocuments(filter),
    ]);

    sendPaginated(
      res,
      docs.map((doc) => toDto(doc, false)),
      { page, limit, total },
    );
  },
);

educationRouter.get('/categories', (_req: Request, res: Response) => {
  sendSuccess(res, {
    categories: Object.entries(EDUCATION_CATEGORY_LABELS).map(([value, label]) => ({
      value,
      label,
    })),
    levels: ['beginner', 'intermediate', 'advanced'],
  });
});

educationRouter.get(
  '/:slug',
  optionalAuthenticate,
  validateParams(slugParam),
  async (req: Request, res: Response) => {
    const { slug } = params<{ slug: string }>(req);
    const canSeeDrafts = req.auth?.permissions.includes(PERMISSIONS.EDUCATION_MANAGE) ?? false;

    const doc = await EducationResourceModel.findOne({ slug });
    if (!doc || (doc.status !== 'published' && !canSeeDrafts)) {
      throw ApiError.notFound('Article not found.');
    }

    sendSuccess(res, toDto(doc, true));
  },
);

// ------------------------------------------------------------------- editing

educationRouter.post(
  '/',
  authenticate,
  requirePermission(PERMISSIONS.EDUCATION_MANAGE),
  validateBody(upsertEducationSchema),
  async (req: Request, res: Response) => {
    const auth = requireAuth(req);
    const input = body<UpsertEducationInput>(req);

    const slug = slugify(input.title);
    if (await EducationResourceModel.findOne({ slug })) {
      throw ApiError.conflict('CONFLICT', 'An article with a similar title already exists.');
    }

    const doc = await EducationResourceModel.create({
      ...input,
      slug,
      readMinutes: estimateReadMinutes(input.content),
      authorId: auth.user._id,
      authorName: `${auth.user.firstName} ${auth.user.lastName}`,
    });

    await recordAudit(req, {
      action: 'education.create',
      targetType: 'EducationResource',
      targetId: doc._id.toString(),
      summary: `Created article "${doc.title}" (${doc.status})`,
    });

    sendSuccess(res, toDto(doc, true), 201);
  },
);

educationRouter.patch(
  '/:id',
  authenticate,
  requirePermission(PERMISSIONS.EDUCATION_MANAGE),
  validateParams(idParam),
  validateBody(upsertEducationSchema.partial()),
  async (req: Request, res: Response) => {
    const { id } = params<{ id: string }>(req);
    const input = body<Partial<UpsertEducationInput>>(req);

    const doc = await EducationResourceModel.findById(id);
    if (!doc) throw ApiError.notFound('Article not found.');

    const before = { title: doc.title, status: doc.status };

    if (input.title !== undefined) doc.title = input.title;
    if (input.summary !== undefined) doc.summary = input.summary;
    if (input.category !== undefined) doc.category = input.category;
    if (input.level !== undefined) doc.level = input.level;
    if (input.tags !== undefined) doc.tags = input.tags;
    if (input.status !== undefined) doc.status = input.status;
    if (input.content !== undefined) {
      doc.content = input.content;
      doc.readMinutes = estimateReadMinutes(input.content);
    }

    await doc.save();

    await recordAudit(req, {
      action: 'education.update',
      targetType: 'EducationResource',
      targetId: doc._id.toString(),
      summary: `Updated article "${doc.title}"`,
      before,
      after: { title: doc.title, status: doc.status },
    });

    sendSuccess(res, toDto(doc, true));
  },
);

educationRouter.delete(
  '/:id',
  authenticate,
  requirePermission(PERMISSIONS.EDUCATION_MANAGE),
  validateParams(idParam),
  async (req: Request, res: Response) => {
    const { id } = params<{ id: string }>(req);

    const doc = await EducationResourceModel.findById(id);
    if (!doc) throw ApiError.notFound('Article not found.');

    await doc.deleteOne();

    await recordAudit(req, {
      action: 'education.delete',
      targetType: 'EducationResource',
      targetId: id,
      summary: `Deleted article "${doc.title}"`,
    });

    sendSuccess(res, { deleted: true });
  },
);
