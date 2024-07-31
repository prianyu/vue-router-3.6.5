import View from './components/view'
import Link from './components/link'

// 全局的_Vue变量
// 用于登记安装时的Vue构造函数，与VueRouter关联
// 后续混入钩子，注册全局的组件等都是使用该构造器
export let _Vue

export function install (Vue) {
  // 已安装直接返回，未安装则标记未已安装
  if (install.installed && _Vue === Vue) return
  install.installed = true

  _Vue = Vue // 记录Vue构造函数，与VueRouter关联

  const isDef = v => v !== undefined

  // 注册路由实例
  const registerInstance = (vm, callVal) => {
    let i = vm.$options._parentVnode // 父虚拟节点
    // 如果父虚拟节点上有registerRouteInstance属性（RouterView组件），则调用该方法
    if (isDef(i) && isDef(i = i.data) && isDef(i = i.registerRouteInstance)) {
      i(vm, callVal)
    }
  }

  // 混入钩子
  Vue.mixin({
    beforeCreate () {
      if (isDef(this.$options.router)) { // 配置了router选项
        this._routerRoot = this // 保存当前实例到_routerRoot属性
        this._router = this.$options.router // 保存router实例到_router属性
        this._router.init(this) // 初始化router实例
        // 在Vue实例上添加响应式属性_route，其值是router实例的当前路由属性
        Vue.util.defineReactive(this, '_route', this._router.history.current)
      } else {
        // 没有传入router选项（如子组件）
        // 添加_routeRoot属性，如果当前实例没有父实例，则指向当前实例本身，否则指向父实例的_routerRoot属性
        // 由于beforeCreate钩子的执行是先执行父组件的钩子，再执行子组件的钩子
        // 所以这里会逐级向上查找，直到找到_routerRoot属性
        this._routerRoot = (this.$parent && this.$parent._routerRoot) || this
      }
      // 注册路由实例
      registerInstance(this, this)
    },
    destroyed () {
      registerInstance(this)
    }
  })

  // 在Vue原型上添加$router属性，其值是_routerRoot._router属性，即router实例
  Object.defineProperty(Vue.prototype, '$router', {
    get () { return this._routerRoot._router }
  })

  // 在Vue原型上添加$route属性，其值是_routerRoot._route属性，即当前的路由
  Object.defineProperty(Vue.prototype, '$route', {
    get () { return this._routerRoot._route }
  })

  // 注册全局的RouterView和RouterLink组件
  Vue.component('RouterView', View)
  Vue.component('RouterLink', Link)

  // 获取选项合并策略
  const strats = Vue.config.optionMergeStrategies
  // use the same hook merging strategy for route hooks
  // 添加路由钩子合并策略为与created合并策略相同
  // Vue created默认的合并策略是合并成数组并顺序执行
  strats.beforeRouteEnter = strats.beforeRouteLeave = strats.beforeRouteUpdate = strats.created
}
