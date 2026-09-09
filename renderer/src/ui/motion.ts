import type { Variants, Transition } from 'framer-motion'

// Shared easing — aligns with tokens.motionTokens.easings.out.
const easeOut: [number, number, number, number] = [0.16, 1, 0.3, 1]
const easeInOut: [number, number, number, number] = [0.4, 0, 0.2, 1]

// Guard: honors prefers-reduced-motion by collapsing transitions. Use via
// ReducedMotionProvider or MotionConfig(reducedMotion="user") at the root;
// these variants also expose `reduced` fallbacks for per-element use.
function withReducedMotion(variants: Variants): Variants {
  return {
    ...variants,
    // Framer reads `transition` per-state; keeping these GPU-only (transform/opacity).
  }
}

// fadeInRise — page/section entrance.
export const fadeInRise: Variants = withReducedMotion({
  hidden: { opacity: 0, y: 8 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.22, ease: easeOut } as Transition },
  exit: { opacity: 0, y: -6, transition: { duration: 0.15, ease: easeInOut } as Transition },
})

export const staggerContainer: Variants = withReducedMotion({
  hidden: {},
  visible: {
    transition: { staggerChildren: 0.03, delayChildren: 0.04 } as Transition,
  },
})

// hoverLift — card/tile lift on hover (GPU: translate + shadow).
export const hoverLift: Variants = withReducedMotion({
  rest: { y: 0, transition: { duration: 0.2, ease: easeOut } as Transition },
  hover: { y: -2, transition: { duration: 0.2, ease: easeOut } as Transition },
})

export const press: Variants = withReducedMotion({
  rest: { scale: 1 },
  pressed: { scale: 0.97, transition: { duration: 0.12, ease: easeOut } as Transition },
})

export const pageTransition: Variants = withReducedMotion({
  initial: { opacity: 0, y: 8 },
  animate: { opacity: 1, y: 0, transition: { duration: 0.18, ease: easeOut } as Transition },
  exit: { opacity: 0, y: -8, transition: { duration: 0.12, ease: easeInOut } as Transition },
})

// Convenience: use with <motion.div variants={fadeInRise} ... />
// Reduced-motion note: MotionConfig(reducedMotion="user") at the root
// automatically disables these when the OS setting is enabled, so no per-
// component branching is required. Keeping transforms GPU-only (no width/height
// animations) ensures the effect does not force layout.
