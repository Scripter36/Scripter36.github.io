// Paper animations run once on entering view. Playback preference survives scrolling.
(() => {
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  for (const figure of document.querySelectorAll('[data-paper-figure]')) {
    const video = figure.querySelector('video');
    const toggle = figure.querySelector('[data-figure-toggle]');
    const replay = figure.querySelector('[data-figure-replay]');
    let userPaused = reducedMotion.matches;
    let visible = false;
    let pendingPlay = false;
    const update = () => {
      const playing = !video.paused && !video.ended;
      toggle.setAttribute('aria-label', playing ? 'Pause animation' : 'Play animation');
      toggle.title = playing ? 'Pause animation' : 'Play animation';
      toggle.querySelector('[data-play-icon]').hidden = playing;
      toggle.querySelector('[data-pause-icon]').hidden = !playing;
    };
    const sync = () => {
      if (!visible || document.hidden || userPaused || video.ended) {
        video.pause();
      } else if (video.paused && !pendingPlay) {
        pendingPlay = true;
        video.play().catch(error => {
          // Browsers may block autoplay; keep the explicit play control usable.
          if (error.name !== 'AbortError') userPaused = true;
        }).finally(() => {
          pendingPlay = false;
          // Reconcile a play request that finished after scrolling or pausing.
          sync();
        });
      }
      update();
    };
    toggle.addEventListener('click', () => {
      userPaused = !video.paused;
      if (video.ended) { video.currentTime = 0; userPaused = false; }
      sync();
    });
    replay.addEventListener('click', () => {
      video.currentTime = 0;
      userPaused = false;
      sync();
    });
    video.addEventListener('play', update);
    video.addEventListener('pause', update);
    video.addEventListener('ended', update);
    video.addEventListener('error', () => {
      // Leave native controls available for browser error handling and retry.
      video.controls = true;
      figure.removeAttribute('data-enhanced');
    });
    document.addEventListener('visibilitychange', sync);
    reducedMotion.addEventListener('change', event => {
      if (event.matches) { userPaused = true; sync(); }
    });
    if (!('IntersectionObserver' in window)) continue;
    const observer = new IntersectionObserver(entries => {
      visible = entries[0].isIntersecting && entries[0].intersectionRatio >= .35;
      sync();
    }, {threshold: [0, .35]});
    observer.observe(video);
    video.controls = false;
    figure.dataset.enhanced = '';
    update();
  }
})();
