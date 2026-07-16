/* ============================================================================
   game-shell.js — shared info-modal wiring + the palette mechanism.

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

/* ============================================================================
   GameTheme — palette rotation + victory shift (the hybrid, C6).

   The mechanism is shared; the POLICY is per-game (dev-docs/designs/theming.md
   owns the table). The split every caller must respect:

     - The BASE palette rotates for variation. It advances on explicit
       new-game (never on page load — a refresh must not flicker), is
       persisted under one suite-wide key so the rotation is coherent across
       all 9 games, and is what a reload restores.
     - A VICTORY shift is semantic and transient: it repaints the page in the
       winner's hue but is never persisted, so a reload lands on the base.
       Games whose players don't map to a hue skip it and use .victory-glow
       (game-theme.css) on the winner's panel instead.

   A game that calls none of this keeps its hardcoded data-theme forever —
   opting out stays the default, exactly like the tokens themselves.

     GameTheme.nextPalette()      rotate base, persist, apply; returns it.
                                  Also sweeps any leftover .victory-glow, so
                                  new-game handlers don't each have to.
     GameTheme.setVictoryTheme(h) apply hue for the endgame screen. Not saved.
     GameTheme.base()             the persisted base (falls back to the page's
                                  hardcoded data-theme, then green).

   The restore runs at parse time — this script sits at the end of <body> in
   all 9 games, so the swap lands before first paint and ahead of any game
   script's own init. First-ever visit has no saved base: the page's authored
   data-theme survives untouched and nothing is written until the player
   actually starts a new game.
   ============================================================================ */
window.GameTheme = (function () {
    'use strict';

    var PALETTES = ['green', 'red', 'blue', 'orange'];
    var KEY = 'gameBasePalette';

    function isPalette(p) {
        return PALETTES.indexOf(p) !== -1;
    }

    function apply(p) {
        document.body.dataset.theme = p;
    }

    /* localStorage can throw (privacy mode, quota) — a theme is never worth
       taking the page down for, so both accessors swallow. */
    function savedBase() {
        try {
            var s = localStorage.getItem(KEY);
            return isPalette(s) ? s : null;
        } catch (e) {
            return null;
        }
    }

    function base() {
        if (savedBase()) return savedBase();
        var authored = document.body && document.body.dataset.theme;
        return isPalette(authored) ? authored : 'green';
    }

    function nextPalette() {
        var next = PALETTES[(PALETTES.indexOf(base()) + 1) % PALETTES.length];
        try {
            localStorage.setItem(KEY, next);
        } catch (e) { /* rotation still applies this session */ }
        apply(next);
        var glowing = document.querySelectorAll('.victory-glow');
        for (var i = 0; i < glowing.length; i++) {
            glowing[i].classList.remove('victory-glow');
        }
        return next;
    }

    function setVictoryTheme(hue) {
        if (isPalette(hue)) apply(hue);
    }

    function restore() {
        var s = savedBase();
        if (s) apply(s);
    }

    if (document.body) {
        restore();
    } else {
        /* Head placement fallback only — no game loads it there today. */
        document.addEventListener('DOMContentLoaded', restore);
    }

    return {
        nextPalette: nextPalette,
        setVictoryTheme: setVictoryTheme,
        base: base,
        PALETTES: PALETTES.slice()
    };
})();
