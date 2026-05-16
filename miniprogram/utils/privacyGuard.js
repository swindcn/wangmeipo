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

function isSuperAdminViewer() {
  try {
    const app = getApp()
    const profile = app && app.globalData ? app.globalData.currentUserProfile || {} : {}
    const role = profile.role || (app && app.globalData ? app.globalData.userRole : "")
    return role === "super_admin"
  } catch (error) {
    return false
  }
}

function enableCaptureProtection(options = {}) {
  if (!options.force && isSuperAdminViewer()) {
    disableCaptureProtection()
    return false
  }

  callSafely(wx.setVisualEffectOnCapture, { visualEffect: "hidden" })
  return true
}

function disableCaptureProtection() {
  callSafely(wx.setVisualEffectOnCapture, { visualEffect: "none" })
}

function applyCaptureProtection() {
  return enableCaptureProtection()
}

function listenCaptureEvents(page) {
  if (!page) {
    return
  }

  page._handleUserCaptureScreen = () => {
    if (isSuperAdminViewer()) {
      return
    }

    wx.showToast({ title: "资料页已开启防截屏保护", icon: "none" })
  }

  page._handleScreenRecordingStateChanged = (result = {}) => {
    if (isSuperAdminViewer()) {
      return
    }

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
  applyCaptureProtection,
  disableCaptureProtection,
  enableCaptureProtection,
  isSuperAdminViewer,
  listenCaptureEvents,
  unlistenCaptureEvents,
}
