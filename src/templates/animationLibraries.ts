/**
 * Animation Libraries — Reusable animation snippets and CDN integration
 *
 * This module provides:
 * - CDN references for popular animation libraries (GSAP, ScrollReveal, AOS)
 * - Pre-built CSS keyframe animations
 * - JavaScript animation utilities
 * - Guidelines for GPU-accelerated animations
 *
 * Usage:
 *   import { getAnimationCSS, getScrollRevealScript, getAOSLibraries } from './animationLibraries.ts';
 */

// ── CDN URLs ────────────────────────────────────────────────────────

export const ANIMATION_CDNS = {
  gsap: "https://cdnjs.cloudflare.com/ajax/libs/gsap/3.12.2/gsap.min.js",
  gsapScroll: "https://cdnjs.cloudflare.com/ajax/libs/gsap/3.12.2/ScrollTrigger.min.js",
  scrollReveal: "https://unpkg.com/scrollreveal@4.0.9/dist/scrollreveal.min.js",
  aos: "https://unpkg.com/aos@next/dist/aos.js",
  aosCSS: "https://unpkg.com/aos@next/dist/aos.css",
  framerMotion: "https://unpkg.com/framer-motion@10.0.0/dist/framer-motion.min.js", // For React
} as const;

// ── CSS Animations ──────────────────────────────────────────────────

/**
 * Generate comprehensive CSS keyframe animations.
 * Optimized for GPU acceleration (transform + opacity only).
 */
export function getAnimationCSS(): string {
  return `
/* ─────────────────────────────────────────────────────────────────  */
/* Enhanced Animation Library — GPU-Optimized Keyframes               */
/* ─────────────────────────────────────────────────────────────────  */

/* ── Fade Animations ──────────────────────────────────────────────── */

@keyframes fadeIn {
  from { opacity: 0; }
  to { opacity: 1; }
}

@keyframes fadeOut {
  from { opacity: 1; }
  to { opacity: 0; }
}

.animate-fade-in {
  animation: fadeIn 600ms ease-out both;
}

.animate-fade-out {
  animation: fadeOut 600ms ease-out both;
}

/* ── Slide Animations ────────────────────────────────────────────── */

@keyframes slideUp {
  from {
    opacity: 0;
    transform: translateY(2rem);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

@keyframes slideDown {
  from {
    opacity: 0;
    transform: translateY(-2rem);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

@keyframes slideLeft {
  from {
    opacity: 0;
    transform: translateX(2rem);
  }
  to {
    opacity: 1;
    transform: translateX(0);
  }
}

@keyframes slideRight {
  from {
    opacity: 0;
    transform: translateX(-2rem);
  }
  to {
    opacity: 1;
    transform: translateX(0);
  }
}

.animate-slide-up {
  animation: slideUp 700ms cubic-bezier(0.34, 1.56, 0.64, 1) both;
}

.animate-slide-down {
  animation: slideDown 700ms cubic-bezier(0.34, 1.56, 0.64, 1) both;
}

.animate-slide-left {
  animation: slideLeft 700ms cubic-bezier(0.34, 1.56, 0.64, 1) both;
}

.animate-slide-right {
  animation: slideRight 700ms cubic-bezier(0.34, 1.56, 0.64, 1) both;
}

/* ── Scale Animations ────────────────────────────────────────────── */

@keyframes scaleUp {
  from {
    opacity: 0;
    transform: scale(0.95);
  }
  to {
    opacity: 1;
    transform: scale(1);
  }
}

@keyframes scaleDown {
  from {
    opacity: 1;
    transform: scale(1);
  }
  to {
    opacity: 0;
    transform: scale(0.95);
  }
}

.animate-scale-up {
  animation: scaleUp 500ms cubic-bezier(0.34, 1.56, 0.64, 1) both;
}

.animate-scale-down {
  animation: scaleDown 500ms cubic-bezier(0.34, 1.56, 0.64, 1) both;
}

/* ── Bounce Animations ───────────────────────────────────────────── */

@keyframes bounce {
  0%, 100% { transform: translateY(0); }
  50% { transform: translateY(-0.5rem); }
}

@keyframes bounceIn {
  0% {
    opacity: 0;
    transform: scale(0.3);
  }
  50% {
    opacity: 1;
  }
  100% {
    transform: scale(1);
  }
}

.animate-bounce {
  animation: bounce 1s ease-in-out infinite;
}

.animate-bounce-in {
  animation: bounceIn 600ms cubic-bezier(0.34, 1.56, 0.64, 1) both;
}

/* ── Pulse Animations ────────────────────────────────────────────── */

@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.6; }
}

.animate-pulse {
  animation: pulse 2s ease-in-out infinite;
}

/* ── Glow Animations ─────────────────────────────────────────────── */

@keyframes glow {
  0%, 100% { box-shadow: 0 0 0 0 var(--color-primary); }
  50% { box-shadow: 0 0 0 10px var(--color-primary); }
}

.animate-glow {
  animation: glow 2s ease-in-out infinite;
}

/* ── Gradient Shift (for gradients) ──────────────────────────────── */

@keyframes gradientShift {
  0% { background-position: 0% 50%; }
  50% { background-position: 100% 50%; }
  100% { background-position: 0% 50%; }
}

.animate-gradient {
  background-size: 200% 200%;
  animation: gradientShift 8s ease infinite;
}

/* ── Hover Effects ──────────────────────────────────────────────── */

.hover-lift {
  transition: transform var(--transition), box-shadow var(--transition);
}

.hover-lift:hover {
  transform: translateY(-4px);
  box-shadow: var(--shadow-lg);
}

.hover-grow {
  transition: transform var(--transition);
}

.hover-grow:hover {
  transform: scale(1.05);
}

.hover-glow {
  transition: box-shadow var(--transition), text-shadow var(--transition);
}

.hover-glow:hover {
  box-shadow: 0 0 20px rgba(var(--color-primary), 0.3);
  text-shadow: 0 0 10px rgba(var(--color-primary), 0.3);
}

/* ── Stagger Animation (for lists) ──────────────────────────────── */

.stagger-items > * {
  opacity: 0;
  animation: slideUp 700ms cubic-bezier(0.34, 1.56, 0.64, 1) forwards;
}

.stagger-items > *:nth-child(1) { animation-delay: 0ms; }
.stagger-items > *:nth-child(2) { animation-delay: 100ms; }
.stagger-items > *:nth-child(3) { animation-delay: 200ms; }
.stagger-items > *:nth-child(4) { animation-delay: 300ms; }
.stagger-items > *:nth-child(5) { animation-delay: 400ms; }
.stagger-items > *:nth-child(6) { animation-delay: 500ms; }
.stagger-items > *:nth-child(7) { animation-delay: 600ms; }
.stagger-items > *:nth-child(8) { animation-delay: 700ms; }

/* ── Reduced Motion Respect ─────────────────────────────────────── */

@media (prefers-reduced-motion: reduce) {
  *,
  *::before,
  *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
  }
}
`;
}

