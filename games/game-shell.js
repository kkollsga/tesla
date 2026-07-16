/* ============================================================================
   game-shell.js — shared info-modal wiring.

   Expects the markup convention every game already follows:
       #infoBtn        opens the modal
       #infoModal      the full-screen overlay (toggled via .active)
       #closeInfoBtn   closes it

   Provides four ways to dismiss, so behaviour is the same everywhere:
       - the close button
       - a click on the backdrop (previously missing in nonogram)
       - the Escape key      (previously present ONLY in nonogram)

   Every lookup is null-guarded: dropping this script onto a page that has
   none of these ids, or only some of them, is a no-op rather than a
   TypeError that would take the rest of the page's scripts down with it.
   ============================================================================ */
(function () {
    'use strict';

    function initInfoModal() {
        var modal = document.getElementById('infoModal');
        if (!modal) return;

        var openBtn = document.getElementById('infoBtn');
        var closeBtn = document.getElementById('closeInfoBtn');

        function open() {
            modal.classList.add('active');
        }

        function close() {
            modal.classList.remove('active');
        }

        if (openBtn) openBtn.addEventListener('click', open);
        if (closeBtn) closeBtn.addEventListener('click', close);

        /* Backdrop only — a click that bubbled up from the panel has a
           different target and must not close the modal. */
        modal.addEventListener('click', function (e) {
            if (e.target === modal) close();
        });

        document.addEventListener('keydown', function (e) {
            if (e.key === 'Escape' && modal.classList.contains('active')) {
                close();
            }
        });
    }

    /* Safe whether this is loaded in <head> or at the end of <body>. */
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initInfoModal);
    } else {
        initInfoModal();
    }
})();
