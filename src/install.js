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
    // 如果父虚拟节点上有registerRouteInstance方法（RouterView组件），则调用该方法进行实例注册
    // registerRouteInstance方法是RouterView组件定义在data上的方法，用于注册和销毁vue实例组件
    // 该方法接收两个参数（vm, val)
    // 当vm与当前路由匹配到的实例不一致则将当前设置成val（注册）
    // 当vm与当前路由匹配到的实例一致，且val为undefined也将当前设置成val（销毁）
    if (isDef(i) && isDef(i = i.data) && isDef(i = i.registerRouteInstance)) {
      i(vm, callVal)
    }
  }

  // 混入beforeCreate钩子和destroyed钩子
  Vue.mixin({
    beforeCreate () {
      if (isDef(this.$options.router)) { // 配置了router选项的路由根组件
        this._routerRoot = this // 保存当前实例到_routerRoot属性
        this._router = this.$options.router // 保存router实例到_router属性
        // 初始化router实例
        // 将当前实例添加到路由的应用列表、添加路由事件监听、处理滚动等
        this._router.init(this)
        // 在Vue实例上添加响应式属性_route，其初始值是router实例的当前历史记录所在的位置
        // 该属性在路由发生变化时会更新，从而触发组件的更新，重新渲染页面
        Vue.util.defineReactive(this, '_route', this._router.history.current)
      } else { // 没有传入router选项的非路由根组件
        // 添加_routeRoot属性，如果当前实例没有父实例，则指向当前实例本身，否则指向父实例的_routerRoot属性
        // 由于beforeCreate钩子的执行是先执行父组件的钩子，再执行子组件的钩子
        // 所以这里会逐级向上查找，直到找到_routerRoot属性
        this._routerRoot = (this.$parent && this.$parent._routerRoot) || this
      }
      // 注册当前实例到路由里，将router-view组件与当前实例进行关联
      registerInstance(this, this)
    },
    destroyed () { // 从路由匹配实例中移除当前的实例，取消与router-view组件的关联
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
  // 这里会涉及到后续提取组件的导航守卫时的扁平化处理逻辑
  strats.beforeRouteEnter = strats.beforeRouteLeave = strats.beforeRouteUpdate = strats.created
}
