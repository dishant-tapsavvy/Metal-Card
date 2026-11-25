/* ==========================================================================
   Fine Touch Metal Cards — Homepage Interactions
   ========================================================================== */

(function () {
  'use strict';

  const STORAGE_INQUIRIES = 'ftmc_inquiries_v1';

  function saveInquiry(entry) {
    try {
      const raw = localStorage.getItem(STORAGE_INQUIRIES);
      const list = raw ? JSON.parse(raw) : [];
      const next = Array.isArray(list) ? list : [];
      next.unshift(entry);
      localStorage.setItem(STORAGE_INQUIRIES, JSON.stringify(next));
    } catch {
      // Ignore storage errors in restricted environments
    }
  }

  function initHomepage() {
    const mobileToggle = document.getElementById('mobileToggle');
    const mainNav = document.getElementById('mainNav');

    if (mobileToggle && mainNav) {
      mobileToggle.addEventListener('click', () => {
        mainNav.classList.toggle('mobile-open');
      });

      mainNav.querySelectorAll('a').forEach((link) => {
        link.addEventListener('click', () => mainNav.classList.remove('mobile-open'));
      });
    }

    // Hero Showcase Carousel
    const slides = document.querySelectorAll('.hero-slide');
    const pills = document.querySelectorAll('.switch-pill');
    let activeSlide = 0;
    let slideTimer = null;

    function showSlide(index) {
      slides.forEach((s, i) => s.classList.toggle('active', i === index));
      pills.forEach((p, i) => p.classList.toggle('active', i === index));
      activeSlide = index;
    }

    if (slides.length > 0 && pills.length > 0) {
      pills.forEach((pill) => {
        pill.addEventListener('click', () => {
          const target = Number(pill.dataset.target);
          showSlide(target);
          resetSlideTimer();
        });
      });

      function resetSlideTimer() {
        if (slideTimer) clearInterval(slideTimer);
        slideTimer = setInterval(() => {
          showSlide((activeSlide + 1) % slides.length);
        }, 4500);
      }

      resetSlideTimer();
    }

    // Product Card "Request Quote" Pre-select
    const productSelect = document.getElementById('qProduct');
    const quoteSection = document.getElementById('quote');
    document.querySelectorAll('.quote-trigger').forEach((btn) => {
      btn.addEventListener('click', () => {
        const chosen = btn.dataset.product;
        if (productSelect && chosen) {
          productSelect.value = chosen;
        }
        if (quoteSection) {
          quoteSection.scrollIntoView({ behavior: 'smooth' });
        }
      });
    });

    // Showcase Gallery Filters
    const filterBtns = document.querySelectorAll('.filter-btn');
    const galleryItems = document.querySelectorAll('.gallery-item');

    filterBtns.forEach((btn) => {
      btn.addEventListener('click', () => {
        const filter = btn.dataset.filter;
        filterBtns.forEach((b) => b.classList.toggle('active', b === btn));
        galleryItems.forEach((item) => {
          const match = filter === 'all' || item.dataset.category === filter;
          item.style.display = match ? 'block' : 'none';
        });
      });
    });

    // Showcase Lightbox
    const lightbox = document.getElementById('lightbox');
    const lightboxImg = document.getElementById('lightboxImg');
    const lightboxTitle = document.getElementById('lightboxTitle');
    const lightboxClose = document.getElementById('lightboxClose');
    const lightboxQuoteBtn = document.getElementById('lightboxQuoteBtn');

    if (lightbox && lightboxImg && lightboxTitle) {
      galleryItems.forEach((item) => {
        item.addEventListener('click', () => {
          lightboxImg.src = item.dataset.img || '';
          lightboxImg.alt = item.dataset.title || '';
          lightboxTitle.textContent = item.dataset.title || '';
          lightbox.classList.add('open');
        });
      });

      function closeLightbox() {
        lightbox.classList.remove('open');
      }

      if (lightboxClose) lightboxClose.addEventListener('click', closeLightbox);
      if (lightboxQuoteBtn) lightboxQuoteBtn.addEventListener('click', closeLightbox);
      lightbox.addEventListener('click', (e) => {
        if (e.target === lightbox) closeLightbox();
      });
      document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && lightbox.classList.contains('open')) {
          closeLightbox();
        }
      });
    }

    // Quote Form Submission
    const quoteForm = document.getElementById('quoteForm');
    const quoteStatus = document.getElementById('quoteStatus');

    if (quoteForm && quoteStatus) {
      quoteForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const name = document.getElementById('qName').value.trim();
        const company = document.getElementById('qCompany').value.trim();
        const email = document.getElementById('qEmail').value.trim();
        const phone = document.getElementById('qPhone').value.trim();
        const product = document.getElementById('qProduct').value;
        const quantity = document.getElementById('qQuantity').value;
        const notes = document.getElementById('qNotes').value.trim();

        saveInquiry({
          id: 'inq-' + Date.now(),
          date: new Date().toISOString().slice(0, 10),
          name,
          company: company || 'Direct Client',
          email,
          phone,
          product,
          quantity,
          notes
        });

        quoteStatus.textContent = `Thank you, ${name}. Your inquiry for "${product}" (${quantity}) has been received by Fine Touch Metal Cards. Our team will contact you shortly.`;
        quoteStatus.className = 'form-status success';
        quoteForm.reset();
      });
    }
  }

  document.addEventListener('DOMContentLoaded', initHomepage);
})();
