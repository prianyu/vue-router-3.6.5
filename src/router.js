/* @flow */

import { install } from './install'
import { START } from './util/route'
import { assert, warn } from './util/warn'
import { inBrowser } from './util/dom'
import { cleanPath } from './util/path'
import { createMatcher } from './create-matcher'
import { normalizeLocation } from './util/location'
import { supportsPushState } from './util/push-state'
import { handleScroll } from './util/scroll'
import { isNavigationFailure, NavigationFailureType } from './util/errors'

import { HashHistory } from './history/hash'
import { HTML5History } from './history/html5'
import { AbstractHistory } from './history/abstract'

import type { Matcher } from './create-matcher'

export default class VueRouter {
  static install: () => void
  static version: string
  static isNavigationFailure: Function
  static NavigationFailureType: any
  static START_LOCATION: Route

  app: any // 当前的Vue应用实例
  apps: Array<any> // 存储所有的使用该路由器的Vue应用实例
  ready: boolean // 是否已经准备好
  readyCbs: Array<Function> // 保存ready 回调函数的数组
  options: RouterOptions // 路由配置选项
  mode: string // 路由模式
  history: HashHistory | HTML5History | AbstractHistory // 存储和管理历史记录的实例
  matcher: Matcher // 路由匹配器
  fallback: boolean // 是否降级为hash模式
  beforeHooks: Array<?NavigationGuard> // 全局的导航前置守卫
  resolveHooks: Array<?NavigationGuard> // 解析守卫
  afterHooks: Array<?AfterNavigationHook> // 全局的后置守卫

  constructor (options: RouterOptions = {}) {
    // 只能使用new调用
    if (process.env.NODE_ENV !== 'production') {
      warn(this instanceof VueRouter, `Router must be called with the new operator.`)
    }
    // 初始化各种实例属性
    this.app = null
    this.apps = []
    this.options = options
    this.beforeHooks = []
    this.resolveHooks = []
    this.afterHooks = []
    // 创建路由匹配器
    // 会根据路由配置在内部创建pathList/pathMap/nameMap
    // 返回一个可以匹配、操作这些对象的对象
    this.matcher = createMatcher(options.routes || [], this)

    let mode = options.mode || 'hash' // 路由模式默认是hash模式
    this.fallback = mode === 'history' && !supportsPushState && options.fallback !== false // history模式是否降级为hash模式
    
    // 如果不支持history模式，则配置的history模式降级为hash模式
    if (this.fallback) {
      mode = 'hash'
    }
    // 非浏览器端（如服务端渲染）则强制设置成abstract模式
    if (!inBrowser) {
      mode = 'abstract'
    }
    this.mode = mode // 设置最终的路由模式

    // 根据不同的模式创建对应的history实例
    switch (mode) {
      case 'history':
        this.history = new HTML5History(this, options.base)
        break
      case 'hash':
        this.history = new HashHistory(this, options.base, this.fallback)
        break
      case 'abstract':
        this.history = new AbstractHistory(this, options.base)
        break
      default:
        if (process.env.NODE_ENV !== 'production') {
          assert(false, `invalid mode: ${mode}`)
        }
    }
  }

  match (raw: RawLocation, current?: Route, redirectedFrom?: Location): Route {
    return this.matcher.match(raw, current, redirectedFrom)
  }

  // currentRoute属性，指向history.current属性
  get currentRoute (): ?Route {
    return this.history && this.history.current
  }

  // 路由初始化，在组件的beforeCreate钩子中调用
  init (app: any /* Vue component instance */) {
    // 未安装提示
    process.env.NODE_ENV !== 'production' &&
      assert(
        install.installed,
        `not installed. Make sure to call \`Vue.use(VueRouter)\` ` +
          `before creating root instance.`
      )

    // 往apps添加当前根组件实例
    this.apps.push(app)

    // 当应用实例已经销毁时，释放与之关联的路由资源
    // set up app destroyed handler
    // https://github.com/vuejs/vue-router/issues/2639
    app.$once('hook:destroyed', () => {
      // clean out app from this.apps array once destroyed
      // 查找对应的应用实例并从apps中移除
      const index = this.apps.indexOf(app)
      if (index > -1) this.apps.splice(index, 1)
      // ensure we still have a main app or null if no apps
      // we do not release the router so it can be reused
      // 确保仍然有一个主应用或在没有主应用时时将其设置为null
      if (this.app === app) this.app = this.apps[0] || null

      // 如果没有主应用了，则释放history
      if (!this.app) this.history.teardown()
    })

    // main app previously initialized
    // return as we don't need to set up new history listener
    // 主应用已经初始化过了，则无需再设置新的历史记录监听器
    if (this.app) {
      return
    }

    // 设置主应用
    this.app = app

    const history = this.history

    // 在history模式和hash模式下，初始化时，需要处理滚动行为
    // 注：AbstractHistory不涉及浏览器的实际导航和滚动行为
    if (history instanceof HTML5History || history instanceof HashHistory) {
      const handleInitialScroll = routeOrError => { // 接收路由或者错误对象
        const from = history.current // 获取当前路由
        const expectScroll = this.options.scrollBehavior // 滚动行为配置
        const supportsScroll = supportsPushState && expectScroll // 是否支持pushState且定义了滚动行为

        // 如果支持pushState且定义了滚动行为且完成路由过渡则执行滚动行为
        if (supportsScroll && 'fullPath' in routeOrError) {
          handleScroll(this, routeOrError, from, false)
        }
      }
      const setupListeners = routeOrError => {
        history.setupListeners() // 设置对应history模式下相关的事件监听
        handleInitialScroll(routeOrError) // 处理初始的滚动
      }
      // 导航至当前的路由
      // 导航完成或者中断后都设置URL监听函数
      // 处理初始的滚动
      history.transitionTo(
        history.getCurrentLocation(),
        setupListeners,
        setupListeners
      )
    }

    // 监听路由变化，并通知所有应用实例
    // app._route属性是在根实例的beforeCreate钩子中为根实例添加的一个响应式属性
    // 其初始值为history.current属性
    history.listen(route => {
      // 遍历应用，修改_route属性
      this.apps.forEach(app => {
        app._route = route
      })
    })
  }

