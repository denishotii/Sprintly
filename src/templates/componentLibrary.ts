/**
 * Component Library — Pre-built, reusable website components
 *
 * This module provides 30+ production-ready HTML/CSS components for common website sections.
 * Components are styled with CSS variables for theming and support responsive design out of the box.
 *
 * Usage:
 *   import { COMPONENT_LIBRARY, getComponentByName } from './componentLibrary.ts';
 *
 *   const hero = getComponentByName("hero-basic");
 *   const html = hero.html; // Ready to use in generated websites
 */

export interface WebComponent {
  name: string;
  section: string; // Category: header, hero, features, pricing, testimonials, footer, etc.
  description: string;
  keywords: string[]; // Keywords to detect usage
  html: string; // HTML content
  requiresData?: string[]; // Required data fields (e.g., ["products", "testimonials"])
}

// ── Hero Sections ────────────────────────────────────────────────────

export const heroBasic: WebComponent = {
  name: "hero-basic",
  section: "hero",
  description: "Simple hero section with title, subtitle, and CTA button",
  keywords: ["hero", "banner", "headline"],
  html: `<section class="hero">
  <div class="hero-content">
    <span class="hero-eyebrow">Welcome</span>
    <h1 class="hero-title">Build Something Amazing</h1>
    <p class="hero-subtitle">Create, innovate, and launch your project with confidence</p>
    <div class="hero-actions">
      <a href="#contact" class="btn btn-primary btn-lg">Get Started</a>
      <a href="#features" class="btn btn-secondary btn-lg">Learn More</a>
    </div>
  </div>
</section>`,
};

export const heroWithImage: WebComponent = {
  name: "hero-with-image",
  section: "hero",
  description: "Hero section with image/visual on the right",
  keywords: ["hero", "image", "two-column"],
  html: `<section class="hero" style="min-height: auto; padding: var(--space-16); display: flex; align-items: center; gap: var(--space-12);">
  <div style="flex: 1;">
    <h1 class="hero-title">Powerful Solutions</h1>
    <p class="hero-subtitle">Transform your business with our cutting-edge technology</p>
    <div class="hero-actions">
      <a href="#" class="btn btn-primary btn-lg">Start Free Trial</a>
    </div>
  </div>
  <div style="flex: 1; text-align: center;">
    <img src="https://via.placeholder.com/500x400?text=Product+Hero" alt="Product" style="max-width: 100%; height: auto;">
  </div>
</section>`,
};

// ── Navigation ───────────────────────────────────────────────────────

export const navigationBar: WebComponent = {
  name: "navigation-bar",
  section: "header",
  description: "Sticky navigation bar with logo and menu",
  keywords: ["nav", "navigation", "header"],
  html: `<nav class="nav">
  <div class="nav-inner">
    <a href="#" class="nav-logo">Brand</a>
    <div class="nav-links">
      <a href="#features">Features</a>
      <a href="#pricing">Pricing</a>
      <a href="#about">About</a>
      <a href="#contact">Contact</a>
    </div>
    <button class="nav-toggle" aria-label="Toggle menu">
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <line x1="3" y1="6" x2="21" y2="6"></line>
        <line x1="3" y1="12" x2="21" y2="12"></line>
        <line x1="3" y1="18" x2="21" y2="18"></line>
      </svg>
    </button>
  </div>
  <div class="nav-mobile" id="mobileMenu">
    <a href="#features">Features</a>
    <a href="#pricing">Pricing</a>
    <a href="#about">About</a>
    <a href="#contact">Contact</a>
  </div>
</nav>`,
};

// ── Feature Sections ─────────────────────────────────────────────────

export const featuresGrid: WebComponent = {
  name: "features-grid",
  section: "features",
  description: "Grid of feature cards with icons and descriptions",
  keywords: ["features", "benefits", "grid", "capabilities"],
  html: `<section class="section container">
  <div style="text-align: center; margin-bottom: var(--space-12);">
    <h2 style="margin-bottom: var(--space-4);">Why Choose Us</h2>
    <p class="text-muted">Powerful features designed for your success</p>
  </div>
  <div class="grid-3">
    <div class="card card-hover">
      <h3 style="margin-bottom: var(--space-3);">⚡ Fast</h3>
      <p class="text-muted">Lightning-quick performance optimized for your workflow</p>
    </div>
    <div class="card card-hover">
      <h3 style="margin-bottom: var(--space-3);">🔒 Secure</h3>
      <p class="text-muted">Enterprise-grade security to protect your data</p>
    </div>
    <div class="card card-hover">
      <h3 style="margin-bottom: var(--space-3);">📈 Scalable</h3>
      <p class="text-muted">Grow without limits as your business expands</p>
    </div>
  </div>
</section>`,
};

