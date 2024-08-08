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
    // 当传入redirect时，可能会抛出错误，错误需要被onError捕获
    try {
      route = this.router.match(location, this.current)
    } catch (e) { // 遍历错误回调并执行
      this.errorCbs.forEach(cb => {
        cb(e)
      })
      // Exception should still be thrown
      // 抛出错误，此错误可以被this.router.push().then().catch捕获
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
        // 如果是在准备阶段就发生了错误
        if (err && !this.ready) {
          // Initial redirection should not mark the history as ready yet
          // because it's triggered by the redirection instead
          // https://github.com/vuejs/vue-router/issues/3225
          // https://github.com/vuejs/vue-router/issues/3331
          // 不是重定向类型的中断或者前一个路由不是初始路由则将路由状态标记为已准备
          // 并遍历所有的准备阶段错误回调函数执行

          // 初始导航下的重定向中断类型不会走该逻辑
          // 之所以要排除重定向类型的中断，是因为当在路由守卫中调用next("xxx")时（比如未登录跳转到登录页），
          // 在执行confirmTransition时会进行重定向并抛出一个重定向的中断错误
          // 这种情况下，如果不排除的话，会调用由onReady传入的错误回调，并把状态标记为已准备好的状态
          // 而实际上对于重定向，路由的状态应该由重定向后的路由去处理，同时也不应该执行准备阶段的错误
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
      // 如果错误是一个普通错误，不是导航类型的错误
      if (!isNavigationFailure(err) && isError(err)) {
        if (this.errorCbs.length) { // 遍历错误回调并执行
          this.errorCbs.forEach(cb => {
            cb(err)
          })
        } else { // 没有传错误回到则提醒并在控制台打印出错误
          if (process.env.NODE_ENV !== 'production') {
            warn(false, 'uncaught error during route navigation:')
          }
          console.error(err)
        }
      }
      // 无论啥错误都会执行中断回调
      onAbort && onAbort(err)
    }
    // matched是一个匹配中的数组，按照父子嵌套关系从外到内依次排列
    // 最后一个元素即为完全匹配中的路由记录
    const lastRouteIndex = route.matched.length - 1 // 目标路由中最后一个匹配中的路由
    const lastCurrentIndex = current.matched.length - 1 // 目前匹配中的最后一个路由
    if (
      isSameRoute(route, current) && // 相同路由
      // in the case the route map has been dynamically appended to
      lastRouteIndex === lastCurrentIndex && // 两个路由层级深度一致
      route.matched[lastRouteIndex] === current.matched[lastCurrentIndex] // 两个路由最终指向同一个路由记录
    ) {
      this.ensureURL() // 确保URL与路由一致
      if (route.hash) { // 有hash值则进行滚动定位，跳转到指定的锚点
        handleScroll(this.router, current, route, false)
      }
      // 中止导航并创建一个导航重复的错误
      return abort(createNavigationDuplicatedError(current, route))
    }

    // 获取要更新、激活和失活的路由
    const { updated, deactivated, activated } = resolveQueue(
      this.current.matched,
      route.matched
    )

    // 提取并合并导航守卫队列
    const queue: Array<?NavigationGuard> = [].concat(
      // in-component leave guards
      extractLeaveGuards(deactivated), // 失活组件的离开守卫：beforeRouteLeave
      // global before hooks
      this.router.beforeHooks, // 全局的前置守卫 beforeEach
      // in-component update hooks
      extractUpdateHooks(updated), // 复用组件的更新守卫 beforeRouteUpdate
      // in-config enter guards
      activated.map(m => m.beforeEnter), // 激活路由配置里的独享进入守卫 beforeEnter
      // async components
      resolveAsyncComponents(activated) // 激活的异步组件解析
    )

    // 迭代器函数，用于执行守卫函数
    const iterator = (hook: NavigationGuard, next) => {
      // 检查当前处理的路由是否与传入的route一致，不一致则中止导航
      // 这是为了确保导航过程中的正确性，防止比如因异步导航守卫引起的竞态条件问题，
      // 避免前一次导航守卫对新的导航产生影响，保证导航的可靠性
      // 比如routeA->routeB尚未完成时，又发起了新的导航routeB->routeC，此时前一次导航守卫继续运行
      // 并试图调用next回调，但此时的导肮的目标已经发生了改变了
      if (this.pending !== route) { 
        return abort(createNavigationCancelledError(current, route))
      }
      try {
        // 使用hookName: (to, from, next)
        // 执行守卫，接收目标路由，当前路由和下一步执行的行数
        hook(route, current, (to: any) => {
          if (to === false) { // 调用了next(false)，表示要中止导航
            // next(false) -> abort navigation, ensure current URL
            // 确保导航，如果浏览器的URL改变了（可能是手动或者浏览器后退），那么会重置到current路由对应的地址
            this.ensureURL(true) 
            abort(createNavigationAbortedError(current, route)) // 中止导航
          } else if (isError(to)) { // next函数传入了错误对象
            this.ensureURL(true)
            abort(to) // 中止导航
          } else if (
            typeof to === 'string' ||
            (typeof to === 'object' &&
              (typeof to.path === 'string' || typeof to.name === 'string'))
          ) { // 如果next传入的是字符串或者含有path或name属性的对象，则进行重定向
            // next('/') or next({ path: '/' }) -> redirect
            // 创建一个重定向类型的导航中断错误
            abort(createNavigationRedirectedError(current, route))
            // 开始一个新的导航
            if (typeof to === 'object' && to.replace) { // 如果传入next是一个包含replace:true选项的对象
              this.replace(to) // 执行replace方法，重定向到to
            } else {
              this.push(to) // 导航到新的to
            }
          } else { 
            // 传入的是其它的值，则执行next回调
            // 此时会继续执行队列中的下一个守卫或钩子
            // confirm transition and pass on the value
            next(to)
          }
        })
      } catch (e) { // 执行期间发生错误
        abort(e)
      }
    }

    // 依次执行导航守卫队列，队列中每个守卫会传递给iterator执行
    runQueue(queue, iterator, () => {
      // 所有quque执行完成后，执行下方的逻辑

      // 等异步组件路由组件解析完成后再开始执行组件内部的进入守卫
      // wait until async components are resolved before
      // extracting in-component enter guards
      const enterGuards = extractEnterGuards(activated) // 提取激活组件内部的beforeRouteEnter守卫
      const queue = enterGuards.concat(this.router.resolveHooks) // 提取全局解析守卫beforeResolve拼接在后面

      // 执行全局的beforeRouteEnter和beforeResolve守卫
      runQueue(queue, iterator, () => {
        if (this.pending !== route) { // 确保当前处理的路由没有发生变化
          return abort(createNavigationCancelledError(current, route))
        }
        this.pending = null // 重置当前等待处理的路由，表示此时导航已被确认
        // 导航确认完成回调
        // 回调中会调用全局的afterEach守卫
        // 更新当前路由，出发DOM更新
        onComplete(route)

        // 调用组件内的beforeRouteEnter守卫传递给next的回调函数
        // 该函数会将当前组件实例作为参数传入
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

/**
 * 解析路由队列，用于比较当前路由记录和下一个路由记录，找出更新、激活和失活的路由
 * @param current 当前的路由记录数组
 * @param next 下一个路由记录数组
 * @returns 返回一个对象，包含更新、激活和失活的路由记录数组
 */
function resolveQueue (
  current: Array<RouteRecord>,
  next: Array<RouteRecord>
): {
  updated: Array<RouteRecord>,
  activated: Array<RouteRecord>,
  deactivated: Array<RouteRecord>
} {
  let i
  const max = Math.max(current.length, next.length)// 获取两个数组的最大长度，用于后续循环比较
  // 遍历数组，找出第一个不相同的路由记录索引
  for (i = 0; i < max; i++) {
    // 当前索引的路由记录不相同，跳出循环
    if (current[i] !== next[i]) {
      break
    }
  }
  // 根据找到的i索引获取更新、激活和失活的路由记录数组
  return {
    // 当前索引之前的路由记录为更新的路由
    updated: next.slice(0, i),
    // 当前索引之后的next数组为新激活的路由
    activated: next.slice(i),
    // 当前索引之后的current数组为失活的路由
    deactivated: current.slice(i)
  }
}
// 从路由记录中提取特定类型的导航守卫，并对这些导航守卫进行绑定处理
function extractGuards (
  records: Array<RouteRecord>, // 一个包含多个路由记录的数组
  name: string, // 要提取的导航守卫的名称，如beforeRouteEnter
  bind: Function, // 绑定函数，用于将导航守卫与组件实例、匹配对象、键值进行绑定
  reverse?: boolean // 是否反转提取的顺序
): Array<?Function> {
  // 遍历所有的路由记录的components中的组件，执行给定的处理函数
  // 返回
  const guards = flatMapComponents(records, (def, instance, match, key) => {
    const guard = extractGuard(def, name) //  从组件构造函数中提取导航守卫

    // 将提取到的守卫绑定到对应的组件实例中
    // 传入的参数依次为match:当前的路由, key:命名视图的名称
    if (guard) { 
      return Array.isArray(guard)
        ? guard.map(guard => bind(guard, instance, match, key))
        : bind(guard, instance, match, key)
    }
  })
  // 根据是否需要反转顺序，返回拍平后的守卫数组
  // flatMapComponents已经做了一次扁平化处理，这里之所以再做一次处理是因为
  // 组件内的路由导航守卫的选项合并策略是转为数组，因此flatMapComponents处理后仍然可能包含数组
  // 详情见/install.js中关于路由导航守卫的选项合并处理部分
  return flatten(reverse ? guards.reverse() : guards)
}
// 提取相关的导航守卫
function extractGuard (
  def: Object | Function, // Vue组件选项对象或Vue组件构造函数
  key: string // 要提取的导航守卫名称
): NavigationGuard | Array<NavigationGuard> {
  if (typeof def !== 'function') { 
    // 不是函数则将其扩展为Vue组件构造函数
    // 确保了全局混入能够应用到该组件上，从而正常提取
    // extend now so that global mixins are applied.
    def = _Vue.extend(def)
  }
  // 提取守卫，其结果为一个函数数组或函数数组
  return def.options[key]
}

// 提取失活的组件的beforeRouteLeave钩子，该钩子是反向执行，也就是从里到外的执行
function extractLeaveGuards (deactivated: Array<RouteRecord>): Array<?Function> {
  return extractGuards(deactivated, 'beforeRouteLeave', bindGuard, true)
}
// 提取更新组件的beforeRouteUpdate钩子
function extractUpdateHooks (updated: Array<RouteRecord>): Array<?Function> {
  return extractGuards(updated, 'beforeRouteUpdate', bindGuard)
}

// 路由导航守卫绑定函数
// 将导航守卫绑定到组件实例上
function bindGuard (guard: NavigationGuard, instance: ?_Vue): ?NavigationGuard {
  if (instance) {
    // 返回的绑定函数绑定到了instance上，并接收外部所有参数的参数（to,from,next）
    return function boundRouteGuard () {
      return guard.apply(instance, arguments)
    }
  }
}

// 提取激活组件内的beforeRouteEnter导航守卫
// 并进行实例的绑定
function extractEnterGuards (
  activated: Array<RouteRecord>
): Array<?Function> {
  return extractGuards(
    activated,
    'beforeRouteEnter',
    (guard, _, match, key) => { // 绑定函数
      return bindEnterGuard(guard, match, key) // 绑定
    }
  )
}

// 组件内的beforeRouteEnter绑定函数
function bindEnterGuard (
  guard: NavigationGuard,
  match: RouteRecord,
  key: string
): NavigationGuard {
  // 返回一个新的导航守卫函数
  return function routeEnterGuard (to, from, next) {
    // 函数执行时会执行原始的导航守卫
    // 并用一个自定义的回调函数包裹next函数
    return guard(to, from, cb => {
      // 新的next函数被执行后，会将传递给next
      // 处理next(vm => {})的情况
      // 如果next方法传入了回调函数，则将其保存到enteredCbs中，在导航被确认以后执行
      // 由于导航守卫每次执行都会存储这些回调，所以后续在调用这些回调时，要清空
      if (typeof cb === 'function') {
        if (!match.enteredCbs[key]) {
          match.enteredCbs[key] = []
        }
        match.enteredCbs[key].push(cb)
      }
      // 执行next函数
      next(cb)
    })
  }
}
