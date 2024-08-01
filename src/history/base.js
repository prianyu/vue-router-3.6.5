/* @flow */

import { _Vue } from '../install'
import type Router from '../index'
import { inBrowser } from '../util/dom'
import { runQueue } from '../util/async'
import { warn } from '../util/warn'
import { START, isSameRoute, handleRouteEntered } from '../util/route'
import {
  flatten,
  flatMapComponents,
  resolveAsyncComponents
} from '../util/resolve-components'
import {
  createNavigationDuplicatedError,
  createNavigationCancelledError,
  createNavigationRedirectedError,
  createNavigationAbortedError,
  isError,
  isNavigationFailure,
  NavigationFailureType
} from '../util/errors'
import { handleScroll } from '../util/scroll'
// 历史记录基类
export class History {
  router: Router // 关联的路由器实例
  base: string // 基础路径，通过normalizeBase处理规范化
  current: Route // 当前的路由，初始化为START(初始状态)
  pending: ?Route // 当前正在处理的路由
  cb: (r: Route) => void // 路由更新监听的回调函数
  ready: boolean // 是否已经初始化完成
  readyCbs: Array<Function> // 路由准备好的后的回调函数数组
  readyErrorCbs: Array<Function> // 路由准备过程中出现错误的回调函数数组
  errorCbs: Array<Function> // 错误回调函数数组
  listeners: Array<Function> // 事件监听器数组
  cleanupListeners: Function

  // implemented by sub-classes
  // 由子类实现的方法列表
  +go: (n: number) => void 
  +push: (loc: RawLocation, onComplete?: Function, onAbort?: Function) => void
  +replace: (
    loc: RawLocation,
    onComplete?: Function,
    onAbort?: Function
  ) => void // 由子类实现的replace方法
  +ensureURL: (push?: boolean) => void
  +getCurrentLocation: () => string
  +setupListeners: Function

  constructor (router: Router, base: ?string) {
    this.router = router
    this.base = normalizeBase(base) // 规范化base
    // start with a route object that stands for "nowhere"
    this.current = START // 默认的当前路由
    this.pending = null
    this.ready = false
    this.readyCbs = []
    this.readyErrorCbs = []
    this.errorCbs = []
    this.listeners = []
  }

  // 注册一个回调函数，在路由更新时调用
  listen (cb: Function) {
    this.cb = cb
  }

  // 注册路由准备好的回调函数和错误的回调函数
  onReady (cb: Function, errorCb: ?Function) {
    if (this.ready) { // 已经是准备好的状态，则直接执行
      cb()
    } else { // 否则将回调存储
      this.readyCbs.push(cb) // 准备好的回调
      if (errorCb) { // 错误回调
        this.readyErrorCbs.push(errorCb)
      }
    }
  }

  // 注册错误回调
  onError (errorCb: Function) {
    this.errorCbs.push(errorCb)
  }

  // 路由跳转
  // 1. 匹配并获取目标路由
  // 2. 保存当前的路由，以便在路由守卫和回调中使用
  // 3. 调用confirmTransition方法执行路由过渡
  // 4. 调用过渡成功后会执行完成回调、确保URL正确、调用全局后置钩子，并将路由标记为已准备
  // 5. 过渡失败时会执行中断回调处理错误
  transitionTo (
    location: RawLocation, // 目标路由的位置，可以是字符串也可以是Location对象
    onComplete?: Function, // 过渡完成的回调
    onAbort?: Function // 过渡中止的回调
  ) {
    let route
    // catch redirect option https://github.com/vuejs/vue-router/issues/3201
    // 捕获重定向选项处理的错误
    // 当传入redirect时，可能会抛出错误，错误需要被捕获
    try {
      route = this.router.match(location, this.current)
    } catch (e) { // 遍历错误回调并执行
      this.errorCbs.forEach(cb => {
        cb(e)
      })
      // Exception should still be thrown
      // 抛出错误
      throw e
    }
    const prev = this.current // 当前的路由
    // 确定过渡
    this.confirmTransition(
      route, // 要跳转的目标路由
      () => {
        this.updateRoute(route) // 更新当前路由为目标路由
        onComplete && onComplete(route) // 执行跳转完成回调
        this.ensureURL() // 确保浏览器地址显示正确的URL
        // 遍历执行全局的路由后置守卫，接收当前路由和前一个路由
        this.router.afterHooks.forEach(hook => {
          hook && hook(route, prev)
        })

        // fire ready cbs once
        // 标记为已准备状态并执行准备完成回调
        if (!this.ready) {
          this.ready = true
          this.readyCbs.forEach(cb => {
            cb(route)
          })
        }
      },
      err => { // 过渡中断回调
        if (onAbort) { // 执行中断回调
          onAbort(err)
        }
        // 如果是在准备阶段旧发生了错误
        if (err && !this.ready) {
          // Initial redirection should not mark the history as ready yet
          // because it's triggered by the redirection instead
          // https://github.com/vuejs/vue-router/issues/3225
          // https://github.com/vuejs/vue-router/issues/3331
          // 错误不是重定向失败，或者前一个路由不是初始路由则将路由标记为已准备
          // 并遍历所有的准备阶段错误回调函数执行
          if (!isNavigationFailure(err, NavigationFailureType.redirected) || prev !== START) {
            this.ready = true // 标记为准备完成
            this.readyErrorCbs.forEach(cb => { // 执行准备阶段的错误回调
              cb(err)
            })
          }
        }
      }
    )
  }