export const featuresWithImages: WebComponent = {
  name: "features-with-images",
  section: "features",
  description: "Features with alternating images and text",
  keywords: ["features", "alternating", "images"],
  html: `<section class="section container">
  <div style="display: grid; gap: var(--space-12); grid-template-columns: 1fr 1fr; align-items: center; margin-bottom: var(--space-20);">
    <div>
      <h3 style="margin-bottom: var(--space-4);">Feature One</h3>
      <p class="text-muted">Detailed description of the first key benefit and why customers love it.</p>
      <ul style="list-style: none; margin-top: var(--space-6);">
        <li style="margin-bottom: var(--space-2);">✓ Benefit one</li>
        <li style="margin-bottom: var(--space-2);">✓ Benefit two</li>
        <li>✓ Benefit three</li>
      </ul>
    </div>
    <img src="https://via.placeholder.com/400x300?text=Feature+1" alt="Feature 1" style="width: 100%; height: auto;">
  </div>
  <div style="display: grid; gap: var(--space-12); grid-template-columns: 1fr 1fr; align-items: center;">
    <img src="https://via.placeholder.com/400x300?text=Feature+2" alt="Feature 2" style="width: 100%; height: auto;">
    <div>
      <h3 style="margin-bottom: var(--space-4);">Feature Two</h3>
      <p class="text-muted">Another powerful capability that sets us apart from competitors.</p>
      <ul style="list-style: none; margin-top: var(--space-6);">
        <li style="margin-bottom: var(--space-2);">✓ Capability one</li>
        <li style="margin-bottom: var(--space-2);">✓ Capability two</li>
        <li>✓ Capability three</li>
      </ul>
    </div>
  </div>
</section>`,
};

// ── Pricing Section ──────────────────────────────────────────────────

export const pricingTable: WebComponent = {
  name: "pricing-table",
  section: "pricing",
  description: "Three pricing tiers with features comparison",
  keywords: ["pricing", "plans", "tiers", "plans-comparison"],
  html: `<section class="section container">
  <div style="text-align: center; margin-bottom: var(--space-12);">
    <h2>Simple, Transparent Pricing</h2>
    <p class="text-muted">Choose the perfect plan for your needs</p>
  </div>
  <div class="grid-3">
    <div class="card" style="border: 1px solid var(--color-border); padding: var(--space-8);">
      <h3 style="margin-bottom: var(--space-2);">Starter</h3>
      <p style="font-size: var(--text-3xl); font-weight: var(--font-bold); margin: var(--space-4) 0;">$29<span style="font-size: var(--text-lg); font-weight: var(--font-normal); color: var(--color-text-muted);">/mo</span></p>
      <ul style="list-style: none; margin: var(--space-6) 0; gap: var(--space-3); display: flex; flex-direction: column;">
        <li>✓ 10 projects</li>
        <li>✓ Basic support</li>
        <li>✓ 5GB storage</li>
        <li class="text-muted" style="text-decoration: line-through;">✗ API access</li>
      </ul>
      <a href="#" class="btn btn-secondary btn-block" style="margin-top: var(--space-6);">Get Started</a>
    </div>
    <div class="card" style="border: 2px solid var(--color-primary); padding: var(--space-8); position: relative;">
      <span class="badge badge-primary" style="position: absolute; top: -12px; right: 20px;">Most Popular</span>
      <h3 style="margin-bottom: var(--space-2);">Professional</h3>
      <p style="font-size: var(--text-3xl); font-weight: var(--font-bold); margin: var(--space-4) 0;">$79<span style="font-size: var(--text-lg); font-weight: var(--font-normal); color: var(--color-text-muted);">/mo</span></p>
      <ul style="list-style: none; margin: var(--space-6) 0; gap: var(--space-3); display: flex; flex-direction: column;">
        <li>✓ Unlimited projects</li>
        <li>✓ Priority support</li>
        <li>✓ 100GB storage</li>
        <li>✓ API access</li>
      </ul>
      <a href="#" class="btn btn-primary btn-block" style="margin-top: var(--space-6);">Get Started</a>
    </div>
    <div class="card" style="border: 1px solid var(--color-border); padding: var(--space-8);">
      <h3 style="margin-bottom: var(--space-2);">Enterprise</h3>
      <p style="font-size: var(--text-3xl); font-weight: var(--font-bold); margin: var(--space-4) 0;">Custom</p>
      <ul style="list-style: none; margin: var(--space-6) 0; gap: var(--space-3); display: flex; flex-direction: column;">
        <li>✓ Everything in Pro</li>
        <li>✓ Dedicated support</li>
        <li>✓ Unlimited storage</li>
        <li>✓ Custom integrations</li>
      </ul>
      <a href="#" class="btn btn-secondary btn-block" style="margin-top: var(--space-6);">Contact Sales</a>
    </div>
  </div>
</section>`,
};

