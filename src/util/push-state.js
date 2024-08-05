/* @flow */

import { inBrowser } from './dom'
import { saveScrollPosition } from './scroll'
import { genStateKey, setStateKey, getStateKey } from './state-key'
import { extend } from './misc'


// 是否支持pushState
export const supportsPushState =
  inBrowser &&
  (function () {
    const ua = window.navigator.userAgent

    if (
      (ua.indexOf('Android 2.') !== -1 || ua.indexOf('Android 4.0') !== -1) &&
      ua.indexOf('Mobile Safari') !== -1 &&
      ua.indexOf('Chrome') === -1 &&
      ua.indexOf('Windows Phone') === -1
    ) {
      return false
    }

    return window.history && typeof window.history.pushState === 'function'
  })()


  // 导航到新的路由或者替换当前页面为新的路由
export function pushState (url?: string, replace?: boolean) {
  saveScrollPosition() // 保存当前页面的滚动位置信息
  // try...catch the pushState call to get around Safari
  // DOM Exception 18 where it limits to 100 pushState calls
  // Safari下丢pushState长度的限制，超过会触发DOm Exception 18错误
  const history = window.history
  try {
    if (replace) { // 替换当前页面
      // preserve existing history state as it could be overriden by the user
      // 生成一个新的state 对象
      const stateCopy = extend({}, history.state)
      stateCopy.key = getStateKey()
      history.replaceState(stateCopy, '', url) // 使用新的state信息替换当前的历史状态
    } else { // 添加新的历史记录，会生成一个新的state-key
      history.pushState({ key: setStateKey(genStateKey()) }, '', url)
    }
  } catch (e) { // pushState触发限制后使用location.replace或assign
    window.location[replace ? 'replace' : 'assign'](url)
  }
}

// 替换当前页面为新的路由
export function replaceState (url?: string) {
  pushState(url, true)
}
