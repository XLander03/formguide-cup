/** Export the existing paper sheet via the browser's print → Save as PDF (print CSS in app.css). */
export function downloadSheetPdf() {
  const root = document.documentElement;
  const prevTitle = document.title;
  const stamp = new Date().toISOString().slice(0, 10);
  document.title = `FormGuide-draft-NOT-SUBMITTED-${stamp}`;
  root.classList.add('fg-printing');
  const done = () => {
    root.classList.remove('fg-printing');
    document.title = prevTitle;
    window.removeEventListener('afterprint', done);
    window.removeEventListener('pointerdown', done);
    window.removeEventListener('keydown', done);
  };
  window.addEventListener('afterprint', done);
  window.print();
  // Firefox/Safari return from print() while the dialog is still open, so no timer here.
  // iOS may never fire afterprint; the next interaction with the page means the dialog is gone.
  window.addEventListener('pointerdown', done);
  window.addEventListener('keydown', done);
}