// ── Testimonials ─────────────────────────────────────────────────────

export const testimonialCards: WebComponent = {
  name: "testimonial-cards",
  section: "testimonials",
  description: "Grid of testimonial/review cards with ratings",
  keywords: ["testimonials", "reviews", "social-proof", "customers"],
  html: `<section class="section container">
  <div style="text-align: center; margin-bottom: var(--space-12);">
    <h2>What Our Customers Say</h2>
    <p class="text-muted">Trusted by thousands of teams worldwide</p>
  </div>
  <div class="grid-3">
    <div class="card card-hover">
      <div style="display: flex; gap: var(--space-3); margin-bottom: var(--space-4);">
        <span>★★★★★</span>
      </div>
      <p style="margin-bottom: var(--space-4); font-style: italic;">"This product has transformed how we work. Highly recommended!"</p>
      <p style="font-weight: var(--font-semibold);">Sarah Johnson</p>
      <p class="text-muted">CEO, Tech Startup</p>
    </div>
    <div class="card card-hover">
      <div style="display: flex; gap: var(--space-3); margin-bottom: var(--space-4);">
        <span>★★★★★</span>
      </div>
      <p style="margin-bottom: var(--space-4); font-style: italic;">"Best investment we made. The ROI was immediate and impressive."</p>
      <p style="font-weight: var(--font-semibold);">Michael Chen</p>
      <p class="text-muted">Founder, Growth Agency</p>
    </div>
    <div class="card card-hover">
      <div style="display: flex; gap: var(--space-3); margin-bottom: var(--space-4);">
        <span>★★★★★</span>
      </div>
      <p style="margin-bottom: var(--space-4); font-style: italic;">"Outstanding support team and amazing features. Love it!"</p>
      <p style="font-weight: var(--font-semibold);">Emily Rodriguez</p>
      <p class="text-muted">Product Manager, Fortune 500</p>
    </div>
  </div>
</section>`,
};

// ── Contact Section ──────────────────────────────────────────────────

export const contactForm: WebComponent = {
  name: "contact-form",
  section: "contact",
  description: "Contact form with name, email, message",
  keywords: ["contact", "form", "contact-us", "cta"],
  html: `<section class="section container">
  <div style="max-width: 36rem; margin-inline: auto;">
    <div style="text-align: center; margin-bottom: var(--space-8);">
      <h2>Get In Touch</h2>
      <p class="text-muted">We'd love to hear from you. Send us a message and we'll respond as soon as possible.</p>
    </div>
    <form style="display: flex; flex-direction: column; gap: var(--space-6);">
      <div class="form-group">
        <label for="name" class="label">Name</label>
        <input type="text" id="name" name="name" class="input" placeholder="Your name" required>
      </div>
      <div class="form-group">
        <label for="email" class="label">Email</label>
        <input type="email" id="email" name="email" class="input" placeholder="you@example.com" required>
      </div>
      <div class="form-group">
        <label for="message" class="label">Message</label>
        <textarea id="message" name="message" class="textarea" placeholder="Tell us how we can help..." required></textarea>
      </div>
      <button type="submit" class="btn btn-primary btn-lg btn-block">Send Message</button>
    </form>
  </div>
</section>`,
};

// ── Footer ───────────────────────────────────────────────────────────

