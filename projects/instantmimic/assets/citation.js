(() => {
  const section = document.getElementById('bibtex');
  const button = section?.querySelector('[data-copy-citation]');
  if (!button) return;
  const label = button.querySelector('[data-copy-label]');
  const status = section.querySelector('[data-copy-status]');
  let reset;
  function copyWithoutClipboard(text) {
    const field = document.createElement('textarea');
    field.value = text;
    field.readOnly = true;
    field.style.cssText = 'position:fixed;left:-9999px;top:0';
    const focus = document.activeElement;
    const selection = window.getSelection();
    const ranges = selection ? Array.from({length: selection.rangeCount}, (_, i) => selection.getRangeAt(i).cloneRange()) : [];
    document.body.append(field);
    try {
      field.select();
      if (!document.execCommand('copy')) throw new Error('Copy unavailable');
    } finally {
      field.remove();
      selection?.removeAllRanges();
      ranges.forEach(range => selection?.addRange(range));
      focus?.focus({preventScroll: true});
    }
  }
  button.hidden = false;
  button.addEventListener('click', async () => {
    clearTimeout(reset);
    const text = section.querySelector('[data-citation]').textContent;
    try {
      if (navigator.clipboard?.writeText) {
        try { await navigator.clipboard.writeText(text); }
        catch { copyWithoutClipboard(text); }
      } else copyWithoutClipboard(text);
      label.textContent = 'Copied';
      status.textContent = 'BibTeX copied to clipboard.';
    } catch {
      label.textContent = 'Copy';
      status.textContent = 'Could not copy. Select the BibTeX text to copy it manually.';
    }
    reset = setTimeout(() => { label.textContent = 'Copy'; }, 2000);
  });
})();
