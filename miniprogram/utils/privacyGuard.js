function callSafely(fn, payload) {
  if (typeof fn !== "function") {
    return
  }

  try {
    fn(payload)
  } catch (error) {
    console.error("隐私保护能力调用失败", error)
  }
}

function enableCaptureProtection() {
  callSafely(wx.setVisualEffectOnCapture, { visualEffect: "hidden" })
}

function disableCaptureProtection() {
  callSafely(wx.setVisualEffectOnCapture, { visualEffect: "none" })
}

function listenCaptureEvents(page) {
  if (!page) {
    return
  }

  page._handleUserCaptureScreen = () => {
    wx.showToast({ title: "资料页已开启防截屏保护", icon: "none" })
  }

  page._handleScreenRecordingStateChanged = (result = {}) => {
    if (result.state === "on") {
      wx.showToast({ title: "录屏时将隐藏敏感内容", icon: "none" })
    }
  }

  callSafely(wx.onUserCaptureScreen, page._handleUserCaptureScreen)
  callSafely(wx.onScreenRecordingStateChanged, page._handleScreenRecordingStateChanged)
}

function unlistenCaptureEvents(page) {
  if (!page) {
    return
  }

  callSafely(wx.offUserCaptureScreen, page._handleUserCaptureScreen)
  callSafely(wx.offScreenRecordingStateChanged, page._handleScreenRecordingStateChanged)
  page._handleUserCaptureScreen = null
  page._handleScreenRecordingStateChanged = null
}

module.exports = {
  disableCaptureProtection,
  enableCaptureProtection,
  listenCaptureEvents,
  unlistenCaptureEvents,
}
