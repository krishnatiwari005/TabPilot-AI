
export interface PageContent {
  title: string
  url: string
  text: string
}

export function extractPageContent(): PageContent {
  return {
    title: document.title,
    url: window.location.href,
    text: document.body?.innerText ?? '',
  }
}