// ── JavaScript Animation Helpers ────────────────────────────────────

/**
 * Generate JavaScript code for initializing ScrollReveal animations.
 * Used for on-scroll reveal effects across sections.
 */
export function getScrollRevealScript(): string {
  return `<script src="${ANIMATION_CDNS.scrollReveal}"><\/script>
<script>
  // Initialize ScrollReveal for animated reveals on scroll
  window.addEventListener('load', function() {
    const ScrollReveal = window.ScrollReveal || {};

    // Reveal hero content
    if (document.querySelector('.hero')) {
      ScrollReveal().reveal('.hero-content', {
        origin: 'bottom',
        distance: '60px',
        duration: 800,
        easing: 'cubic-bezier(0.34, 1.56, 0.64, 1)',
        delay: 0,
      });
    }

    // Reveal feature cards with stagger
    const featureCards = document.querySelectorAll('.card');
    if (featureCards.length > 0) {
      featureCards.forEach((card, index) => {
        ScrollReveal().reveal(card, {
          origin: 'bottom',
          distance: '40px',
          duration: 600,
          delay: index * 100,
        });
      });
    }
  });
<\/script>`;
}

/**
 * Generate script tag for AOS (Animate On Scroll) library.
 * Simpler alternative to ScrollReveal, good for basic animations.
 */
export function getAOSScript(): string {
  return `<link rel="stylesheet" href="${ANIMATION_CDNS.aosCSS}">
<script src="${ANIMATION_CDNS.aos}"><\/script>
<script>
  AOS.init({
    duration: 800,
    easing: 'ease-out-quart',
    once: true,
    offset: 100,
  });
<\/script>`;
}

