(() => {
  const root = document.getElementById('motion-demo');
  if (!root) return;
  const motions = JSON.parse(document.getElementById('motion-demo-data').textContent);
  const video = root.querySelector('video');
  const title = root.querySelector('[data-title]');
  const time = root.querySelector('[data-time]');
  const overlay = root.querySelector('[data-overlay]');
  const message = root.querySelector('[data-message]');
  const progress = root.querySelector('progress');
  const elapsedLabel = root.querySelector('[data-elapsed]');
  const status = root.querySelector('[data-status]');
  const pause = root.querySelector('[data-pause]');
  const choices = [...root.querySelectorAll('[data-motion]')];
  let index = 0;
  let generation = 0;
  let elapsed = 0;
  let phase = 'training';
  let paused = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  let inView = true;
  let previousTick = performance.now();
  let playing = false;

  const active = () => !paused && inView && !document.hidden;
  const duration = () => motions[index].activeSeconds * 1000;

  function updateControls() {
    pause.textContent = paused ? 'Resume' : 'Pause';
    pause.setAttribute('aria-label', paused ? 'Resume demo' : 'Pause demo');
    root.dataset.phase = phase;
  }

  function showError() {
    phase = 'error';
    paused = true;
    playing = false;
    overlay.hidden = false;
    message.textContent = 'This clip could not be loaded.';
    elapsedLabel.textContent = 'Try Replay or choose another motion.';
    status.textContent = 'Video unavailable';
    updateControls();
  }

  function playVideo() {
    if (!active() || phase !== 'video' || playing) return;
    const version = generation;
    playing = true;
    message.textContent = 'Loading video…';
    video.play().then(() => {
      if (version !== generation) return;
      if (!active()) { video.pause(); playing = false; return; }
      overlay.hidden = true;
      status.textContent = 'Playback';
    }).catch((error) => {
      if (version !== generation) return;
      playing = false;
      if (error.name === 'AbortError' && !active()) return;
      paused = true;
      message.textContent = 'Ready to play';
      elapsedLabel.textContent = 'Press Resume to watch.';
      status.textContent = 'Playback paused';
      updateControls();
    });
  }

  function selectMotion(next) {
    if (phase === 'error') paused = false;
    generation += 1;
    index = (next + motions.length) % motions.length;
    video.pause();
    playing = false;
    elapsed = 0;
    phase = 'training';
    previousTick = performance.now();
    const motion = motions[index];
    title.textContent = motion.name;
    time.textContent = `${motion.activeSeconds.toFixed(2)} s`;
    video.poster = motion.poster;
    video.src = motion.video;
    video.load();
    progress.max = motion.activeSeconds;
    progress.value = 0;
    overlay.hidden = false;
    message.textContent = paused ? 'Training paused' : 'Training…';
    elapsedLabel.textContent = `0.00 / ${motion.activeSeconds.toFixed(2)} s`;
    status.textContent = `${motion.name}: training time replay`;
    choices.forEach((button, i) => button.setAttribute('aria-pressed', String(i === index)));
    updateControls();
  }

  function setPaused(value) {
    paused = value;
    previousTick = performance.now();
    if (paused) {
      video.pause();
      playing = false;
      if (phase === 'training') message.textContent = 'Training paused';
      status.textContent = phase === 'training' ? 'Training time replay paused' : 'Playback paused';
    } else if (phase === 'training') {
      message.textContent = 'Training…';
      status.textContent = `${motions[index].name}: training time replay`;
    } else if (phase === 'error') {
      selectMotion(index);
    } else {
      playVideo();
    }
    updateControls();
  }

  function tick(now) {
    const delta = now - previousTick;
    previousTick = now;
    if (active() && phase === 'training') {
      elapsed = Math.min(duration(), elapsed + delta);
      progress.value = elapsed / 1000;
      elapsedLabel.textContent = `${(elapsed / 1000).toFixed(2)} / ${motions[index].activeSeconds.toFixed(2)} s`;
      if (elapsed >= duration()) {
        phase = 'video';
        updateControls();
        playVideo();
      }
    }
    requestAnimationFrame(tick);
  }

  root.querySelector('[data-prev]').addEventListener('click', () => selectMotion(index - 1));
  root.querySelector('[data-next]').addEventListener('click', () => selectMotion(index + 1));
  root.querySelector('[data-replay]').addEventListener('click', () => selectMotion(index));
  pause.addEventListener('click', () => setPaused(!paused));
  choices.forEach((button, i) => button.addEventListener('click', () => selectMotion(i)));
  root.addEventListener('keydown', (event) => {
    if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
      event.preventDefault();
      selectMotion(index + (event.key === 'ArrowRight' ? 1 : -1));
    }
  });
  video.addEventListener('ended', () => { if (active()) selectMotion(index + 1); });
  video.addEventListener('error', showError);
  function syncVisibility() {
    previousTick = performance.now();
    if (!active()) { video.pause(); playing = false; }
    else playVideo();
  }
  document.addEventListener('visibilitychange', syncVisibility);
  if ('IntersectionObserver' in window) {
    new IntersectionObserver(([entry]) => {
      inView = entry.isIntersecting;
      syncVisibility();
    }, {threshold: 0.15}).observe(root.querySelector('[data-stage]'));
  }
  let touch = null;
  const stage = root.querySelector('[data-stage]');
  stage.addEventListener('touchstart', (event) => {
    const point = event.changedTouches[0];
    touch = {x: point.clientX, y: point.clientY};
  }, {passive: true});
  stage.addEventListener('touchend', (event) => {
    if (!touch) return;
    const point = event.changedTouches[0];
    const dx = point.clientX - touch.x;
    const dy = point.clientY - touch.y;
    if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.5) selectMotion(index + (dx < 0 ? 1 : -1));
    touch = null;
  }, {passive: true});
  video.controls = false;
  root.dataset.enhanced = '';
  selectMotion(0);
  requestAnimationFrame(tick);
})();
