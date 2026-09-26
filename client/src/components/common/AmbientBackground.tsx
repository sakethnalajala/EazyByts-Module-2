import { useMemo } from 'react';
import { cn } from '@/lib/utils';

/**
 * Ambient animated background.
 *
 * Built from stacked layers rather than one gradient, because depth is what
 * separates "premium fintech" from "a purple page":
 *
 *   1. base      - the deep-to-mid wash, violet drawn in from the corners
 *   2. corners   - the two bright glows across the top of the page
 *   3. aurora    - two large soft meshes drifting on long, unequal periods
 *   4. orbs      - blurred colour spheres that supply the accent light
 *   5. beam      - a slow conic sweep, the "moving light"
 *   6. grid      - optional faint terminal grid
 *   7. particles - optional slow-floating motes
 *   8. noise     - a fine dither that stops the gradients banding
 *   9. vignette  - seals the foot of the page, leaving the corners lit
 *
 * All of it is decorative, so the root is `aria-hidden` and
 * `pointer-events-none` and sits at -z-10 with no layout impact. Every
 * animation is disabled under `prefers-reduced-motion` (handled in CSS),
 * leaving the static composition, which still looks deliberate.
 *
 * Colour comes entirely from the `--bg-*` and `--role-*` tokens, so the
 * Trader, Admin and Super Admin areas get genuinely different atmospheres
 * from the same component with no branching here.
 */

export type AmbientVariant = 'auth' | 'landing' | 'app';

interface Props {
  variant?: AmbientVariant;
  /** Adds slow-floating particles. Off by default for dense screens. */
  particles?: boolean;
  /** Adds a faint grid, which reads as "financial terminal". */
  grid?: boolean;
  /** Adds the rotating conic light sweep. Reserved for hero surfaces. */
  beam?: boolean;
  /** Adds a restrained gold halo. Super Admin only. */
  gold?: boolean;
  className?: string;
}

