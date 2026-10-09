export function publicErrorHtml(status: 404 | 503) {
  const unavailable = status === 404;
  const title = unavailable
    ? "Shared page unavailable."
    : "Shared page temporarily unavailable.";
  const message = unavailable
    ? "This link may be incorrect, or the owner may have unpublished or deleted the page."
    : "We couldn’t load this page right now. Please try again in a moment.";
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><meta name="robots" content="noindex,nofollow"><title>${title} — Nivra</title><link rel="icon" href="/icon.svg?v=5"><link rel="stylesheet" href="/system-page.css"></head><body class="public-system"><main class="system-page"><div><span class="system-page-code" aria-hidden="true">${status}</span><h1>${title}</h1><p>${message}</p><div class="system-page-actions">${unavailable ? '<a href="/">Go to Nivra</a>' : '<a href="">Try again</a>'}</div></div></main></body></html>`;
}