  // 确认路由过渡
  confirmTransition (route: Route, onComplete: Function, onAbort?: Function) {
    const current = this.current // 当前路由
    this.pending = route // 待处理的路由
    // 中断函数
    const abort = err => {
      // changed after adding errors with
      // https://github.com/vuejs/vue-router/pull/3047 before that change,
      // redirect and aborted navigation would produce an err == null
      if (!isNavigationFailure(err) && isError(err)) {
        if (this.errorCbs.length) {
          this.errorCbs.forEach(cb => {
            cb(err)
          })
        } else {
          if (process.env.NODE_ENV !== 'production') {
            warn(false, 'uncaught error during route navigation:')
          }
          console.error(err)
        }
      }
      onAbort && onAbort(err)
    }
    const lastRouteIndex = route.matched.length - 1
    const lastCurrentIndex = current.matched.length - 1
    if (
      isSameRoute(route, current) &&
      // in the case the route map has been dynamically appended to
      lastRouteIndex === lastCurrentIndex &&
      route.matched[lastRouteIndex] === current.matched[lastCurrentIndex]
    ) {
      this.ensureURL()
      if (route.hash) {
        handleScroll(this.router, current, route, false)
      }
      return abort(createNavigationDuplicatedError(current, route))
    }

    const { updated, deactivated, activated } = resolveQueue(
      this.current.matched,
      route.matched
    )

    const queue: Array<?NavigationGuard> = [].concat(
      // in-component leave guards
      extractLeaveGuards(deactivated),
      // global before hooks
      this.router.beforeHooks,
      // in-component update hooks
      extractUpdateHooks(updated),
      // in-config enter guards
      activated.map(m => m.beforeEnter),
      // async components
      resolveAsyncComponents(activated)
    )

    const iterator = (hook: NavigationGuard, next) => {
      if (this.pending !== route) {
        return abort(createNavigationCancelledError(current, route))
      }
      try {
        hook(route, current, (to: any) => {
          if (to === false) {
            // next(false) -> abort navigation, ensure current URL
            this.ensureURL(true)
            abort(createNavigationAbortedError(current, route))
          } else if (isError(to)) {
            this.ensureURL(true)
            abort(to)
          } else if (
            typeof to === 'string' ||
            (typeof to === 'object' &&
              (typeof to.path === 'string' || typeof to.name === 'string'))
          ) {
            // next('/') or next({ path: '/' }) -> redirect
            abort(createNavigationRedirectedError(current, route))
            if (typeof to === 'object' && to.replace) {
              this.replace(to)
            } else {
              this.push(to)
            }
          } else {
            // confirm transition and pass on the value
            next(to)
          }
        })
      } catch (e) {
        abort(e)
      }
    }

    runQueue(queue, iterator, () => {
      // wait until async components are resolved before
      // extracting in-component enter guards
      const enterGuards = extractEnterGuards(activated)
      const queue = enterGuards.concat(this.router.resolveHooks)
      runQueue(queue, iterator, () => {
        if (this.pending !== route) {
          return abort(createNavigationCancelledError(current, route))
        }
        this.pending = null
        onComplete(route)
        if (this.router.app) {
          this.router.app.$nextTick(() => {
            handleRouteEntered(route)
          })
        }
      })
    })
  }


