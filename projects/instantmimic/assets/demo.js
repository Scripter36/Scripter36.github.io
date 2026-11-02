(() => {
  const root = document.getElementById('motion-demo');
  if (!root) return;
  const motions = JSON.parse(document.getElementById('motion-demo-data').textContent);
  const PLAYBACK_SECONDS = 5;
  const viewport = root.querySelector('[data-viewport]');
  const rail = root.querySelector('[data-rail]');
  const template = rail.querySelector('[data-card]');
  const status = root.querySelector('[data-status]');
  const pause = root.querySelector('[data-pause]');
  const choices = [...root.querySelectorAll('[data-motion]')];
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const cards = motions.map((motion, i) => {
    const element = i === 0 ? template : template.cloneNode(true);
    element.dataset.motionId = motion.id;
    element.setAttribute('aria-label', motion.name);
    element.querySelector('[data-title]').textContent = motion.name;
    element.querySelector('[data-time]').textContent = `${motion.activeSeconds.toFixed(2)} s`;
    const video = element.querySelector('video');
    video.controls = false;
    video.preload = 'metadata';
    video.poster = motion.poster;
    video.querySelector('source').src = motion.video;
    video.setAttribute('aria-label', `${motion.name} playback`);
    const card = {
      element, video,
      overlay: element.querySelector('[data-overlay]'),
      message: element.querySelector('[data-message]'),
      progress: element.querySelector('[data-training-progress]'),
      elapsed: element.querySelector('[data-elapsed]'),
      cardProgress: element.querySelector('[data-card-progress]')
    };
    card.progress.max = motion.activeSeconds;
    card.progress.value = 0;
    card.cardProgress.max = motion.activeSeconds + PLAYBACK_SECONDS;
    card.cardProgress.value = 0;
    card.cardProgress.setAttribute('aria-label', `${motion.name} card progress`);
    video.addEventListener('error', () => { if (i === index) showError(); });
    video.addEventListener('ended', () => { if (i === index && active()) selectMotion(index + 1, 1); });
    return card;
  });
  let index = 0;
  let generation = 0;
  let elapsed = 0;
  let phase = 'training';
  let paused = reducedMotion;
  let inView = true;
  let previousTick = performance.now();
  let playing = false;
  let animation = null;
  const current = () => cards[index];
  const active = () => !paused && inView && !document.hidden && !animation;
  const duration = () => motions[index].activeSeconds * 1000;
  const wrap = value => (value + motions.length) % motions.length;

  function renderOrder() {
    rail.replaceChildren(cards[wrap(index - 1)].element, current().element, cards[wrap(index + 1)].element);
    cards.forEach((card, i) => {
      card.element.inert = i !== index;
      card.element.setAttribute('aria-hidden', String(i !== index));
    });
  }

  function settleTransition() {
    if (animation) animation.cancel();
    animation = null;
    renderOrder();
    root.dataset.transitioning = 'false';
    previousTick = performance.now();
  }

  function updateControls() {
    pause.querySelector('[data-pause-icon]').hidden = paused;
    pause.querySelector('[data-play-icon]').hidden = !paused;
    pause.setAttribute('aria-label', paused ? 'Resume demo' : 'Pause demo');
    pause.title = paused ? 'Resume' : 'Pause';
    root.dataset.phase = phase;
  }

  function updateCardProgress() {
    const card = current();
    const value = elapsed / 1000 + (phase === 'video' ? Math.min(card.video.currentTime, PLAYBACK_SECONDS) : 0);
    card.cardProgress.value = value;
  }

  function showError() {
    phase = 'error';
    paused = true;
    playing = false;
    const card = current();
    card.overlay.hidden = false;
    card.message.textContent = 'This clip could not be loaded.';
    card.elapsed.textContent = 'Try Replay or choose another motion.';
    status.textContent = 'Video unavailable';
    updateControls();
  }

  function playVideo() {
    if (!active() || phase !== 'video' || playing) return;
    const version = generation;
    const card = current();
    playing = true;
    card.message.textContent = 'Loading video…';
    card.video.play().then(() => {
      if (version !== generation) return;
      if (!active()) { card.video.pause(); playing = false; return; }
      card.overlay.hidden = true;
      status.textContent = 'Playback';
    }).catch((error) => {
      if (version !== generation) return;
      playing = false;
      if (error.name === 'AbortError' && !active()) return;
      paused = true;
      card.message.textContent = 'Ready to play';
      card.elapsed.textContent = 'Press Resume to watch.';
      status.textContent = 'Playback paused';
      updateControls();
    });
  }

  function selectMotion(next, requestedDirection = 0) {
    const oldIndex = index;
    if (phase === 'error') paused = false;
    generation += 1;
    settleTransition();
    current().video.pause();
    index = wrap(next);
    playing = false;
    elapsed = 0;
    phase = 'training';
    const card = current();
    card.video.pause();
    card.video.currentTime = 0;
    if (card.video.readyState === 0 || card.video.error) card.video.load();
    card.progress.value = 0;
    card.overlay.hidden = false;
    card.message.textContent = paused ? 'Training paused' : 'Training…';
    card.elapsed.textContent = `0.00 / ${motions[index].activeSeconds.toFixed(2)} s`;
    status.textContent = `${motions[index].name}: training time replay`;
    choices.forEach((button, i) => button.setAttribute('aria-pressed', String(i === index)));
    updateCardProgress();
    updateControls();
    if (oldIndex === index || reducedMotion) { settleTransition(); return; }
    const direction = requestedDirection || (wrap(index - oldIndex) <= motions.length / 2 ? 1 : -1);
    root.dataset.transitioning = 'true';
    const moving = rail.animate([
      {transform: 'translateX(-100%)'},
      {transform: `translateX(${direction > 0 ? '-200%' : '0%'})`}
    ], {duration: 360, easing: 'cubic-bezier(.22,.61,.36,1)', fill: 'forwards'});
    animation = moving;
    moving.addEventListener('finish', () => {
      if (animation !== moving) return;
      settleTransition();
    }, {once: true});
  }

  function setPaused(value) {
    paused = value;
    previousTick = performance.now();
    if (paused) {
      current().video.pause();
      playing = false;
      if (phase === 'training') current().message.textContent = 'Training paused';
      status.textContent = phase === 'training' ? 'Training time replay paused' : 'Playback paused';
    } else if (phase === 'training') {
      current().message.textContent = 'Training…';
      status.textContent = `${motions[index].name}: training time replay`;
    } else if (phase === 'error') selectMotion(index);
    else playVideo();
    updateControls();
  }

  function tick(now) {
    const delta = now - previousTick;
    previousTick = now;
    if (active()) {
      if (phase === 'training') {
        elapsed = Math.min(duration(), elapsed + delta);
        current().progress.value = elapsed / 1000;
        current().elapsed.textContent = `${(elapsed / 1000).toFixed(2)} / ${motions[index].activeSeconds.toFixed(2)} s`;
        if (elapsed >= duration()) { phase = 'video'; updateControls(); playVideo(); }
      }
      updateCardProgress();
      if (phase === 'video' && current().video.currentTime >= PLAYBACK_SECONDS) selectMotion(index + 1, 1);
    }
    requestAnimationFrame(tick);
  }

  root.querySelector('[data-prev]').addEventListener('click', () => selectMotion(index - 1, -1));
  root.querySelector('[data-next]').addEventListener('click', () => selectMotion(index + 1, 1));
  root.querySelector('[data-replay]').addEventListener('click', () => selectMotion(index));
  pause.addEventListener('click', () => setPaused(!paused));
  choices.forEach((button, i) => button.addEventListener('click', () => selectMotion(i)));
  root.addEventListener('keydown', (event) => {
    if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
      event.preventDefault();
      const direction = event.key === 'ArrowRight' ? 1 : -1;
      selectMotion(index + direction, direction);
    }
  });
  function syncVisibility() {
    previousTick = performance.now();
    if (!active()) { current().video.pause(); playing = false; }
    else playVideo();
  }
  document.addEventListener('visibilitychange', syncVisibility);
  if ('IntersectionObserver' in window) {
    new IntersectionObserver(([entry]) => { inView = entry.isIntersecting; syncVisibility(); }, {threshold: 0.15}).observe(viewport);
  }
  let touch = null;
  viewport.addEventListener('touchstart', (event) => {
    const point = event.changedTouches[0];
    touch = {x: point.clientX, y: point.clientY};
  }, {passive: true});
  viewport.addEventListener('touchend', (event) => {
    if (!touch) return;
    const point = event.changedTouches[0];
    const dx = point.clientX - touch.x;
    const dy = point.clientY - touch.y;
    if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.5) selectMotion(index + (dx < 0 ? 1 : -1), dx < 0 ? 1 : -1);
    touch = null;
  }, {passive: true});
  root.dataset.enhanced = '';
  selectMotion(0);
  requestAnimationFrame(tick);
})();
