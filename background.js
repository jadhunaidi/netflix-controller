// Toolbar button opens the settings / controller-test page.
browser.browserAction.onClicked.addListener(() => browser.runtime.openOptionsPage());
