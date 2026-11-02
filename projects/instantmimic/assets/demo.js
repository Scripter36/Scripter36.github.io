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
  const headline = root.querySelector('[data-headline]');
  function setHeadlineWidth(element, item, animate = false, fromWidth = 0) {
    element.style.transition = 'none';
    if (animate) element.style.width = `${fromWidth}px`;
    else element.style.removeProperty('width');
    // Commit the starting width; idle text uses its native intrinsic width.
    element.getBoundingClientRect();
    element.style.removeProperty('transition');
    if (animate) element.style.width = `${item.getBoundingClientRect().width}px`;
  }

  const headlineFields = [
    {element: root.querySelector('[data-headline-motion]'), values: motions.map(motion => motion.action)},
    {element: root.querySelector('[data-headline-time]'), values: motions.map(motion => motion.activeSeconds.toFixed(2))}
  ].map(field => {
    const items = field.values.map((value, i) => {
      const item = document.createElement('span');
      item.textContent = value;
      item.style.visibility = i === 0 ? 'visible' : 'hidden';
      item.toggleAttribute('data-current', i === 0);
      return item;
    });
    field.element.replaceChildren(...items);
    setHeadlineWidth(field.element, items[0]);
    return {...field, items, animations: []};
  });

  function updateHeadline(next, previous) {
    headline.setAttribute('aria-label', `InstantMimic learns to ${motions[next].action} in ${motions[next].activeSeconds.toFixed(2)} seconds.`);
    headlineFields.forEach(field => {
      field.animations.forEach(animation => animation.cancel());
      field.animations = [];
      const fromWidth = field.element.getBoundingClientRect().width;
      field.items.forEach(item => { item.style.visibility = 'hidden'; item.removeAttribute('data-current'); });
      const incoming = field.items[next];
      incoming.setAttribute('data-current', '');
      setHeadlineWidth(field.element, incoming, next !== previous && !reducedMotion, fromWidth);
      incoming.style.visibility = 'visible';
      if (next === previous || reducedMotion) return;
      const outgoing = field.items[previous];
      outgoing.style.visibility = 'visible';
      const timing = {duration: 360, easing: 'cubic-bezier(.22,.61,.36,1)', fill: 'both'};
      field.animations = [
        outgoing.animate([{transform: 'translateY(0)', opacity: 1}, {transform: 'translateY(-100%)', opacity: 0}], timing),
        incoming.animate([{transform: 'translateY(100%)', opacity: 0}, {transform: 'translateY(0)', opacity: 1}], timing)
      ];
      const incomingAnimation = field.animations[1];
      incomingAnimation.addEventListener('finish', () => {
        if (field.animations[1] !== incomingAnimation) return;
        outgoing.style.visibility = 'hidden';
        field.animations.forEach(animation => animation.cancel());
        field.animations = [];
        setHeadlineWidth(field.element, incoming);
      }, {once: true});
    });
  }
  const cards = motions.map((motion, i) => {
    const element = i === 0 ? template : template.cloneNode(true);
    element.dataset.motionId = motion.id;
    element.setAttribute('aria-label', motion.name);
    const video = element.querySelector('video');
    video.controls = false;
    video.preload = 'auto';
    video.muted = true;
    video.poster = motion.poster;
    video.querySelector('source').src = motion.video;
    video.setAttribute('aria-label', `${motion.name} playback`);
    const card = {
      element, video,
      overlay: element.querySelector('[data-overlay]'),
      message: element.querySelector('[data-message]'),
      progress: element.querySelector('[data-training-progress]'),
      elapsed: element.querySelector('[data-elapsed]'),
      cardProgress: element.querySelector('[data-card-progress]'),
      seek: element.querySelector('[data-seek]'),
      pendingSeek: null
    };
    card.progress.max = motion.activeSeconds;
    card.progress.value = 0;
    card.cardProgress.max = motion.activeSeconds + PLAYBACK_SECONDS;
    card.cardProgress.value = 0;
    card.seek.max = card.cardProgress.max;
    card.seek.value = 0;
    card.seek.setAttribute('aria-label', `${motion.name} playback position`);
    video.addEventListener('error', () => { if (i === index) showError(); });
    for (const event of ['loadedmetadata', 'progress', 'canplay', 'seeked']) video.addEventListener(event, () => {
      flushSeek(card);
      if (i === index && phase === 'video') playVideo();
    });
    video.addEventListener('waiting', () => { if (i === index) scheduleLoading(); });
    video.addEventListener('playing', () => {
      if (i !== index || phase !== 'video') return;
      clearLoading();
      card.overlay.hidden = true;
      status.textContent = 'Playback';
    });
    card.seek.addEventListener('pointerdown', (event) => {
      if (i !== index || event.button !== 0) return;
      scrubbing = true;
      card.seek.setPointerCapture(event.pointerId);
      stopVideo();
    });
    card.seek.addEventListener('input', () => { if (i === index) seekTo(Number(card.seek.value)); });
    for (const event of ['pointerup', 'pointercancel', 'lostpointercapture', 'change']) {
      card.seek.addEventListener(event, () => { if (i === index) finishScrubbing(); });
    }
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
  let scrubbing = false;
  let loadingTimer = null;
  const current = () => cards[index];
  const active = () => !paused && !scrubbing && inView && !document.hidden && !animation;
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
    const videoTime = card.pendingSeek ?? card.video.currentTime;
    const value = elapsed / 1000 + (phase === 'video' ? Math.min(videoTime, PLAYBACK_SECONDS) : 0);
    card.cardProgress.value = value;
    card.seek.value = value;
    card.seek.parentElement.style.setProperty('--position', `${value / card.cardProgress.max * 100}%`);
    const percentage = phase === 'video' ? videoTime / PLAYBACK_SECONDS : elapsed / duration();
    card.seek.setAttribute('aria-valuetext', `${phase === 'video' ? 'Video' : 'Training replay'}, ${Math.round(percentage * 100)}%`);
  }

  function clearLoading() {
    clearTimeout(loadingTimer);
    loadingTimer = null;
  }

  function scheduleLoading() {
    if (!active() || phase !== 'video' || loadingTimer !== null) return;
    const version = generation;
    loadingTimer = setTimeout(() => {
      loadingTimer = null;
      if (version !== generation || !active() || phase !== 'video') return;
      if (current().video.readyState >= HTMLMediaElement.HAVE_FUTURE_DATA) return;
      current().overlay.hidden = false;
      current().message.textContent = 'Loading video…';
      current().elapsed.textContent = '';
    }, 250);
  }

  function stopVideo() {
    generation += 1;
    clearLoading();
    current().video.pause();
    playing = false;
  }

  function flushSeek(card) {
    if (card.pendingSeek === null || card.video.seeking) return;
    const ranges = card.video.seekable;
    const time = card.pendingSeek;
    for (let i = 0; i < ranges.length; i += 1) {
      if (time < ranges.start(i) || time > ranges.end(i)) continue;
      card.pendingSeek = null;
      if (Math.abs(card.video.currentTime - time) > 0.001) card.video.currentTime = time;
      return;
    }
  }

  function seekVideo(card, time) {
    card.pendingSeek = time;
    flushSeek(card);
  }

  function seekTo(position) {
    stopVideo();
    const card = current();
    const value = Math.max(0, Math.min(card.cardProgress.max, position));
    elapsed = Math.min(value * 1000, duration());
    phase = value < motions[index].activeSeconds ? 'training' : 'video';
    seekVideo(card, Math.max(0, value - motions[index].activeSeconds));
    card.progress.value = elapsed / 1000;
    card.overlay.hidden = phase === 'video';
    card.message.textContent = paused || scrubbing ? 'Training paused' : 'Training…';
    card.elapsed.textContent = `${(elapsed / 1000).toFixed(2)} / ${motions[index].activeSeconds.toFixed(2)} s`;
    previousTick = performance.now();
    status.textContent = phase === 'training' ? 'Training time replay' : 'Playback';
    updateCardProgress();
    updateControls();
    playVideo();
  }

  function finishScrubbing() {
    if (!scrubbing) return;
    scrubbing = false;
    previousTick = performance.now();
    if (phase === 'training') current().message.textContent = paused ? 'Training paused' : 'Training…';
    playVideo();
  }

  function showError() {
    stopVideo();
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
    card.overlay.hidden = true;
    if (card.pendingSeek !== null || card.video.seeking) {
      scheduleLoading();
      return;
    }
    playing = true;
    scheduleLoading();
    card.video.play().then(() => {
      if (version !== generation) return;
      clearLoading();
      if (!active()) { card.video.pause(); playing = false; return; }
      card.overlay.hidden = true;
      status.textContent = 'Playback';
    }).catch((error) => {
      if (version !== generation) return;
      clearLoading();
      playing = false;
      if (error.name === 'AbortError' && !active()) return;
      paused = true;
      card.overlay.hidden = false;
      card.message.textContent = 'Ready to play';
      card.elapsed.textContent = 'Press Resume to watch.';
      status.textContent = 'Playback paused';
      updateControls();
    });
  }

  function selectMotion(next, requestedDirection = 0) {
    const oldIndex = index;
    if (phase === 'error') paused = false;
    stopVideo();
    scrubbing = false;
    settleTransition();
    index = wrap(next);
    updateHeadline(index, oldIndex);
    playing = false;
    elapsed = 0;
    phase = 'training';
    const card = current();
    card.video.pause();
    seekVideo(card, 0);
    if (card.video.error) card.video.load();
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
      stopVideo();
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
    if (event.target.matches('input')) return;
    if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
      event.preventDefault();
      const direction = event.key === 'ArrowRight' ? 1 : -1;
      selectMotion(index + direction, direction);
    }
  });
  function syncVisibility() {
    previousTick = performance.now();
    if (!active()) stopVideo();
    else playVideo();
  }
  document.addEventListener('visibilitychange', syncVisibility);
  if ('IntersectionObserver' in window) {
    new IntersectionObserver(([entry]) => { inView = entry.isIntersecting; syncVisibility(); }, {threshold: 0.15}).observe(viewport);
  }
  let touch = null;
  viewport.addEventListener('touchstart', (event) => {
    if (event.target.closest('[data-seek]')) { touch = null; return; }
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
  cards.forEach(card => card.video.load());
  requestAnimationFrame(tick);
})();