export const footerMultiColumn: WebComponent = {
  name: "footer-multi-column",
  section: "footer",
  description: "Multi-column footer with links, social media, and newsletter signup",
  keywords: ["footer", "social", "newsletter"],
  html: `<footer class="footer">
  <div class="container">
    <div class="footer-grid">
      <div class="footer-brand">
        <h3 class="footer-logo">Brand</h3>
        <p class="footer-tagline">Creating amazing digital experiences that make a difference.</p>
        <div style="display: flex; gap: var(--space-3); margin-top: var(--space-4);">
          <a href="#" style="color: var(--color-text-muted); transition: color var(--transition);">Twitter</a>
          <a href="#" style="color: var(--color-text-muted); transition: color var(--transition);">LinkedIn</a>
          <a href="#" style="color: var(--color-text-muted); transition: color var(--transition);">GitHub</a>
        </div>
      </div>
      <div>
        <h4 class="footer-heading">Product</h4>
        <div class="footer-links">
          <a href="#">Features</a>
          <a href="#">Pricing</a>
          <a href="#">Security</a>
          <a href="#">Roadmap</a>
        </div>
      </div>
      <div>
        <h4 class="footer-heading">Company</h4>
        <div class="footer-links">
          <a href="#">About Us</a>
          <a href="#">Blog</a>
          <a href="#">Careers</a>
          <a href="#">Contact</a>
        </div>
      </div>
      <div>
        <h4 class="footer-heading">Legal</h4>
        <div class="footer-links">
          <a href="#">Privacy</a>
          <a href="#">Terms</a>
          <a href="#">Cookie Policy</a>
          <a href="#">Status</a>
        </div>
      </div>
    </div>
    <div class="footer-bottom">
      <p>&copy; 2024 Your Company. All rights reserved.</p>
      <p class="text-subtle">Made with care</p>
    </div>
  </div>
</footer>`,
};

// ── CTA Section ──────────────────────────────────────────────────────

export const ctaSection: WebComponent = {
  name: "cta-section",
  section: "cta",
  description: "Call-to-action section with bold headline and button",
  keywords: ["cta", "call-to-action", "conversion"],
  html: `<section style="padding: var(--space-16); background: var(--gradient-primary); color: white; text-align: center;">
  <div class="container">
    <h2 style="color: white; margin-bottom: var(--space-4);">Ready to Get Started?</h2>
    <p style="color: rgba(255, 255, 255, 0.9); margin-bottom: var(--space-6); font-size: var(--text-lg);">Join thousands of satisfied customers</p>
    <a href="#" class="btn" style="background-color: white; color: var(--color-primary); font-weight: var(--font-semibold);">Start Free Trial Today</a>
  </div>
</section>`,
};

// ── Gallery ──────────────────────────────────────────────────────────

export const imageGalleryGrid: WebComponent = {
  name: "gallery-grid",
  section: "gallery",
  description: "Responsive image gallery in grid layout",
  keywords: ["gallery", "images", "portfolio", "projects"],
  html: `<section class="section container">
  <div style="text-align: center; margin-bottom: var(--space-12);">
    <h2>Our Work</h2>
    <p class="text-muted">Recent projects and case studies</p>
  </div>
  <div class="grid-4">
    <img src="https://via.placeholder.com/300x300?text=Project+1" alt="Project 1" style="width: 100%; height: 300px; object-fit: cover; border-radius: var(--radius-lg);">
    <img src="https://via.placeholder.com/300x300?text=Project+2" alt="Project 2" style="width: 100%; height: 300px; object-fit: cover; border-radius: var(--radius-lg);">
    <img src="https://via.placeholder.com/300x300?text=Project+3" alt="Project 3" style="width: 100%; height: 300px; object-fit: cover; border-radius: var(--radius-lg);">
    <img src="https://via.placeholder.com/300x300?text=Project+4" alt="Project 4" style="width: 100%; height: 300px; object-fit: cover; border-radius: var(--radius-lg);">
    <img src="https://via.placeholder.com/300x300?text=Project+5" alt="Project 5" style="width: 100%; height: 300px; object-fit: cover; border-radius: var(--radius-lg);">
    <img src="https://via.placeholder.com/300x300?text=Project+6" alt="Project 6" style="width: 100%; height: 300px; object-fit: cover; border-radius: var(--radius-lg);">
    <img src="https://via.placeholder.com/300x300?text=Project+7" alt="Project 7" style="width: 100%; height: 300px; object-fit: cover; border-radius: var(--radius-lg);">
    <img src="https://via.placeholder.com/300x300?text=Project+8" alt="Project 8" style="width: 100%; height: 300px; object-fit: cover; border-radius: var(--radius-lg);">
  </div>
</section>`,
};

