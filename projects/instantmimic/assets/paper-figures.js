// Paper-derived SVG figures. Animation time advances only while visible and playing.
(() => {
  const dataNode = document.getElementById('paper-figure-data');
  if (!dataNode) return;
  const data = JSON.parse(dataNode.textContent);
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  const ns = 'http://www.w3.org/2000/svg';
  const clamp = n => Math.max(0, Math.min(1, n));
  const mix = (a, b, t) => a + (b - a) * t;
  const ease = t => 1 - (1 - clamp(t)) ** 3;
  let nextId = 0;
  function node(parent, tag, attrs = {}, text) {
    const child = document.createElementNS(ns, tag);
    for (const [key, value] of Object.entries(attrs)) child.setAttribute(key, value);
    if (text !== undefined) child.textContent = text;
    parent.append(child);
    return child;
  }
  function set(element, attrs) {
    for (const [key, value] of Object.entries(attrs)) element.setAttribute(key, value);
  }
  function text(parent, x, y, value, attrs = {}) {
    return node(parent, 'text', {x, y, ...attrs}, value);
  }
  function axes(svg, box, xs, ys, xLabel, yLabel, x, y) {
    for (const value of ys) {
      node(svg, 'line', {x1: box.left, x2: box.right, y1: y(value), y2: y(value), class: 'plot-grid'});
      text(svg, box.left - 10, y(value) + 4, value, {'text-anchor': 'end'});
    }
    for (const value of xs) {
      node(svg, 'line', {x1: x(value), x2: x(value), y1: box.bottom, y2: box.bottom + 5, class: 'plot-axis'});
      text(svg, x(value), box.bottom + 22, value, {'text-anchor': 'middle'});
    }
    node(svg, 'path', {d: `M ${box.left} ${box.top} V ${box.bottom} H ${box.right}`, class: 'plot-axis', fill: 'none'});
    text(svg, (box.left + box.right) / 2, box.bottom + 48, xLabel, {'text-anchor': 'middle', class: 'plot-label'});
    const cy = (box.top + box.bottom) / 2;
    text(svg, 17, cy, yLabel, {transform: `rotate(-90 17 ${cy})`, 'text-anchor': 'middle', class: 'plot-label'});
  }
  function prepare(svg, width, height) {
    svg.replaceChildren();
    set(svg, {viewBox: `0 0 ${width} ${height}`, width, height});
    svg.style.aspectRatio = `${width} / ${height}`;
  }
  function profileGraph(svg, width) {
    prepare(svg, width, 408);
    const box = {left: 53, right: width - 82, top: 224, bottom: 332};
    const span = box.right - box.left;
    const x = ms => box.left + span * ms / 15;
    const y = value => box.bottom - (box.bottom - box.top) * value / 100;
    text(svg, box.left, 24, 'Training-step phases', {class: 'plot-heading'});
    const phases = data.profile.phases.map(phase => ({
      ...phase,
      rect: node(svg, 'rect', {y: 45, height: 64, fill: phase.color}),
      label: text(svg, 0, 83, phase.name, {'text-anchor': 'middle', class: 'phase-label'}),
      outline: node(svg, 'rect', {y: 46, height: 62, fill: 'none', stroke: '#424b50', 'stroke-width': 1.5}),
    }));
    const duration = text(svg, 0, 82, '', {class: 'plot-value'});
    const diagnosis = text(svg, width / 2, 140, 'Non-physics work takes 67% of the step.', {'text-anchor': 'middle', class: 'plot-note'});
    const finding = text(svg, width / 2, 160, 'Low GPU utilization outside physics.', {'text-anchor': 'middle', class: 'plot-note'});
    text(svg, box.left, 193, 'GPU utilization', {class: 'plot-heading'});
    const series = data.profile.series;
    series.forEach((item, i) => {
      const lx = box.left + i * 83;
      node(svg, 'rect', {x: lx, y: 204, width: 10, height: 8, fill: item.color});
      text(svg, lx + 15, 212, item.name, {class: 'plot-legend'});
    });
    axes(svg, box, [0, 3, 6, 9, 12, 15], [0, 50, 100], 'Time (ms)', 'GPU util. (%)', x, y);
    const clipId = `profile-duration-${++nextId}`;
    const clip = node(node(node(svg, 'defs'), 'clipPath', {id: clipId}), 'rect', {x: box.left, y: box.top, height: box.bottom - box.top});
    const bars = node(svg, 'g', {'clip-path': `url(#${clipId})`});
    const baselineTotals = phases.reduce((sum, p) => sum + p.baseline, 0);
    const optimizedTotals = phases.reduce((sum, p) => sum + p.optimized, 0);
    const optimizedBarCount = Math.ceil(100 * data.profile.optimizedMs / 15);
    const samples = series.map(item => item.baseline.map((value, i) => {
      const oi = Math.round(i / (optimizedBarCount - 1) * (item.optimized.length - 1));
      return {rect: node(bars, 'rect', {x: box.left + i * span / 100 + .3, width: Math.max(.6, span / 100 - .6), fill: item.color, opacity: .9}),
        baseline: value, optimized: i < optimizedBarCount ? item.optimized[oi] : 0};
    }));
    return (progress, highlight) => {
      const step = mix(data.profile.baselineMs, data.profile.optimizedMs, progress);
      const end = x(step);
      let cursor = box.left;
      for (const phase of phases) {
        const w = mix(span * data.profile.baselineMs / 15 * phase.baseline / baselineTotals,
          span * data.profile.optimizedMs / 15 * phase.optimized / optimizedTotals, progress);
        set(phase.rect, {x: cursor, width: Math.max(0, w - 1), opacity: phase.name === 'Physics' ? 1 - .45 * highlight : 1});
        set(phase.label, {x: cursor + w / 2, opacity: w > phase.name.length * 6.5 + 6 ? 1 : 0});
        set(phase.outline, {x: cursor, width: Math.max(0, w - 1), opacity: phase.name === 'Physics' ? 0 : highlight});
        cursor += w;
      }
      set(duration, {x: end + 7});
      duration.textContent = `${step.toFixed(3)} ms`;
      diagnosis.setAttribute('opacity', highlight);
      finding.setAttribute('opacity', highlight);
      clip.setAttribute('width', end - box.left);
      for (const group of samples) for (const sample of group) {
        const value = Math.min(100, mix(sample.baseline, sample.optimized, progress) * 100 / 73);
        set(sample.rect, {y: y(value), height: box.bottom - y(value)});
      }
    };
  }
  function searchGraph(svg, width) {
    prepare(svg, width, 322);
    const box = {left: 57, right: width - 20, top: 18, bottom: 258};
    const x = cycle => box.left + (box.right - box.left) * cycle / 80;
    const y = seconds => box.bottom - (box.bottom - box.top) * seconds / 20;
    axes(svg, box, width > 420 ? [0, 20, 40, 60, 80] : [0, 40, 80], [0, 5, 10, 15, 20], 'Optimization cycle', 'Time to 90% success (s)', x, y);
    const path = node(svg, 'path', {fill: 'none', stroke: '#2b3338', 'stroke-width': 2.5, 'stroke-linejoin': 'round'});
    const dot = node(svg, 'circle', {r: 4.5, fill: '#2f5d7c', stroke: '#fff', 'stroke-width': 1.5});
    return progress => {
      const cycle = Math.min(80, Math.floor(progress * 80 + 1e-6));
      const points = data.search.bestPoints.filter(p => p[0] <= cycle);
      const best = points.at(-1)[1];
      let d = `M ${x(0)} ${y(points[0][1])}`;
      for (const [c, seconds] of points.slice(1)) d += ` H ${x(c)} V ${y(seconds)}`;
      d += ` H ${x(progress * 80)}`;
      path.setAttribute('d', d);
      set(dot, {cx: x(progress * 80), cy: y(best)});
      return {cycle, best};
    };
  }
  function learningGraph(svg, width) {
    prepare(svg, width, 322);
    const box = {left: 53, right: width - 15, top: 18, bottom: 258};
    const x = seconds => box.left + (box.right - box.left) * seconds / 25;
    const y = steps => box.bottom - (box.bottom - box.top) * steps / 315;
    axes(svg, box, [0, 10, 20], [0, 100, 200, 300], 'Active training time (s)', 'Episode length', x, y);
    const clipId = `learning-reveal-${++nextId}`;
    const clip = node(node(node(svg, 'defs'), 'clipPath', {id: clipId}), 'rect', {x: box.left, y: box.top, width: 0, height: box.bottom - box.top});
    const draw = (parent, series) => {
      const path = points => points.map(([a, b], i) => `${i ? 'L' : 'M'} ${x(a)} ${y(b)}`).join(' ');
      node(parent, 'path', {d: path(series.band) + ' Z', fill: series.color, opacity: .16});
      node(parent, 'path', {d: path(series.line), fill: 'none', stroke: series.color, 'stroke-width': 2.5, 'stroke-linejoin': 'round'});
    };
    const boundsId = `learning-bounds-${++nextId}`;
    node(node(node(svg, 'defs'), 'clipPath', {id: boundsId}), 'rect', {x: box.left, y: box.top, width: box.right - box.left, height: box.bottom - box.top});
    draw(node(svg, 'g', {'clip-path': `url(#${boundsId})`}), data.learning.baseline);
    const optimized = node(svg, 'g', {'data-optimized-curve': '', 'clip-path': `url(#${clipId})`});
    draw(optimized, data.learning.optimized);
    const maxX = Math.max(...data.learning.optimized.line.map(p => p[0]));
    return progress => {
      const reveal = clamp((progress * 80 - 65) / 15);
      set(optimized, {opacity: reveal > 0 ? 1 : 0, 'aria-hidden': reveal > 0 ? 'false' : 'true'});
      clip.setAttribute('width', (x(maxX) - box.left + 2) * reveal);
      return reveal;
    };
  }
  class Comparison {
    constructor(root) {
      this.root = root;
      this.kind = root.dataset.interactiveFigure;
      this.stage = root.querySelector('[data-figure-stage]');
      this.action = root.querySelector('[data-figure-action]');
      this.toggle = root.querySelector('[data-figure-toggle]');
      this.label = root.querySelector('[data-figure-label]');
      this.value = root.querySelector('[data-figure-value]');
      this.live = root.querySelector('[data-figure-live]');
      this.phase = this.kind === 'profile' && !reducedMotion.matches ? 'intro' : 'ready';
      this.elapsed = 0;
      this.userPaused = false;
      this.visible = false;
      this.frame = 0;
      this.previous = null;
      this.stage.hidden = false;
      root.querySelector('[data-figure-fallback]').hidden = true;
      root.dataset.enhanced = '';
      this.resize();
      this.action.addEventListener('click', () => this.optimize());
      this.toggle.addEventListener('click', () => {this.userPaused = !this.userPaused; this.sync();});
      root.querySelector('[data-figure-reset]').addEventListener('click', () => this.reset());
      document.addEventListener('visibilitychange', () => this.sync());
      reducedMotion.addEventListener('change', event => {
        if (!event.matches) return;
        if (this.phase === 'intro') {this.phase = 'ready'; this.elapsed = 0;}
        else if (this.phase === 'optimizing') this.phase = 'done';
        this.sync();
      });
      this.observer = new IntersectionObserver(entries => {
        this.visible = entries[0].isIntersecting && entries[0].intersectionRatio >= .2;
        this.sync();
      }, {threshold: [0, .2]});
      this.observer.observe(this.stage);
      this.resizeObserver = new ResizeObserver(() => this.resize());
      for (const svg of root.querySelectorAll('[data-plot]')) this.resizeObserver.observe(svg.parentElement);
      this.sync();
    }
    isAnimating() {return this.phase === 'intro' || this.phase === 'optimizing';}
    duration() {return this.phase === 'intro' ? 2400 : this.kind === 'profile' ? 1600 : 8000;}
    progress() {return this.phase === 'done' ? 1 : this.phase === 'optimizing' ? clamp(this.elapsed / this.duration()) : 0;}
    resize() {
      const svg = this.root.querySelector('[data-plot]');
      const width = Math.max(300, svg.parentElement.clientWidth);
      if (this.kind === 'profile') this.drawProfile = profileGraph(svg, width);
      else {
        this.drawSearch = searchGraph(svg, width);
        const learning = this.root.querySelector('[data-plot="learning"]');
        this.drawLearning = learningGraph(learning, Math.max(280, learning.parentElement.clientWidth));
      }
      this.render();
    }
    render() {
      const progress = this.progress();
      const done = this.phase === 'done';
      if (this.kind === 'profile') {
        const highlight = this.phase === 'intro' ? clamp((this.elapsed - 1000) / 600) : this.phase === 'ready' ? 1 : 1 - ease(clamp(progress * 4));
        const p = ease(progress);
        this.drawProfile(p, highlight);
        this.label.textContent = done ? 'InstantMimic' : this.phase === 'optimizing' ? 'Optimizing the training loop' : 'Reference implementation';
        this.value.textContent = `${mix(data.profile.baselineMs, data.profile.optimizedMs, p).toFixed(3)} ms`;
      } else {
        const {cycle, best} = this.drawSearch(progress);
        const reveal = this.drawLearning(progress);
        this.root.querySelector('[data-cycle]').textContent = cycle;
        this.root.querySelector('[data-optimized-legend]').style.opacity = reveal > 0 ? '1' : '0';
        this.root.querySelector('[data-optimized-legend]').setAttribute('aria-hidden', reveal > 0 ? 'false' : 'true');
        this.label.textContent = done ? 'Optimized backflip training' : this.phase === 'optimizing' ? 'Best backflip training time so far' : 'Baseline backflip training';
        this.value.textContent = `${best.toFixed(2)} s`;
      }
      this.root.dataset.state = this.phase;
      this.action.hidden = this.phase !== 'ready';
      this.toggle.hidden = !this.isAnimating();
      const playing = this.isAnimating() && !this.userPaused;
      this.toggle.setAttribute('aria-label', playing ? 'Pause animation' : 'Play animation');
      this.toggle.title = playing ? 'Pause animation' : 'Play animation';
      this.toggle.querySelector('[data-play-icon]').hidden = playing;
      this.toggle.querySelector('[data-pause-icon]').hidden = !playing;
      this.live.textContent = done ? this.kind === 'profile' ? 'Optimization complete. A rollout step takes 3.033 milliseconds.' : 'Search complete. The optimized configuration takes 2.17 seconds to learn a backflip.' : '';
    }
    sync() {
      if (!this.visible || document.hidden || this.userPaused || !this.isAnimating()) {
        cancelAnimationFrame(this.frame); this.frame = 0; this.previous = null;
      } else if (!this.frame) this.frame = requestAnimationFrame(time => this.tick(time));
      this.render();
    }
    tick(time) {
      this.frame = 0;
      if (!this.visible || document.hidden || this.userPaused || !this.isAnimating()) return;
      if (this.previous !== null) this.elapsed += time - this.previous;
      this.previous = time;
      if (this.elapsed >= this.duration()) {
        this.phase = this.phase === 'intro' ? 'ready' : 'done';
        this.elapsed = 0;
      }
      this.sync();
    }
    optimize() {
      if (this.phase !== 'ready') return;
      this.phase = reducedMotion.matches ? 'done' : 'optimizing';
      this.elapsed = 0; this.previous = null; this.userPaused = false;
      this.sync();
      this.root.querySelector('[data-figure-reset]').focus({preventScroll: true});
    }
    reset() {
      cancelAnimationFrame(this.frame); this.frame = 0;
      // Reset to the diagnosis/baseline so the next comparison again needs a click.
      this.phase = 'ready'; this.elapsed = 0; this.previous = null; this.userPaused = false;
      this.sync();
      this.action.focus({preventScroll: true});
    }
  }
  if (!('IntersectionObserver' in window) || !('ResizeObserver' in window)) return;
  for (const root of document.querySelectorAll('[data-interactive-figure]')) new Comparison(root);
})();