/**
 * Generate GSAP script for advanced animations.
 * Useful for complex interactions and timeline-based animations.
 */
export function getGSAPScript(): string {
  return `<script src="${ANIMATION_CDNS.gsap}"><\/script>
<script src="${ANIMATION_CDNS.gsapScroll}"><\/script>
<script>
  // Register ScrollTrigger plugin
  gsap.registerPlugin(ScrollTrigger);

  // Animate sections on scroll
  const sections = document.querySelectorAll('section');
  sections.forEach(section => {
    gsap.to(section, {
      scrollTrigger: {
        trigger: section,
        start: 'top center',
        end: 'center center',
        scrub: 1,
        toggleActions: 'play none none reverse',
      },
      opacity: 1,
      y: 0,
      duration: 1,
    });
  });

  // Parallax effect for hero
  const hero = document.querySelector('.hero');
  if (hero) {
    gsap.to(hero, {
      scrollTrigger: {
        trigger: hero,
        start: 'top top',
        end: 'bottom top',
        scrub: true,
        markers: false,
      },
      y: window.innerHeight * 0.3,
      duration: 1,
    });
  }
<\/script>`;
}

// ── Helper Functions ────────────────────────────────────────────────

/**
 * Detect which animation library is best for the project.
 * AOS for simple animations, ScrollReveal for more control, GSAP for advanced.
 */
export function getRecommendedAnimationLibrary(
  complexity: "low" | "medium" | "high"
): "aos" | "scrollreveal" | "gsap" {
  if (complexity === "low") return "aos";
  if (complexity === "medium") return "scrollreveal";
  return "gsap";
}

/**
 * Get the appropriate animation script based on complexity and choice.
 */
export function getAnimationScript(choice: "aos" | "scrollreveal" | "gsap" = "aos"): string {
  switch (choice) {
    case "scrollreveal":
      return getScrollRevealScript();
    case "gsap":
      return getGSAPScript();
    case "aos":
    default:
      return getAOSScript();
  }
}

// ── Data Attributes for Builder ─────────────────────────────────────

/**
 * Available data attributes for animation markup.
 * Add these to HTML elements in the Builder output.
 */
export const ANIMATION_DATA_ATTRIBUTES = {
  // AOS library attributes
  "data-aos": "fade-up",
  "data-aos-duration": "800",
  "data-aos-delay": "0",
  "data-aos-easing": "ease-out-quart",
  "data-aos-once": "true",
  "data-aos-offset": "100",

  // Animation class utilities
  "class-animate-fade-in": "animate-fade-in",
  "class-animate-slide-up": "animate-slide-up",
  "class-animate-scale-up": "animate-scale-up",
  "class-hover-lift": "hover-lift",
  "class-hover-grow": "hover-grow",
  "class-stagger-items": "stagger-items",
} as const;

// ── Animation Guidelines ────────────────────────────────────────────

export const ANIMATION_BEST_PRACTICES = `
## Animation Best Practices

1. **GPU-Acceleration Only**
   - Use only \`transform\` and \`opacity\` properties in animations
   - Avoid animating: position, width, height, layout properties
   - This prevents layout thrashing and ensures smooth 60fps

2. **Duration & Timing**
   - Keep animations between 300-800ms (snappy, not sluggish)
   - Use ease-out or cubic-bezier for entrance animations
   - Use ease-in for exit animations

3. **Reduce Motion Respect**
   - Always include \`@media (prefers-reduced-motion: reduce)\` rules
   - Disable animations for users who prefer reduced motion

4. **Performance Optimization**
   - Limit concurrent animations (< 5 simultaneously)
   - Use will-change sparingly (performance cost)
   - Lazy-load animation libraries if not critical path

5. **Stagger for Lists**
   - Apply stagger delays to list items (100ms between each)
   - Creates visual rhythm and improves perceived performance

6. **Common Patterns**
   - Hero sections: Fade in + slide up on initial load
   - Feature cards: Staggered slide-up on scroll
   - CTAs: Hover lift + glow effect
   - Testimonials: Fade in on scroll
   - Footer: Fade in after scroll

7. **Testing Animation Performance**
   - Test on lower-end devices (DevTools throttling)
   - Monitor FPS in DevTools Performance tab
   - Ensure animations still feel smooth when CPU-throttled
`;