  // 注册全局的前置守卫，往beforeHooks添加回调
  beforeEach (fn: Function): Function {
    return registerHook(this.beforeHooks, fn)
  }

  // 注册解析守卫
  beforeResolve (fn: Function): Function {
    return registerHook(this.resolveHooks, fn)
  }

  // 注册全局的后置守卫
  afterEach (fn: Function): Function {
    return registerHook(this.afterHooks, fn)
  }
  // 注册一个路由初始导航完成时的回调，errorCb在初始化路由解析运行出错（比如解析异步组件失败）时执行
  onReady (cb: Function, errorCb?: Function) {
    this.history.onReady(cb, errorCb)
  }
 // 注册一个错误回调，注册的回调在路由导航过程中发生错误时被调用
  onError (errorCb: Function) {
    this.history.onError(errorCb)
  }

  // 导航到一个新的路由
  // 如果没有传入onComplete和onAbort，则会返回一个Promise，Promise在导航完成后resolve，导航中断时reject
  push (location: RawLocation, onComplete?: Function, onAbort?: Function) {
    // $flow-disable-line
    if (!onComplete && !onAbort && typeof Promise !== 'undefined') {
      return new Promise((resolve, reject) => {
        this.history.push(location, resolve, reject)
      })
    } else {
      this.history.push(location, onComplete, onAbort)
    }
  }

  // 替换当前路由为新的路由
  // 如果没有传入onComplete和onAbort，则会返回一个Promise，Promise在导航完成后resolve，导航中断时reject
  replace (location: RawLocation, onComplete?: Function, onAbort?: Function) {
    // $flow-disable-line
    if (!onComplete && !onAbort && typeof Promise !== 'undefined') {
      return new Promise((resolve, reject) => {
        this.history.replace(location, resolve, reject)
      })
    } else {
      this.history.replace(location, onComplete, onAbort)
    }
  }

  // 跳转到指定的路由位置
  go (n: number) {
    this.history.go(n)
  }

  back () {
    this.go(-1)
  }

  forward () {
    this.go(1)
  }

  getMatchedComponents (to?: RawLocation | Route): Array<any> {
    const route: any = to
      ? to.matched
        ? to
        : this.resolve(to).route
      : this.currentRoute
    if (!route) {
      return []
    }
    return [].concat.apply(
      [],
      route.matched.map(m => {
        return Object.keys(m.components).map(key => {
          return m.components[key]
        })
      })
    )
  }

  resolve (
    to: RawLocation,
    current?: Route,
    append?: boolean
  ): {
    location: Location,
    route: Route,
    href: string,
    // for backwards compat
    normalizedTo: Location,
    resolved: Route
  } {
    current = current || this.history.current
    const location = normalizeLocation(to, current, append, this)
    const route = this.match(location, current)
    const fullPath = route.redirectedFrom || route.fullPath
    const base = this.history.base
    const href = createHref(base, fullPath, this.mode)
    return {
      location,
      route,
      href,
      // for backwards compat
      normalizedTo: location,
      resolved: route
    }
  }

  getRoutes () {
    return this.matcher.getRoutes()
  }

  addRoute (parentOrRoute: string | RouteConfig, route?: RouteConfig) {
    this.matcher.addRoute(parentOrRoute, route)
    if (this.history.current !== START) {
      this.history.transitionTo(this.history.getCurrentLocation())
    }
  }

  addRoutes (routes: Array<RouteConfig>) {
    if (process.env.NODE_ENV !== 'production') {
      warn(false, 'router.addRoutes() is deprecated and has been removed in Vue Router 4. Use router.addRoute() instead.')
    }
    this.matcher.addRoutes(routes)
    if (this.history.current !== START) {
      this.history.transitionTo(this.history.getCurrentLocation())
    }
  }
}

// 注册钩子函数
// 将回调函数添加到指定的钩子存储数组后，返回一个移除钩子的函数
function registerHook (list: Array<any>, fn: Function): Function {
  list.push(fn)
  return () => {
    const i = list.indexOf(fn)
    if (i > -1) list.splice(i, 1)
  }
}

function createHref (base: string, fullPath: string, mode) {
  var path = mode === 'hash' ? '#' + fullPath : fullPath
  return base ? cleanPath(base + '/' + path) : path
}

// We cannot remove this as it would be a breaking change
VueRouter.install = install // 安装插件的方法
VueRouter.version = '__VERSION__' // 版本号，构建时会被替换
VueRouter.isNavigationFailure = isNavigationFailure // 判断是否导航失败的方法
VueRouter.NavigationFailureType = NavigationFailureType // 导航失败的类型
VueRouter.START_LOCATION = START // 起始路径对象

// 自动安装
if (inBrowser && window.Vue) {
  window.Vue.use(VueRouter)
}
