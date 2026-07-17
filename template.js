/**
 * DocMaster — Shared template for navigation and footer.
 *
 * Usage: include <script src="template.js"></script> at the end of <body>.
 * The script reads data-page on <body> to highlight the active nav link,
 * and data-nav-cta to customise the CTA button (defaults to "Try System" → demo.html).
 *
 * It replaces:
 *   <nav id="main-nav"></nav>          → full navigation bar
 *   <footer id="main-footer"></footer> → full footer
 */

(function () {
    const page = document.body.getAttribute('data-page') || '';
    const ctaText = document.body.getAttribute('data-nav-cta-text') || 'Try System';
    const ctaHref = document.body.getAttribute('data-nav-cta-href') || 'demo.html';

    function activeClass(name) {
        return page === name ? ' class="active"' : '';
    }

    // ── Navigation ──
    const navEl = document.getElementById('main-nav');
    if (navEl) {
        navEl.outerHTML = `
        <nav>
            <div class="nav-inner">
                <a href="index.html" class="nav-brand">
                    <span class="nav-logo">DM</span>
                    DocMaster
                </a>
                <ul class="nav-links">
                    <li><a href="index.html"${activeClass('home')}>Home</a></li>
                    <li><a href="architecture.html"${activeClass('architecture')}>Architecture</a></li>
                    <li><a href="video.html"${activeClass('video')}>Video</a></li>
                    <li><a href="guide.html"${activeClass('guide')}>User Guide</a></li>
                    <li><a href="examples.html"${activeClass('examples')}>Examples</a></li>
                </ul>
                <a href="${ctaHref}" class="nav-cta">${ctaText}</a>
            </div>
        </nav>`;
    }

    // ── Footer ──
    const footerEl = document.getElementById('main-footer');
    if (footerEl) {
        footerEl.outerHTML = `
        <footer>
            <div class="footer-inner">
                <div class="footer-brand">DocMaster</div>
                <p class="footer-desc">A semantic filter operator for database systems using LLM-guided document tree traversal and hyperedge-based retrieval.</p>
                <hr class="footer-divider">
                <div class="footer-bottom">
                    <p><strong>Research Demo Paper</strong></p>
                    <p>&copy; 2026 All rights reserved.</p>
                </div>
            </div>
        </footer>`;
    }
})();