  // 更新当前路由并执行路由更新的监听回调
  updateRoute (route: Route) {
    this.current = route
    this.cb && this.cb(route)
  }

  // 设置监听器，默认是空函数，子类可以提供实现覆盖
  setupListeners () {
    // Default implementation is empty
  }

  // 清理事件监听器并重置路由
  teardown () {
    // clean up event listeners
    // https://github.com/vuejs/vue-router/issues/2341
    // 遍历listeners并执行进行清理
    this.listeners.forEach(cleanupListener => {
      cleanupListener()
    })
    this.listeners = []

    // reset current history route
    // 重置当前路由
    // https://github.com/vuejs/vue-router/issues/3294
    this.current = START
    this.pending = null
  }
}
// 规范化base
function normalizeBase (base: ?string): string {
  // 如果没有传入base，则在浏览器中先尝试从base标签解析
  // base获取不到或者不是浏览器环境则设置为/
  if (!base) {
    if (inBrowser) { // 浏览器环境
      // respect <base> tag
      // 从base标签获取href属性
      const baseEl = document.querySelector('base')
      base = (baseEl && baseEl.getAttribute('href')) || '/'
      // strip full URL origin 移除协议、域名、端口，保留path
      base = base.replace(/^https?:\/\/[^\/]+/, '')
    } else {
      base = '/'
    }
  }
  // make sure there's the starting slash
  // 如果不是以/开头，则添加/
  if (base.charAt(0) !== '/') {
    base = '/' + base
  }
  // remove trailing slash
  // 移除结尾的/
  return base.replace(/\/$/, '')
}

function resolveQueue (
  current: Array<RouteRecord>,
  next: Array<RouteRecord>
): {
  updated: Array<RouteRecord>,
  activated: Array<RouteRecord>,
  deactivated: Array<RouteRecord>
} {
  let i
  const max = Math.max(current.length, next.length)
  for (i = 0; i < max; i++) {
    if (current[i] !== next[i]) {
      break
    }
  }
  return {
    updated: next.slice(0, i),
    activated: next.slice(i),
    deactivated: current.slice(i)
  }
}

function extractGuards (
  records: Array<RouteRecord>,
  name: string,
  bind: Function,
  reverse?: boolean
): Array<?Function> {
  const guards = flatMapComponents(records, (def, instance, match, key) => {
    const guard = extractGuard(def, name)
    if (guard) {
      return Array.isArray(guard)
        ? guard.map(guard => bind(guard, instance, match, key))
        : bind(guard, instance, match, key)
    }
  })
  return flatten(reverse ? guards.reverse() : guards)
}

function extractGuard (
  def: Object | Function,
  key: string
): NavigationGuard | Array<NavigationGuard> {
  if (typeof def !== 'function') {
    // extend now so that global mixins are applied.
    def = _Vue.extend(def)
  }
  return def.options[key]
}

function extractLeaveGuards (deactivated: Array<RouteRecord>): Array<?Function> {
  return extractGuards(deactivated, 'beforeRouteLeave', bindGuard, true)
}

function extractUpdateHooks (updated: Array<RouteRecord>): Array<?Function> {
  return extractGuards(updated, 'beforeRouteUpdate', bindGuard)
}

function bindGuard (guard: NavigationGuard, instance: ?_Vue): ?NavigationGuard {
  if (instance) {
    return function boundRouteGuard () {
      return guard.apply(instance, arguments)
    }
  }
}

function extractEnterGuards (
  activated: Array<RouteRecord>
): Array<?Function> {
  return extractGuards(
    activated,
    'beforeRouteEnter',
    (guard, _, match, key) => {
      return bindEnterGuard(guard, match, key)
    }
  )
}

function bindEnterGuard (
  guard: NavigationGuard,
  match: RouteRecord,
  key: string
): NavigationGuard {
  return function routeEnterGuard (to, from, next) {
    return guard(to, from, cb => {
      if (typeof cb === 'function') {
        if (!match.enteredCbs[key]) {
          match.enteredCbs[key] = []
        }
        match.enteredCbs[key].push(cb)
      }
      next(cb)
    })
  }
}
