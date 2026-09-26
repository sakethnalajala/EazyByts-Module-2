import { z } from 'zod';
import { ROLES } from '../types/roles.js';

/**
 * Auth contracts. The server validates with these and the client's forms are
 * typed and validated by the very same objects, so a rule cannot drift.
 */

export const PASSWORD_MIN_LENGTH = 8;
export const PASSWORD_MAX_LENGTH = 128;

export const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(3)
  .max(254)
  .pipe(z.email('Enter a valid email address.'));

/**
 * Composition is enforced rather than just length: this app stores portfolios
 * and an internship reviewer will look for it. Max length is bounded because
 * argon2 hashing cost scales with input.
 */
export const passwordSchema = z
  .string()
  .min(PASSWORD_MIN_LENGTH, `Password must be at least ${PASSWORD_MIN_LENGTH} characters.`)
  .max(PASSWORD_MAX_LENGTH, `Password must be at most ${PASSWORD_MAX_LENGTH} characters.`)
  .refine((value) => /[a-z]/.test(value), 'Password must contain a lowercase letter.')
  .refine((value) => /[A-Z]/.test(value), 'Password must contain an uppercase letter.')
  .refine((value) => /[0-9]/.test(value), 'Password must contain a number.');

export const nameSchema = z
  .string()
  .trim()
  .min(1, 'Required.')
  .max(60)
  .regex(/^[\p{L}\p{M}'\- .]+$/u, 'Use letters, spaces, hyphens and apostrophes only.');

/**
 * Roles a visitor may create for themselves.
 *
 * Deliberately a closed list rather than the full ROLES enum: admin and
 * super_admin are provisioned by the platform, never self-served. Anything
 * outside this pair is rejected by validation before it reaches the service.
 */
export const SELF_SERVICE_ROLES = ['user', 'trader'] as const;
export type SelfServiceRole = (typeof SELF_SERVICE_ROLES)[number];

export const registerSchema = z.object({
  firstName: nameSchema,
  lastName: nameSchema,
  email: emailSchema,
  password: passwordSchema,
  /** Defaults to trader, preserving the behaviour of older clients. */
  role: z.enum(SELF_SERVICE_ROLES).default('trader'),
});
export type RegisterInput = z.infer<typeof registerSchema>;

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, 'Password is required.'),
});
export type LoginInput = z.infer<typeof loginSchema>;

export const demoLoginSchema = z.object({
  role: z.enum(ROLES),
});
export type DemoLoginInput = z.infer<typeof demoLoginSchema>;

export const forgotPasswordSchema = z.object({ email: emailSchema });
export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>;

export const resetPasswordSchema = z.object({
  token: z.string().min(16, 'Reset link is invalid.'),
  password: passwordSchema,
});
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;

export const verifyEmailSchema = z.object({
  token: z.string().min(16, 'Verification link is invalid.'),
});
export type VerifyEmailInput = z.infer<typeof verifyEmailSchema>;

export const resendVerificationSchema = z.object({ email: emailSchema });

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, 'Current password is required.'),
  newPassword: passwordSchema,
});
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;

export const updateProfileSchema = z.object({
  firstName: nameSchema.optional(),
  lastName: nameSchema.optional(),
});
export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;
