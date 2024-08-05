/* @flow */

import type Router from '../index'
import { History } from './base'
import { cleanPath } from '../util/path'
import { START } from '../util/route'
import { setupScroll, handleScroll } from '../util/scroll'
import { pushState, replaceState, supportsPushState } from '../util/push-state'

// 基于History API的的历史记录管理类
export class HTML5History extends History {
  _startLocation: string

  constructor (router: Router, base: ?string) {
    super(router, base)

    this._startLocation = getLocation(this.base)
  }

  // 设置监听事件
  setupListeners () {
    if (this.listeners.length > 0) { // 已经有监听器
      return
    }

    const router = this.router
    const expectScroll = router.options.scrollBehavior
    const supportsScroll = supportsPushState && expectScroll

    // 支持滚动行为设置
    if (supportsScroll) {
      this.listeners.push(setupScroll())
    }

    const handleRoutingEvent = () => {
      const current = this.current

      // Avoiding first `popstate` event dispatched in some browsers but first
      // history route not updated since async guard at the same time.
      // 避免在有些浏览器下第一次加载时触发popstate事件带来的问题
      const location = getLocation(this.base)
      if (this.current === START && location === this._startLocation) { // 第一次加载
        return
      }

      // 执行过渡
      this.transitionTo(location, route => {
        if (supportsScroll) { // 处理滚动
          handleScroll(router, route, current, true)
        }
      })
    }
    // 监听popstate事件，并添加监听器清理函数
    window.addEventListener('popstate', handleRoutingEvent)
    this.listeners.push(() => {
      window.removeEventListener('popstate', handleRoutingEvent)
    })
  }

  // 跳转到指定的路由
  go (n: number) {
    window.history.go(n)
  }

  // 导航到一个新页面
  push (location: RawLocation, onComplete?: Function, onAbort?: Function) {
    const { current: fromRoute } = this
    this.transitionTo(location, route => {
      pushState(cleanPath(this.base + route.fullPath)) // 跳转到目标path
      handleScroll(this.router, route, fromRoute, false) // 处理滚动
      onComplete && onComplete(route) // 完成回调
    }, onAbort)
  }

  // 替换当前页面
  replace (location: RawLocation, onComplete?: Function, onAbort?: Function) {
    const { current: fromRoute } = this
    this.transitionTo(location, route => {
      replaceState(cleanPath(this.base + route.fullPath))
      handleScroll(this.router, route, fromRoute, false) // 处理滚动
      onComplete && onComplete(route) // 完成回调
    }, onAbort)
  }


  // 确保当前的URL与路由的fullPath相同
  ensureURL (push?: boolean) {
    if (getLocation(this.base) !== this.current.fullPath) {
      const current = cleanPath(this.base + this.current.fullPath)
      push ? pushState(current) : replaceState(current)
    }
  }

  // 获取相对与base的URL
  getCurrentLocation (): string {
    return getLocation(this.base)
  }
}

// 返回当前页面地址相对与base的路径
export function getLocation (base: string): string {
  let path = window.location.pathname // 当前页面的path
  // 将path和base都转为小写用于比较
  const pathLowerCase = path.toLowerCase()
  const baseLowerCase = base.toLowerCase()
  // base="/a" shouldn't turn path="/app" into "/a/pp"
  // https://github.com/vuejs/vue-router/issues/3555
  // so we ensure the trailing slash in the base
  // 确保在比较时base末尾包含/，以避免误匹配，如base=”/b"时，path="/app"被转为'/a/pp
  if (base && ((pathLowerCase === baseLowerCase) ||
    (pathLowerCase.indexOf(cleanPath(baseLowerCase + '/')) === 0))) {
    // 路径与基路径相同或以基路径开透时，则从路径中移除基路径部分
    path = path.slice(base.length)
  }
  // 加上查询字符串和hash值，返回处理后的路径
  return (path || '/') + window.location.search + window.location.hash
}
