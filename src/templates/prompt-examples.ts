/**
 * T10 — Component examples for the Builder system prompt.
 * Production-quality HTML/CSS snippets the LLM can reference. Uses Tailwind + Alpine.js.
 * Exported as a single string to inject into the builder prompt.
 */
export const BUILDER_COMPONENT_EXAMPLES = `
### 1. Responsive navigation (Alpine.js: hamburger on mobile)
<header>
  <nav x-data="{ open: false }" class="sticky top-0 z-50 bg-white/95 backdrop-blur-sm border-b border-slate-200" aria-label="Main">
    <div class="max-w-6xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between">
      <a href="#" class="font-semibold text-lg text-slate-900">Brand</a>
      <div class="hidden md:flex items-center gap-6">
        <a href="#features" class="text-slate-600 hover:text-slate-900 transition-colors">Features</a>
        <a href="#about" class="text-slate-600 hover:text-slate-900 transition-colors">About</a>
        <a href="#contact" class="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors">Get Started</a>
      </div>
      <button type="button" @click="open = !open" class="md:hidden p-2 rounded-lg hover:bg-slate-100" :aria-expanded="open" aria-controls="mobile-menu" aria-label="Toggle menu">
        <svg x-show="!open" class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 12h16M4 18h16"/></svg>
        <svg x-show="open" class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/></svg>
      </button>
    </div>
    <div id="mobile-menu" x-show="open" x-transition class="md:hidden border-t border-slate-200 px-4 py-3 flex flex-col gap-1">
      <a href="#features" class="py-2 text-slate-700 hover:text-slate-900">Features</a>
      <a href="#about" class="py-2 text-slate-700 hover:text-slate-900">About</a>
      <a href="#contact" class="mt-2 py-2 text-center bg-blue-600 text-white rounded-lg">Get Started</a>
    </div>
  </nav>
</header>

### 2. Hero section (title, subtitle, CTA)
<section class="relative py-20 sm:py-28 px-4 overflow-hidden">
  <div class="max-w-4xl mx-auto text-center">
    <h1 class="text-4xl sm:text-5xl font-bold text-slate-900 tracking-tight">Your compelling headline</h1>
    <p class="mt-4 text-lg sm:text-xl text-slate-600 max-w-2xl mx-auto">A clear subtitle that explains the value. Keep it to one or two lines.</p>
    <div class="mt-8 flex flex-col sm:flex-row gap-4 justify-center">
      <a href="#cta" class="inline-flex items-center justify-center px-6 py-3 rounded-lg font-medium bg-blue-600 text-white hover:bg-blue-700 transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500">Primary action</a>
      <a href="#secondary" class="inline-flex items-center justify-center px-6 py-3 rounded-lg font-medium border border-slate-300 text-slate-700 hover:bg-slate-50 transition-colors">Secondary</a>
    </div>
  </div>
</section>

### 3. Card grid (1 col mobile, 2 tablet, 3 desktop)
<section class="py-16 sm:py-20 px-4" aria-labelledby="section-heading">
  <div class="max-w-6xl mx-auto">
    <h2 id="section-heading" class="text-3xl font-bold text-center text-slate-900 mb-2">Section title</h2>
    <p class="text-slate-600 text-center mb-10 max-w-xl mx-auto">Optional short intro.</p>
    <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
      <article class="bg-white border border-slate-200 rounded-xl p-6 hover:shadow-lg hover:-translate-y-0.5 transition-all duration-200 focus-within:ring-2 focus-within:ring-blue-500 focus-within:ring-offset-2">
        <div class="w-12 h-12 rounded-lg bg-blue-100 flex items-center justify-center mb-4" aria-hidden="true">
          <svg class="w-6 h-6 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z"/></svg>
        </div>
        <h3 class="font-semibold text-slate-900 mb-2">Card title</h3>
        <p class="text-slate-600 text-sm leading-relaxed">Brief description. Use real content for the project theme.</p>
      </article>
      <!-- Repeat for more cards -->
    </div>
  </div>
</section>

### 4. Footer (links, copyright, socials)
<footer class="bg-slate-900 text-slate-300 py-12 px-4 mt-auto">
  <div class="max-w-6xl mx-auto">
    <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-8">
      <div>
        <p class="font-semibold text-white mb-3">Product</p>
        <ul class="space-y-2">
          <li><a href="#features" class="hover:text-white transition-colors">Features</a></li>
          <li><a href="#pricing" class="hover:text-white transition-colors">Pricing</a></li>
        </ul>
      </div>
      <div>
        <p class="font-semibold text-white mb-3">Company</p>
        <ul class="space-y-2">
          <li><a href="#about" class="hover:text-white transition-colors">About</a></li>
          <li><a href="#contact" class="hover:text-white transition-colors">Contact</a></li>
        </ul>
      </div>
    </div>
    <div class="mt-10 pt-8 border-t border-slate-700 flex flex-col sm:flex-row justify-between items-center gap-4">
      <p class="text-sm text-slate-400">&copy; 2025 Company Name. All rights reserved.</p>
      <div class="flex gap-4" aria-label="Social links">
        <a href="#" class="text-slate-400 hover:text-white transition-colors" aria-label="Twitter">Twitter</a>
        <a href="#" class="text-slate-400 hover:text-white transition-colors" aria-label="GitHub">GitHub</a>
      </div>
    </div>
  </div>
</footer>

### 5. Form layout (labels, inputs, validation states)
<form class="max-w-md mx-auto space-y-4" novalidate>
  <div>
    <label for="email" class="block text-sm font-medium text-slate-700 mb-1">Email</label>
    <input type="email" id="email" name="email" required autocomplete="email"
      class="w-full px-4 py-2 rounded-lg border border-slate-300 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-shadow"
      placeholder="you@example.com" aria-describedby="email-hint" />
    <p id="email-hint" class="mt-1 text-sm text-slate-500">We'll never share your email.</p>
    <!-- Validation: add class "border-red-500" and aria-invalid="true" on error -->
  </div>
  <div>
    <label for="message" class="block text-sm font-medium text-slate-700 mb-1">Message</label>
    <textarea id="message" name="message" rows="4" required
      class="w-full px-4 py-2 rounded-lg border border-slate-300 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none resize-y"
      placeholder="Your message"></textarea>
  </div>
  <button type="submit" class="w-full py-3 px-4 rounded-lg font-medium bg-blue-600 text-white hover:bg-blue-700 transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500">Send</button>
</form>

### 6. Modal / dialog (Alpine.js)
<div x-data="{ open: false }" class="relative">
  <button type="button" @click="open = true" class="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">Open modal</button>
  <div x-show="open" x-transition:enter="transition ease-out duration-200" x-transition:enter-start="opacity-0" x-transition:enter-end="opacity-100"
       x-transition:leave="transition ease-in duration-150" x-transition:leave-start="opacity-100" x-transition:leave-end="opacity-0"
       class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50" role="dialog" aria-modal="true" aria-labelledby="modal-title"
       @click.self="open = false" @keydown.escape.window="open = false">
    <div class="bg-white rounded-xl shadow-xl max-w-md w-full p-6" @click.stop>
      <h2 id="modal-title" class="text-lg font-semibold text-slate-900 mb-2">Modal title</h2>
      <p class="text-slate-600 text-sm mb-4">Modal body content. Keep it concise.</p>
      <div class="flex justify-end gap-2">
        <button type="button" @click="open = false" class="px-4 py-2 rounded-lg border border-slate-300 text-slate-700 hover:bg-slate-50">Cancel</button>
        <button type="button" @click="open = false" class="px-4 py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-700">Confirm</button>
      </div>
    </div>
  </div>
</div>
`.trim();
