
chrome.runtime.onInstalled.addListener(() => {
  console.log('TabPilot AI installed!')
})

chrome.sidePanel
  .setPanelBehavior({ openPanelOnActionClick: true })
  .catch(console.error)

chrome.runtime.onMessage.addListener(
  (message, _sender, sendResponse) => {
    if (message.type !== 'ANALYZE_PAGE') {
      return
    }

    void (async () => {
      try {
        // Prefer the tab that belongs to the extension's side-panel window.
        const tabs = await chrome.tabs.query({
          active: true,
          lastFocusedWindow: true,
        })

        const tab = tabs.find(
          (item) => item.id && /^https?:\/\//i.test(item.url ?? ''),
        )

        if (!tab?.id) {
          throw new Error(
            'No accessible website tab found. Open a regular website and try again.',
          )
        }

        const results = await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          func: () => ({
            title: document.title,
            url: window.location.href,
            text: document.body?.innerText ?? '',
          }),
        })

        const page = results[0]?.result

        if (!page) {
          throw new Error('No page content could be extracted.')
        }

        sendResponse({ data: page })
      } catch (error) {
        console.error('TabPilot AI extraction error:', error)

        sendResponse({
          error:
            error instanceof Error
              ? error.message
              : 'Page extraction failed.',
        })
      }
    })()

    return true
  },
)
