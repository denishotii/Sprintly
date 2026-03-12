// scripts/app.js
'use strict';

document.addEventListener('DOMContentLoaded', () => {

  // ============================================
  // MOBILE NAV TOGGLE
  // ============================================
  const hamburger = document.getElementById('hamburger');
  const mobileMenu = document.getElementById('mobile-menu');
  const iconOpen = document.getElementById('icon-open');
  const iconClose = document.getElementById('icon-close');

  if (hamburger && mobileMenu) {
    hamburger.addEventListener('click', () => {
      const isOpen = !mobileMenu.classList.contains('hidden');

      if (isOpen) {
        mobileMenu.classList.add('hidden');
        iconOpen.classList.remove('hidden');
        iconClose.classList.add('hidden');
        hamburger.setAttribute('aria-expanded', 'false');
      } else {
        mobileMenu.classList.remove('hidden');
        iconOpen.classList.add('hidden');
        iconClose.classList.remove('hidden');
        hamburger.setAttribute('aria-expanded', 'true');
      }
    });

    // Close mobile menu when a link is clicked
    mobileMenu.querySelectorAll('a').forEach(link => {
      link.addEventListener('click', () => {
        mobileMenu.classList.add('hidden');
        iconOpen.classList.remove('hidden');
        iconClose.classList.add('hidden');
        hamburger.setAttribute('aria-expanded', 'false');
      });
    });
  }

  // ============================================
  // NAVBAR SCROLL EFFECT
  // ============================================
  const navbar = document.getElementById('navbar');

  const handleNavbarScroll = () => {
    if (window.scrollY > 20) {
      navbar.classList.add('scrolled');
    } else {
      navbar.classList.remove('scrolled');
    }
  };

  window.addEventListener('scroll', handleNavbarScroll, { passive: true });
  handleNavbarScroll(); // Run on load

  // ============================================
  // SMOOTH SCROLLING FOR ANCHOR LINKS
  // ============================================
  document.querySelectorAll('a[href^="#"]').forEach(anchor => {
    anchor.addEventListener('click', (e) => {
      const href = anchor.getAttribute('href');
      if (href === '#') return;

      const target = document.querySelector(href);
      if (target) {
        e.preventDefault();
        const navHeight = navbar ? navbar.offsetHeight : 64;
        const targetTop = target.getBoundingClientRect().top + window.scrollY - navHeight;

        window.scrollTo({
          top: targetTop,
          behavior: 'smooth'
        });
      }
    });
  });

  // ============================================
  // SCROLL-TRIGGERED REVEAL ANIMATIONS
  // ============================================
  const revealElements = document.querySelectorAll('.reveal');

  if ('IntersectionObserver' in window) {
    const revealObserver = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          // Respect animation-delay set inline
          const delay = entry.target.style.animationDelay || '0s';
          const delayMs = parseFloat(delay) * 1000;

          setTimeout(() => {
            entry.target.classList.add('visible');
          }, delayMs);

          revealObserver.unobserve(entry.target);
        }
      });
    }, {
      threshold: 0.1,
      rootMargin: '0px 0px -40px 0px'
    });

    revealElements.forEach(el => revealObserver.observe(el));
  } else {
    // Fallback: show all elements immediately
    revealElements.forEach(el => el.classList.add('visible'));
  }

  // ============================================
  // TYPING ANIMATION
  // ============================================
  const typingEl = document.getElementById('typing-text');
  const capabilities = [
    'Websites',
    'React Apps',
    'Python Scripts',
    'Reports',
    'APIs',
    'Dashboards',
    'Anything'
  ];

  let capIndex = 0;
  let charIndex = 0;
  let isDeleting = false;
  let typingTimeout = null;

  const TYPE_SPEED = 90;
  const DELETE_SPEED = 50;
  const PAUSE_AFTER_TYPE = 1800;
  const PAUSE_AFTER_DELETE = 300;

  function typeWriter() {
    if (!typingEl) return;

    const currentWord = capabilities[capIndex];

    if (!isDeleting) {
      // Typing forward
      typingEl.textContent = currentWord.substring(0, charIndex + 1);
      charIndex++;

      if (charIndex === currentWord.length) {
        // Finished typing — pause then start deleting
        isDeleting = true;
        typingTimeout = setTimeout(typeWriter, PAUSE_AFTER_TYPE);
        return;
      }
    } else {
      // Deleting
      typingEl.textContent = currentWord.substring(0, charIndex - 1);
      charIndex--;

      if (charIndex === 0) {
        // Finished deleting — move to next word
        isDeleting = false;
        capIndex = (capIndex + 1) % capabilities.length;
        typingTimeout = setTimeout(typeWriter, PAUSE_AFTER_DELETE);
        return;
      }
    }

    const speed = isDeleting ? DELETE_SPEED : TYPE_SPEED;
    typingTimeout = setTimeout(typeWriter, speed);
  }

  // Start typing after hero fade-in
  setTimeout(typeWriter, 800);

  // ============================================
  // SUBTLE HERO PARALLAX
  // ============================================
  const heroGrid = document.querySelector('.hero-grid');
  const glowOrb1 = document.querySelector('.glow-orb-1');
  const glowOrb2 = document.querySelector('.glow-orb-2');

  let ticking = false;

  const handleParallax = () => {
    if (!ticking) {
      requestAnimationFrame(() => {
        const scrollY = window.scrollY;
        const heroEl = document.getElementById('hero');

        if (heroEl && scrollY < heroEl.offsetHeight) {
          const factor = scrollY * 0.3;

          if (heroGrid) {
            heroGrid.style.transform = `translateY(${factor * 0.4}px)`;
          }
          if (glowOrb1) {
            glowOrb1.style.transform = `translate(${factor * 0.1}px, ${factor * 0.2}px)`;
          }
          if (glowOrb2) {
            glowOrb2.style.transform = `translate(${-factor * 0.1}px, ${-factor * 0.15}px)`;
          }
        }

        ticking = false;
      });
      ticking = true;
    }
  };

  window.addEventListener('scroll', handleParallax, { passive: true });

  // ============================================
  // CODE SHOWCASE — TAB SWITCHING
  // ============================================
  const codeData = {
    python: {
      filename: 'weather_report.py',
      code: `<span class="token-import">import</span> requests
<span class="token-import">import</span> json
<span class="token-import">from</span> datetime <span class="token-import">import</span> datetime
<span class="token-import">from</span> typing <span class="token-import">import</span> Optional

<span class="token-class">class</span> <span class="token-function">WeatherReporter</span>:
    <span class="token-decorator">"""Fetches and formats daily weather reports."""</span>

    <span class="token-keyword">def</span> <span class="token-function">__init__</span>(self, api_key: str, city: str):
        self.api_key = api_key
        self.city = city
        self.base_url = <span class="token-string">"https://api.openweathermap.org/data/2.5"</span>

    <span class="token-keyword">def</span> <span class="token-function">fetch_weather</span>(self) -> Optional[dict]:
        <span class="token-comment"># Fetch current weather + 5-day forecast</span>
        url = f<span class="token-string">"{self.base_url}/forecast?q={self.city}&appid={self.api_key}&units=metric"</span>
        response = requests.get(url, timeout=<span class="token-number">10</span>)
        response.raise_for_status()
        <span class="token-keyword">return</span> response.json()

    <span class="token-keyword">def</span> <span class="token-function">generate_report</span>(self) -> str:
        data = self.fetch_weather()
        forecasts = data[<span class="token-string">'list'</span>][:<span class="token-number">8</span>]  <span class="token-comment"># Next 24 hours</span>
        temps = [f[<span class="token-string">'main'</span>][<span class="token-string">'temp'</span>] <span class="token-keyword">for</span> f <span class="token-keyword">in</span> forecasts]

        report = f<span class="token-string">"""
╔══════════════════════════════════════╗
  Weather Report — {self.city}
  Generated: {datetime.now().strftime('%Y-%m-%d %H:%M')}
╚══════════════════════════════════════╝

📊 Temperature Trend (24h):
  Min: {min(temps):.1f}°C  |  Max: {max(temps):.1f}°C
  Avg: {sum(temps)/len(temps):.1f}°C

⚠️  Alerts: {'Heat advisory' if max(temps) > 35 else 'None'}
"""</span>
        <span class="token-keyword">return</span> report

<span class="token-comment"># Usage</span>
reporter = <span class="token-function">WeatherReporter</span>(<span class="token-string">"YOUR_API_KEY"</span>, <span class="token-string">"London"</span>)
print(reporter.generate_report())`
    },
    react: {
      filename: 'Dashboard.jsx',
      code: `<span class="token-import">import</span> { useState, useEffect } <span class="token-import">from</span> <span class="token-string">'react'</span>;
<span class="token-import">import</span> { LineChart, Line, XAxis, YAxis, Tooltip } <span class="token-import">from</span> <span class="token-string">'recharts'</span>;

<span class="token-keyword">const</span> <span class="token-function">Dashboard</span> = () => {
  <span class="token-keyword">const</span> [metrics, setMetrics] = <span class="token-function">useState</span>(<span class="token-keyword">null</span>);
  <span class="token-keyword">const</span> [loading, setLoading] = <span class="token-function">useState</span>(<span class="token-keyword">true</span>);
  <span class="token-keyword">const</span> [darkMode, setDarkMode] = <span class="token-function">useState</span>(<span class="token-keyword">true</span>);

  <span class="token-function">useEffect</span>(() => {
    <span class="token-comment">// Fetch analytics data on mount</span>
    <span class="token-keyword">const</span> <span class="token-function">fetchMetrics</span> = <span class="token-keyword">async</span> () => {
      <span class="token-keyword">try</span> {
        <span class="token-keyword">const</span> res = <span class="token-keyword">await</span> <span class="token-function">fetch</span>(<span class="token-string">'/api/metrics'</span>);
        <span class="token-keyword">const</span> data = <span class="token-keyword">await</span> res.<span class="token-function">json</span>();
        <span class="token-function">setMetrics</span>(data);
      } <span class="token-keyword">catch</span> (err) {
        console.<span class="token-function">error</span>(<span class="token-string">'Failed to fetch metrics'</span>, err);
      } <span class="token-keyword">finally</span> {
        <span class="token-function">setLoading</span>(<span class="token-keyword">false</span>);
      }
    };
    <span class="token-function">fetchMetrics</span>();
  }, []);

  <span class="token-keyword">if</span> (loading) <span class="token-keyword">return</span> &lt;<span class="token-function">Spinner</span> /&gt;;

  <span class="token-keyword">return</span> (
    &lt;div className={<span class="token-string">\`dashboard \${darkMode ? 'dark' : 'light'}\`</span>}&gt;
      &lt;<span class="token-function">Header</span>
        title=<span class="token-string">"Analytics"</span>
        onToggleDark={() =&gt; <span class="token-function">setDarkMode</span>(!darkMode)}
      /&gt;
      &lt;<span class="token-function">MetricsGrid</span> data={metrics} /&gt;
      &lt;<span class="token-function">LineChart</span> width={<span class="token-number">600</span>} height={<span class="token-number">300</span>} data={metrics.trend}&gt;
        &lt;<span class="token-function">Line</span> type=<span class="token-string">"monotone"</span> dataKey=<span class="token-string">"value"</span> stroke=<span class="token-string">"#22D3EE"</span> /&gt;
        &lt;<span class="token-function">XAxis</span> dataKey=<span class="token-string">"date"</span> /&gt;
        &lt;<span class="token-function">YAxis</span> /&gt;
        &lt;<span class="token-function">Tooltip</span> /&gt;
      &lt;/<span class="token-function">LineChart</span>&gt;
    &lt;/div&gt;
  );
};

<span class="token-keyword">export default</span> Dashboard;`
    },
    html: {
      filename: 'landing.html',
      code: `<span class="token-comment">&lt;!-- Sprintly AI generated this in 1.8 seconds --&gt;</span>
<span class="token-keyword">&lt;!DOCTYPE html&gt;</span>
&lt;<span class="token-function">html</span> lang=<span class="token-string">"en"</span>&gt;
&lt;<span class="token-function">head</span>&gt;
  &lt;<span class="token-function">meta</span> charset=<span class="token-string">"UTF-8"</span>&gt;
  &lt;<span class="token-function">title</span>&gt;Product Landing Page&lt;/<span class="token-function">title</span>&gt;
  &lt;<span class="token-function">link</span> rel=<span class="token-string">"stylesheet"</span> href=<span class="token-string">"styles.css"</span>&gt;
&lt;/<span class="token-function">head</span>&gt;
&lt;<span class="token-function">body</span>&gt;
  &lt;<span class="token-function">header</span> class=<span class="token-string">"navbar"</span>&gt;
    &lt;<span class="token-function">nav</span> aria-label=<span class="token-string">"Main"</span>&gt;
      &lt;<span class="token-function">a</span> href=<span class="token-string">"/"</span> class=<span class="token-string">"logo"</span>&gt;Brand&lt;/<span class="token-function">a</span>&gt;
      &lt;<span class="token-function">ul</span> class=<span class="token-string">"nav-links"</span>&gt;
        &lt;<span class="token-function">li</span>&gt;&lt;<span class="token-function">a</span> href=<span class="token-string">"#features"</span>&gt;Features&lt;/<span class="token-function">a</span>&gt;&lt;/<span class="token-function">li</span>&gt;
        &lt;<span class="token-function">li</span>&gt;&lt;<span class="token-function">a</span> href=<span class="token-string">"#pricing"</span>&gt;Pricing&lt;/<span class="token-function">a</span>&gt;&lt;/<span class="token-function">li</span>&gt;
      &lt;/<span class="token-function">ul</span>&gt;
    &lt;/<span class="token-function">nav</span>&gt;
  &lt;/<span class="token-function">header</span>&gt;

  &lt;<span class="token-function">main</span>&gt;
    &lt;<span class="token-function">section</span> class=<span class="token-string">"hero"</span>&gt;
      &lt;<span class="token-function">h1</span>&gt;Ship Faster Than Ever&lt;/<span class="token-function">h1</span>&gt;
      &lt;<span class="token-function">p</span>&gt;The tool that supercharges your workflow.&lt;/<span class="token-function">p</span>&gt;
      &lt;<span class="token-function">a</span> href=<span class="token-string">"#cta"</span> class=<span class="token-string">"btn-primary"</span>&gt;
        Get Started Free
      &lt;/<span class="token-function">a</span>&gt;
    &lt;/<span class="token-function">section</span>&gt;

    &lt;<span class="token-function">section</span> id=<span class="token-string">"features"</span> class=<span class="token-string">"features-grid"</span>&gt;
      <span class="token-comment">&lt;!-- Feature cards auto-generated --&gt;</span>
    &lt;/<span class="token-function">section</span>&gt;
  &lt;/<span class="token-function">main</span>&gt;

  &lt;<span class="token-function">script</span> src=<span class="token-string">"app.js"</span>&gt;&lt;/<span class="token-function">script</span>&gt;
&lt;/<span class="token-function">body</span>&gt;
&lt;/<span class="token-function">html</span>&gt;`
    }
  };

  const tabs = document.querySelectorAll('.showcase-tab');
  const codeContent = document.getElementById('code-content');
  const codeFilename = document.getElementById('code-filename');
  const copyBtn = document.getElementById('copy-btn');

  function loadCodeTab(tabName) {
    const data = codeData[tabName];
    if (!data || !codeContent || !codeFilename) return;

    codeFilename.textContent = data.filename;
    codeContent.innerHTML = data.code;
  }

  // Load default tab
  loadCodeTab('python');

  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      tabs.forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      loadCodeTab(tab.dataset.tab);
    });
  });

  // Copy code button
  if (copyBtn && codeContent) {
    copyBtn.addEventListener('click', () => {
      const rawText = codeContent.innerText || codeContent.textContent;

      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(rawText).then(() => {
          const originalHTML = copyBtn.innerHTML;
          copyBtn.innerHTML = `
            <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/>
            </svg>
            Copied!
          `;
          copyBtn.style.color = '#22D3EE';
          setTimeout(() => {
            copyBtn.innerHTML = originalHTML;
            copyBtn.style.color = '';
          }, 2000);
        }).catch(() => {
          // Silent fail
        });
      }
    });
  }

  // ============================================
  // HERO FADE-IN ELEMENTS
  // ============================================
  // Stagger the fade-in-up elements in the hero
  const fadeElements = document.querySelectorAll('.fade-in-up');
  fadeElements.forEach((el, i) => {
    const existingDelay = parseFloat(el.style.animationDelay) || 0;
    if (!el.style.animationDelay) {
      el.style.animationDelay = `${i * 0.1}s`;
    }
  });

});