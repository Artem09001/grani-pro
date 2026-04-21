/* ════════════════════════════════════════════
   ГРАНИТ PRO — script.js
   Vanilla JS — no dependencies
════════════════════════════════════════════ */

document.addEventListener('DOMContentLoaded', () => {

  /* ──────────────────────────────────────────
     1. NAVBAR — scroll effect + burger menu
  ────────────────────────────────────────── */
  const navbar     = document.getElementById('navbar');
  const burger     = document.querySelector('.burger');
  const mobileMenu = document.getElementById('mobileMenu');
  const mobileLinks = mobileMenu.querySelectorAll('a');

  // Scroll → add .scrolled class
  const handleNavScroll = () => {
    navbar.classList.toggle('scrolled', window.scrollY > 80);
  };
  window.addEventListener('scroll', handleNavScroll, { passive: true });
  handleNavScroll();

  // Burger toggle
  const openMenu = () => {
    burger.classList.add('active');
    mobileMenu.classList.add('open');
    document.body.classList.add('menu-open');
    burger.setAttribute('aria-expanded', 'true');
  };

  const closeMenu = () => {
    burger.classList.remove('active');
    mobileMenu.classList.remove('open');
    document.body.classList.remove('menu-open');
    burger.setAttribute('aria-expanded', 'false');
  };

  burger.addEventListener('click', () => {
    mobileMenu.classList.contains('open') ? closeMenu() : openMenu();
  });

  // Close menu on link click
  mobileLinks.forEach(link => link.addEventListener('click', closeMenu));

  // Close on outside click
  document.addEventListener('click', (e) => {
    if (mobileMenu.classList.contains('open') &&
        !mobileMenu.contains(e.target) &&
        !burger.contains(e.target)) {
      closeMenu();
    }
  });


  /* ──────────────────────────────────────────
     2. SCROLL REVEAL — IntersectionObserver
  ────────────────────────────────────────── */
  const revealSections = document.querySelectorAll('[data-reveal]');

  const sectionObserver = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (!entry.isIntersecting) return;
      entry.target.classList.add('visible');
      sectionObserver.unobserve(entry.target);
    });
  }, { threshold: 0.1 });

  revealSections.forEach(section => sectionObserver.observe(section));


  /* ──────────────────────────────────────────
     3. PORTFOLIO FILTER
  ────────────────────────────────────────── */
  const filterBtns   = document.querySelectorAll('.filter-btn');
  const portfolioItems = document.querySelectorAll('.portfolio-item');

  filterBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const filter = btn.dataset.filter;

      // Update active button
      filterBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');

      // Show/hide items
      portfolioItems.forEach(item => {
        const match = filter === 'all' || item.dataset.category === filter;
        item.classList.toggle('hidden', !match);
      });
    });
  });


  /* ──────────────────────────────────────────
     4. LIGHTBOX
  ────────────────────────────────────────── */
  const lightbox      = document.getElementById('lightbox');
  const lightboxImg   = document.getElementById('lightboxImg');
  const lightboxCaption = document.getElementById('lightboxCaption');
  const lightboxBg    = document.getElementById('lightboxBg');
  const lightboxClose = document.getElementById('lightboxClose');
  const lightboxPrev  = document.getElementById('lightboxPrev');
  const lightboxNext  = document.getElementById('lightboxNext');

  let currentItems = [];
  let currentIndex = 0;

  const getVisibleItems = () =>
    [...portfolioItems].filter(item => !item.classList.contains('hidden'));

  const openLightbox = (item) => {
    currentItems = getVisibleItems();
    currentIndex = currentItems.indexOf(item);
    showSlide(currentIndex);
    lightbox.hidden = false;
    document.body.style.overflow = 'hidden';
    lightboxClose.focus();
  };

  const closeLightbox = () => {
    lightbox.hidden = true;
    document.body.style.overflow = '';
    lightboxImg.src = '';
  };

  const showSlide = (index) => {
    const item = currentItems[index];
    const img  = item.querySelector('img');
    lightboxImg.src = img.src;
    lightboxImg.alt = img.alt;
    lightboxCaption.textContent = item.querySelector('.portfolio-overlay span').textContent;

    // Show/hide nav arrows
    lightboxPrev.style.display = currentItems.length > 1 ? '' : 'none';
    lightboxNext.style.display = currentItems.length > 1 ? '' : 'none';
  };

  const prevSlide = () => {
    currentIndex = (currentIndex - 1 + currentItems.length) % currentItems.length;
    showSlide(currentIndex);
  };

  const nextSlide = () => {
    currentIndex = (currentIndex + 1) % currentItems.length;
    showSlide(currentIndex);
  };

  // Open on portfolio item click
  portfolioItems.forEach(item => {
    item.addEventListener('click', () => openLightbox(item));
  });

  lightboxClose.addEventListener('click', closeLightbox);
  lightboxBg.addEventListener('click', closeLightbox);
  lightboxPrev.addEventListener('click', (e) => { e.stopPropagation(); prevSlide(); });
  lightboxNext.addEventListener('click', (e) => { e.stopPropagation(); nextSlide(); });

  // Keyboard navigation
  document.addEventListener('keydown', (e) => {
    if (lightbox.hidden) return;
    if (e.key === 'Escape')      closeLightbox();
    if (e.key === 'ArrowLeft')   prevSlide();
    if (e.key === 'ArrowRight')  nextSlide();
  });

  // Touch/swipe support
  let touchStartX = 0;
  lightbox.addEventListener('touchstart', (e) => {
    touchStartX = e.changedTouches[0].clientX;
  }, { passive: true });

  lightbox.addEventListener('touchend', (e) => {
    const delta = e.changedTouches[0].clientX - touchStartX;
    if (Math.abs(delta) < 50) return;
    delta < 0 ? nextSlide() : prevSlide();
  }, { passive: true });


  /* ──────────────────────────────────────────
     5. PHONE INPUT MASK
  ────────────────────────────────────────── */
  const phoneInput = document.getElementById('fphone');

  if (phoneInput) {
    const applyMask = (value) => {
      const digits = value.replace(/\D/g, '').replace(/^7/, '').replace(/^8/, '');
      let result = '+7';
      if (digits.length > 0) result += ' (' + digits.substring(0, 3);
      if (digits.length >= 3) result += ') ' + digits.substring(3, 6);
      if (digits.length >= 6) result += '-' + digits.substring(6, 8);
      if (digits.length >= 8) result += '-' + digits.substring(8, 10);
      return result;
    };

    phoneInput.addEventListener('input', function () {
      const pos = this.selectionStart;
      this.value = applyMask(this.value);
      // Keep cursor near the end after masking
      const newPos = Math.min(pos, this.value.length);
      this.setSelectionRange(newPos, newPos);
    });

    phoneInput.addEventListener('focus', function () {
      if (!this.value) this.value = '+7 (';
    });

    phoneInput.addEventListener('blur', function () {
      if (this.value === '+7 (') this.value = '';
    });

    phoneInput.addEventListener('keydown', function (e) {
      if (e.key === 'Backspace' && this.value === '+7 (') {
        e.preventDefault();
        this.value = '';
      }
    });
  }


  /* ──────────────────────────────────────────
     6. LEAD FORM — validation + submit
  ────────────────────────────────────────── */
  const leadForm    = document.getElementById('leadForm');
  const nameInput   = document.getElementById('fname');
  const formSuccess = document.getElementById('formSuccess');

  if (leadForm) {
    const validateName = () => {
      const valid = nameInput.value.trim().length >= 2;
      nameInput.classList.toggle('error', !valid);
      return valid;
    };

    const validatePhone = () => {
      const digits = phoneInput.value.replace(/\D/g, '');
      const valid = digits.length === 11;
      phoneInput.classList.toggle('error', !valid);
      return valid;
    };

    nameInput.addEventListener('blur', validateName);
    phoneInput.addEventListener('blur', validatePhone);

    leadForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const nameOk  = validateName();
      const phoneOk = validatePhone();

      if (!nameOk || !phoneOk) {
        const firstError = leadForm.querySelector('.error');
        if (firstError) firstError.focus();
        return;
      }

      // Success (no backend — show success state)
      formSuccess.hidden = false;
      formSuccess.style.display = 'flex';
    });
  }


  /* ──────────────────────────────────────────
     7. SMOOTH ANCHOR SCROLL (extra offset fix)
  ────────────────────────────────────────── */
  document.querySelectorAll('a[href^="#"]').forEach(anchor => {
    anchor.addEventListener('click', (e) => {
      const id = anchor.getAttribute('href').slice(1);
      if (!id) return;
      const target = document.getElementById(id);
      if (!target) return;
      e.preventDefault();
      closeMenu(); // close mobile menu if open
      const top = target.getBoundingClientRect().top + window.scrollY - 70;
      window.scrollTo({ top, behavior: 'smooth' });
    });
  });

});
