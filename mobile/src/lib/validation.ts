// Zod schemas mirroring the web forms' validation rules + exact error messages.
// Sources: frontend/src/pages/auth/Register.jsx, pages/employer/EmployerRegister.jsx,
// components/auth/ForgotPasswordForm.jsx, components/auth/ResetPasswordForm.jsx.
import { z } from 'zod';
import { COMPANY_TYPE_VALUES, DESC_MAX } from './employerTypes';

// Same email regex the web uses: /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// ── Login (shared pilot + employer) ───────────────────────────────────────────
// Web login only checks non-empty ("Please enter your email and password.").
export const loginSchema = z.object({
  email: z.string().min(1, 'Please enter your email and password.'),
  password: z.string().min(1, 'Please enter your email and password.'),
});
export type LoginValues = z.infer<typeof loginSchema>;

// ── Pilot register ────────────────────────────────────────────────────────────
// Web validates: required first/email/password, email regex, password >= 8.
// (Web shows these as a top banner; mobile renders inline per the Phase-1 spec,
// reusing web's exact copy for email/password.)
export const pilotRegisterSchema = z.object({
  firstName: z.string().trim().min(1, 'First name is required.'),
  lastName: z.string().optional(),
  email: z
    .string()
    .trim()
    .min(1, 'Please fill in all required fields.')
    .regex(EMAIL_RE, 'Enter a valid email address.'),
  password: z.string().min(8, 'Password must be at least 8 characters.'),
  country: z.string().optional(),
  city: z.string().optional(),
  phone: z.string().optional(),
});
export type PilotRegisterValues = z.infer<typeof pilotRegisterSchema>;

// ── Employer register ─────────────────────────────────────────────────────────
// Mirrors EmployerRegister.jsx validate() exactly (messages included).
export const employerRegisterSchema = z
  .object({
    companyName: z.string().trim().min(1, 'Company name is required'),
    companyType: z
      .string()
      .min(1, 'Select a company type')
      .refine((v) => COMPANY_TYPE_VALUES.includes(v), 'Select a company type'),
    country: z.string().trim().min(1, 'Country is required'),
    headquartersCity: z.string().optional(),
    website: z
      .string()
      .optional()
      .refine(
        (v) => {
          if (!v || !v.trim()) return true;
          try {
            // eslint-disable-next-line no-new
            new URL(v.trim());
            return true;
          } catch {
            return false;
          }
        },
        'Enter a valid URL (including https://)',
      ),
    description: z.string().max(DESC_MAX, `Description must be ${DESC_MAX} characters or fewer`).optional(),
    contactName: z.string().trim().min(1, 'Contact name is required'),
    contactEmail: z
      .string()
      .trim()
      .min(1, 'Contact email is required')
      .regex(EMAIL_RE, 'Enter a valid email address'),
    contactPhone: z.string().optional(),
    password: z.string().min(1, 'Password is required').min(8, 'Password must be at least 8 characters'),
    confirmPassword: z.string(),
  })
  .refine((d) => d.confirmPassword === d.password, {
    path: ['confirmPassword'],
    message: "Passwords don't match",
  });
export type EmployerRegisterValues = z.infer<typeof employerRegisterSchema>;

// ── Forgot password ───────────────────────────────────────────────────────────
export const forgotSchema = z.object({
  email: z.string().trim().min(1, 'Please enter your email address.'),
});
export type ForgotValues = z.infer<typeof forgotSchema>;

// ── Reset password ────────────────────────────────────────────────────────────
// Web: password >= 8 ("Password must be at least 8 characters."), match
// ("Passwords do not match.").
export const resetSchema = z
  .object({
    password: z.string().min(8, 'Password must be at least 8 characters.'),
    confirm: z.string(),
  })
  .refine((d) => d.password === d.confirm, {
    path: ['confirm'],
    message: 'Passwords do not match.',
  });
export type ResetValues = z.infer<typeof resetSchema>;