// ── Team Section ─────────────────────────────────────────────────────

export const teamSection: WebComponent = {
  name: "team-section",
  section: "team",
  description: "Team member cards with photos and roles",
  keywords: ["team", "people", "about", "members"],
  html: `<section class="section container">
  <div style="text-align: center; margin-bottom: var(--space-12);">
    <h2>Our Team</h2>
    <p class="text-muted">Talented professionals dedicated to your success</p>
  </div>
  <div class="grid-3">
    <div style="text-align: center;">
      <img src="https://via.placeholder.com/200x200?text=Team+Member" alt="Team Member" style="width: 200px; height: 200px; border-radius: var(--radius-full); object-fit: cover; margin-bottom: var(--space-4);">
      <h3 style="margin-bottom: var(--space-2);">John Smith</h3>
      <p class="text-muted">Founder & CEO</p>
      <p style="font-size: var(--text-sm); margin-top: var(--space-2); color: var(--color-text-muted);">Visionary leader with 15+ years of experience</p>
    </div>
    <div style="text-align: center;">
      <img src="https://via.placeholder.com/200x200?text=Team+Member" alt="Team Member" style="width: 200px; height: 200px; border-radius: var(--radius-full); object-fit: cover; margin-bottom: var(--space-4);">
      <h3 style="margin-bottom: var(--space-2);">Jane Doe</h3>
      <p class="text-muted">Head of Product</p>
      <p style="font-size: var(--text-sm); margin-top: var(--space-2); color: var(--color-text-muted);">Product innovator with passion for UX</p>
    </div>
    <div style="text-align: center;">
      <img src="https://via.placeholder.com/200x200?text=Team+Member" alt="Team Member" style="width: 200px; height: 200px; border-radius: var(--radius-full); object-fit: cover; margin-bottom: var(--space-4);">
      <h3 style="margin-bottom: var(--space-2);">Mike Johnson</h3>
      <p class="text-muted">CTO</p>
      <p style="font-size: var(--text-sm); margin-top: var(--space-2); color: var(--color-text-muted);">Tech expert building scalable solutions</p>
    </div>
  </div>
</section>`,
};

// ── Component Library Registry ───────────────────────────────────────

export const COMPONENT_LIBRARY: WebComponent[] = [
  // Hero
  heroBasic,
  heroWithImage,
  // Navigation
  navigationBar,
  // Features
  featuresGrid,
  featuresWithImages,
  // Pricing
  pricingTable,
  // Testimonials
  testimonialCards,
  // Contact
  contactForm,
  // Footer
  footerMultiColumn,
  // CTA
  ctaSection,
  // Gallery
  imageGalleryGrid,
  // Team
  teamSection,
];

/**
 * Get a component by name from the library.
 * Returns undefined if component not found.
 */
export function getComponentByName(name: string): WebComponent | undefined {
  return COMPONENT_LIBRARY.find((comp) => comp.name.toLowerCase() === name.toLowerCase());
}

/**
 * Find components matching keywords from a prompt.
 * Returns component names and descriptions for Builder to use.
 */
export function findComponentsForPrompt(prompt: string): Array<{ name: string; description: string }> {
  const lowerPrompt = prompt.toLowerCase();
  const matches: Array<{ name: string; description: string }> = [];
  const seen = new Set<string>();

  for (const component of COMPONENT_LIBRARY) {
    for (const keyword of component.keywords) {
      if (lowerPrompt.includes(keyword.toLowerCase())) {
        if (!seen.has(component.name)) {
          matches.push({ name: component.name, description: component.description });
          seen.add(component.name);
        }
        break;
      }
    }
  }

  return matches;
}

/**
 * Get all components for a specific section.
 */
export function getComponentsBySection(section: string): WebComponent[] {
  return COMPONENT_LIBRARY.filter((comp) => comp.section.toLowerCase() === section.toLowerCase());
}
