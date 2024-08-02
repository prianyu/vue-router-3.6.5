/* @flow */

import type Router from '../index'
import { History } from './base'
import { cleanPath } from '../util/path'
import { getLocation } from './html5'
import { setupScroll, handleScroll } from '../util/scroll'
import { pushState, replaceState, supportsPushState } from '../util/push-state'

// 基于浏览器hash的历史记录类
export class HashHistory extends History {
  constructor (router: Router, base: ?string, fallback: boolean) {
    super(router, base)
    // check history fallback deeplinking
    // 如果url是来自history模式回退到hash模式，则将地址重定向到hash模式（以/#开头）
    // 如果path本身就是以/#开头的，则不会执行此逻辑
    if (fallback && checkFallback(this.base)) {
      return
    }

    // 不是history模式回退到hash模式，或者history模式本身已经已/#开头则会走这个逻辑
    // 确保
    ensureSlash()
  }

  // this is delayed until the app mounts
  // to avoid the hashchange listener being fired too early
  setupListeners () {
    if (this.listeners.length > 0) {
      return
    }

    const router = this.router
    const expectScroll = router.options.scrollBehavior
    const supportsScroll = supportsPushState && expectScroll

    if (supportsScroll) {
      this.listeners.push(setupScroll())
    }

    const handleRoutingEvent = () => {
      const current = this.current
      if (!ensureSlash()) {
        return
      }
      this.transitionTo(getHash(), route => {
        if (supportsScroll) {
          handleScroll(this.router, route, current, true)
        }
        if (!supportsPushState) {
          replaceHash(route.fullPath)
        }
      })
    }
    const eventType = supportsPushState ? 'popstate' : 'hashchange'
    window.addEventListener(
      eventType,
      handleRoutingEvent
    )
    this.listeners.push(() => {
      window.removeEventListener(eventType, handleRoutingEvent)
    })
  }

  push (location: RawLocation, onComplete?: Function, onAbort?: Function) {
    const { current: fromRoute } = this
    this.transitionTo(
      location,
      route => {
        pushHash(route.fullPath)
        handleScroll(this.router, route, fromRoute, false)
        onComplete && onComplete(route)
      },
      onAbort
    )
  }

  replace (location: RawLocation, onComplete?: Function, onAbort?: Function) {
    const { current: fromRoute } = this
    this.transitionTo(
      location,
      route => {
        replaceHash(route.fullPath)
        handleScroll(this.router, route, fromRoute, false)
        onComplete && onComplete(route)
      },
      onAbort
    )
  }

  go (n: number) {
    window.history.go(n)
  }

  ensureURL (push?: boolean) {
    const current = this.current.fullPath
    if (getHash() !== current) {
      push ? pushHash(current) : replaceHash(current)
    }
  }

  getCurrentLocation () {
    return getHash()
  }
}

// 将URL的path不为/#开头的，重定向到以/#开头的地址
// 如果重定向了则返回true
function checkFallback (base) {
  const location = getLocation(base) // 获取当前基于页面相对于base的路径
  if (!/^\/#/.test(location)) { // 如果不以/#开头则转为以/#开头并重定向
    window.location.replace(cleanPath(base + '/#' + location))
    return true
  }
}

function ensureSlash (): boolean {
  const path = getHash() // 获取hash值（不含#）
  if (path.charAt(0) === '/') {
  // 如果hash值以/开头，说明已经是一个基于hash模式的路径： 如xxx.com/base/#/a/b/c => /a/b/c
    return true
  }
  // 不是/开头的hash值
  replaceHash('/' + path)
  return false
}

// 提取当前URL中的hash部分
export function getHash (): string {
  // We can't use window.location.hash here because it's not
  // consistent across browsers - Firefox will pre-decode it!
  // 这里不使用浏览器的location.hash来获取，因为不同浏览器对hash的处理方式不一样
  // 比如火狐会预解码哈希部分，这样会导致跨浏览器行为不一致
  let href = window.location.href
  const index = href.indexOf('#') // 查找#所在的位置
  // empty path
  if (index < 0) return '' // 没找到则没有hash

  href = href.slice(index + 1) // 找到了则截取hash部分

  // 返回截取到的hash值
  return href
}

// 根据path创建一个包含完成的路径以及基于hash模式的URL
function getUrl (path) {
  const href = window.location.href
  const i = href.indexOf('#')
  const base = i >= 0 ? href.slice(0, i) : href
  return `${base}#${path}`
}

function pushHash (path) {
  if (supportsPushState) {
    pushState(getUrl(path))
  } else {
    window.location.hash = path
  }
}

// 修改浏览器的URL到指定的hash模式的路径
// 优先使用history API的replaceState，该方法不会强制刷新页面
function replaceHash (path) {
  if (supportsPushState) { // 支持history API则替换路径为生成的url
    replaceState(getUrl(path))
  } else { // 重定向到生成的url
    window.location.replace(getUrl(path))
  }
}
