
chrome.runtime.onInstalled.addListener(() => {
  console.log('TabPilot AI installed!')
})

// Open the side panel when the extension icon is clicked.
chrome.sidePanel
  .setPanelBehavior({ openPanelOnActionClick: true })
  .catch(console.error)

// Handle requests from the side panel.
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type !== 'ANALYZE_PAGE') {
    return
  }

  chrome.tabs.query(
    { active: true, lastFocusedWindow: true },
    async (tabs) => {
      const tab = tabs[0]

      if (!tab?.id) {
        sendResponse({
          error: 'No active browser tab found.',
        })
        return
      }

      try {
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
          sendResponse({
            error: 'No page content could be extracted.',
          })
          return
        }

        sendResponse({ data: page })
      } catch (error) {
        console.error('TabPilot AI extraction error:', error)

        sendResponse({
          error:
            error instanceof Error
              ? error.message
              : 'Page extraction failed. Check the service worker console.',
        })
      }
    },
  )

  // Keep the message channel open for the asynchronous response.
  return true
})