export function AmbientBackground({
  variant = 'app',
  particles = false,
  grid = false,
  beam = false,
  gold = false,
  className,
}: Props) {
  /**
   * Particle positions are generated once per mount. Fully deterministic
   * offsets look like a pattern; re-randomising each render makes them twitch.
   * A fixed pseudo-random walk gives scatter that is stable across renders.
   */
  const dots = useMemo(
    () =>
      Array.from({ length: 18 }, (_, index) => {
        const seed = (index * 9301 + 49297) % 233280;
        const rand = seed / 233280;
        return {
          id: index,
          left: `${(index * 37 + rand * 14) % 96}%`,
          top: `${(index * 53 + rand * 22) % 92}%`,
          size: index % 4 === 0 ? 3 : 2,
          duration: 9 + (index % 6) * 2.5,
          delay: (index % 8) * 1.1,
          opacity: 0.25 + rand * 0.3,
        };
      }),
    [],
  );

  // Dashboards carry dense data, so their ambience is pulled well back.
  const intensity = variant === 'auth' ? 1 : variant === 'landing' ? 0.92 : 0.46;

  return (
    <div
      aria-hidden="true"
      className={cn('pointer-events-none fixed inset-0 -z-10 overflow-hidden', className)}
    >
      {/* 1. Base wash: deep black at the centre and foot of the page, with the
             violet carried in from the upper corners. Keeping the middle dark
             is what lets headline text sit on near-black while the page still
             reads as coloured. */}
      <div
        className="absolute inset-0"
        style={{
          background:
            'radial-gradient(62% 48% at 2% 0%, var(--bg-mid) 0%, transparent 52%), ' +
            'radial-gradient(62% 48% at 98% 2%, var(--bg-mid) 0%, transparent 52%), ' +
            'radial-gradient(90% 55% at 50% 108%, var(--bg-mid) 0%, transparent 55%), ' +
            'linear-gradient(180deg, var(--bg-deep) 0%, var(--bg-deep) 100%)',
        }}
      />

      {/* 2. Corner glows. The brightest points of the composition, opposed
             across the top so the eye is led inward to the hero. */}
      <div
        className="animate-aurora absolute -left-[18%] -top-[26%] size-[52rem] rounded-full blur-3xl"
        style={{
          background: 'radial-gradient(circle, var(--bg-halo) 0%, transparent 56%)',
          opacity: 0.6 * intensity,
        }}
      />
      <div
        className="animate-aurora absolute -right-[18%] -top-[22%] size-[48rem] rounded-full blur-3xl"
        style={{
          background: 'radial-gradient(circle, var(--bg-halo-2, var(--bg-halo)) 0%, transparent 56%)',
          opacity: 0.55 * intensity,
          animationDelay: '-13s',
          animationDuration: '40s',
        }}
      />

      {/* 3. Aurora meshes. Two layers, different periods and directions, so
             they never settle into a visible loop. */}
      <div
        className="animate-aurora absolute -inset-[20%]"
        style={{
          background:
            'radial-gradient(45% 38% at 22% 28%, var(--bg-halo) 0%, transparent 62%), ' +
            'radial-gradient(40% 34% at 78% 18%, var(--bg-halo-2, var(--bg-halo)) 0%, transparent 64%)',
          opacity: 0.3 * intensity,
          filter: 'blur(28px)',
        }}
      />
      <div
        className="animate-aurora absolute -inset-[20%]"
        style={{
          background:
            'radial-gradient(42% 36% at 68% 74%, var(--bg-halo) 0%, transparent 64%), ' +
            'radial-gradient(38% 32% at 18% 82%, var(--bg-halo-2, var(--bg-halo)) 0%, transparent 66%)',
          opacity: 0.24 * intensity,
          filter: 'blur(34px)',
          animationDelay: '-17s',
          animationDuration: '44s',
        }}
      />

      {/* 4. Accent orbs. These carry the role colour. */}
      <div
        className="animate-drift absolute -left-[12%] -top-[18%] size-[46rem] rounded-full blur-3xl"
        style={{
          background: 'radial-gradient(circle, var(--role-accent) 0%, transparent 68%)',
          opacity: 0.2 * intensity,
        }}
      />
      <div
        className="animate-drift absolute -right-[14%] top-[4%] size-[40rem] rounded-full blur-3xl"
        style={{
          background: 'radial-gradient(circle, var(--role-accent-2) 0%, transparent 68%)',
          opacity: 0.18 * intensity,
          animationDelay: '-9s',
          animationDuration: '34s',
        }}
      />
      <div
        className="animate-drift absolute bottom-[-22%] left-[24%] size-[44rem] rounded-full blur-3xl"
        style={{
          background: 'radial-gradient(circle, var(--role-accent) 0%, transparent 70%)',
          opacity: 0.14 * intensity,
          animationDelay: '-18s',
          animationDuration: '40s',
        }}
      />

      {/* Gold halo: one soft, off-centre source, kept far from full strength. */}
      {gold ? (
        <div
          className="animate-drift absolute right-[8%] top-[34%] size-[30rem] rounded-full blur-3xl"
          style={{
            background: 'radial-gradient(circle, var(--role-gold) 0%, transparent 70%)',
            opacity: 0.09 * intensity,
            animationDelay: '-24s',
            animationDuration: '52s',
          }}
        />
      ) : null}

      {/* 5. Conic beam: the slow-moving light. Masked to a soft disc so the
             cone edges never become visible lines. */}
      {beam ? (
        <div
          className="animate-spin-slow absolute left-1/2 top-[-30%] aspect-square w-[130%] -translate-x-1/2 rounded-full"
          style={{
            background:
              'conic-gradient(from 0deg, transparent 0deg, var(--role-glow) 40deg, transparent 110deg, ' +
              'transparent 250deg, var(--role-accent-2) 300deg, transparent 350deg)',
            opacity: 0.12 * intensity,
            filter: 'blur(60px)',
            maskImage: 'radial-gradient(closest-side, #000 30%, transparent 78%)',
            WebkitMaskImage: 'radial-gradient(closest-side, #000 30%, transparent 78%)',
          }}
        />
      ) : null}

      {/* 6. Terminal grid, faded out toward the edges so it never reads as a
             table sitting behind the content. */}
      {grid ? (
        <div
          className="absolute inset-0 opacity-[0.16] dark:opacity-[0.1]"
          style={{
            backgroundImage:
              'linear-gradient(to right, var(--color-border) 1px, transparent 1px), ' +
              'linear-gradient(to bottom, var(--color-border) 1px, transparent 1px)',
            backgroundSize: '64px 64px',
            maskImage: 'radial-gradient(90% 70% at 50% 25%, #000 0%, transparent 78%)',
            WebkitMaskImage: 'radial-gradient(90% 70% at 50% 25%, #000 0%, transparent 78%)',
          }}
        />
      ) : null}

      {/* 7. Floating motes. */}
      {particles
        ? dots.map((dot) => (
            <span
              key={dot.id}
              className="animate-float absolute rounded-full"
              style={{
                left: dot.left,
                top: dot.top,
                width: dot.size,
                height: dot.size,
                background: 'var(--role-accent-2)',
                opacity: dot.opacity,
                animationDuration: `${dot.duration}s`,
                animationDelay: `${dot.delay}s`,
                boxShadow: '0 0 10px var(--role-glow)',
              }}
            />
          ))
        : null}

      {/* 8. Fine dither. Large smooth gradients band badly on 8-bit displays;
             a faint noise layer breaks the bands up. Inline SVG so it costs
             no request. */}
      <div
        className="absolute inset-0 opacity-[0.035] mix-blend-overlay"
        style={{
          backgroundImage:
            "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='140' height='140'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='3'/%3E%3C/filter%3E%3Crect width='140' height='140' filter='url(%23n)'/%3E%3C/svg%3E\")",
        }}
      />

      {/*
        Vignette, weighted to the foot of the page.

        A centred vignette would darken the upper corners, which is exactly
        where the glow lives, so this one starts below the fold and seals the
        bottom edge instead. The corners stay lit.
      */}
      <div
        className="absolute inset-0"
        style={{
          background:
            'radial-gradient(75% 55% at 50% 42%, var(--bg-deep) 0%, transparent 70%), ' +
            'radial-gradient(130% 95% at 50% 10%, transparent 62%, var(--bg-deep) 100%)',
          opacity: 0.72,
        }}
      />
    </div>
  );
}
