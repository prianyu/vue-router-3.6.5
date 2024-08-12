import { warn } from '../util/warn'
import { extend } from '../util/misc'
import { handleRouteEntered } from '../util/route'

export default {
  name: 'RouterView',
  functional: true, // 定义为函数式组件，即没有自身的实例上下文
  props: {
    name: {
      type: String,
      default: 'default'
    }
  },
  render (_, { props, children, parent, data }) {
    // -----------上下文初始化和处理----------------
    // used by devtools to display a router-view badge
    data.routerView = true // 给devtool使用的标记，也被用来计算深度

    // 由于RouterView是一个函数式组件，没有自己的状态和上下文（this），因此很多操作都是借助父节点来完成的
    // directly use parent context's createElement() function
    // so that components rendered by router-view can resolve named slots
    // 为了支持解析命名插槽，使用父节点的createElement方法
    const h = parent.$createElement // 父组件的createElement方法
    const name = props.name // 命名视图的名称
    const route = parent.$route // 当前路由，当路由更新时，会触发该值改变从而触发router-view组件重新渲染
    // 用于缓存已渲染的组件，用于在keep-alive被激活时取出缓存的组件
    const cache = parent._routerViewCache || (parent._routerViewCache = {}) 

    // ------------计算当前router-view组件的嵌套深度-------------------

    // determine current view depth, also check to see if the tree
    // has been toggled inactive but kept-alive.
    // 通过遍历父组件链来确定但概念的RouteView的深度，并检查是否处于keep-alive状态且被激活
    let depth = 0
    let inactive = false
    while (parent && parent._routerRoot !== parent) { // 遍历直至根元素
      const vnodeData = parent.$vnode ? parent.$vnode.data : {}
      if (vnodeData.routerView) {
        // 如果当前遍历到的组件的$vnode.data上有routerView属性
        // 则说明是RouterView属性
        // 则深度增加1
        depth++
      }
      // 如果父组件处理keep-alive且已经是失活状态
      // _directInactive代表组件是被直接被设置成失活的，而不是其父组件被设置成失活
      if (vnodeData.keepAlive && parent._directInactive && parent._inactive) {
        inactive = true // 标记当前RouteView组件为失活的
      }
      parent = parent.$parent
    }
    // 记录最后的深度
    data.routerViewDepth = depth

    // -------------keep-alive包裹下的渲染逻辑------------------

    // render previous view if the tree is inactive and kept-alive
    // 组件处于失活状态，则从缓存中获取组件并渲染
    if (inactive) {
      const cachedData = cache[name] // 获取缓存的数据
      const cachedComponent = cachedData && cachedData.component // 获取缓存的组件
      if (cachedComponent) {
        // #2301
        // pass props
        if (cachedData.configProps) { // 传递props
          fillPropsinData(cachedComponent, data, cachedData.route, cachedData.configProps)
        }
        return h(cachedComponent, data, children)
      } else { // 没有找到缓存的组件则直接返回一个空的虚拟节点
        // render previous empty view
        return h()
      }
    }

    // ----------------- 普通的渲染逻辑-----------------------
    const matched = route.matched[depth] // 获取匹配到的路由
    const component = matched && matched.components[name] // 根据视图命名（默认是default）获取匹配到的路由组件

    // render empty node if no matched route or no config component
    // 找不到对应的组件则渲染一个空的节点，并清空缓存
    if (!matched || !component) {
      cache[name] = null
      return h()
    }

    // cache component 缓存获取到的路由
    cache[name] = { component }

    // --------------VNode钩子定义------------------

    // attach instance registration hook
    // this will be called in the instance's injected lifecycle hooks
    // router-view组件与vue实例组件的关联与关联取消方法
    // 该函数在vue组件创建和销毁时负责在匹配到的路由记录中添加或移除vue组件
    data.registerRouteInstance = (vm, val) => {
      // val could be undefined for unregistration
      // 获取当前在matched.instances中注册的实例，name是匹配的路由名称
      const current = matched.instances[name]
      if (
        (val && current !== vm) || // 如果val存在且当前实例不是vm，则更新为val（注册）
        (!val && current === vm) // 如果val不存在且当前实例时vm，则更新为val（注销）
      ) {
        matched.instances[name] = val
      }
    }

    // also register instance in prepatch hook
    // in case the same component instance is reused across different routes
    // 当相同的组件在不同的路由之间复用时，也为路由记录绑定组件实例
    // 在data.hook.prepatch钩子中注册实例，该钩子在VNode更新前调用，接收旧VNode和新VNode两个参数
    // 该钩子在虚拟节点更新之前调用
    // _:旧的虚拟节点 vnode新的虚拟节点
    ;(data.hook || (data.hook = {})).prepatch = (_, vnode) => {
      matched.instances[name] = vnode.componentInstance // 将其更新成新的组件实例
    }

    // register instance in init hook
    // in case kept-alive component be actived when routes changed
    // 当keep-alive组件被激活时，也需要为路由记录绑定组件
    // data.hook.init方法在vnode被初次创建时调用
    data.hook.init = (vnode) => {
      if (vnode.data.keepAlive &&
        vnode.componentInstance &&
        vnode.componentInstance !== matched.instances[name]
      ) {
        matched.instances[name] = vnode.componentInstance
      }

      // if the route transition has already been confirmed then we weren't
      // able to call the cbs during confirmation as the component was not
      // registered yet, so we call it here.
      // @suspense
      handleRouteEntered(route)
    }

    // ---------处理props---------
    const configProps = matched.props && matched.props[name] // 获取对应命名视图中的props配置
    // save route and configProps in cache
    if (configProps) { // 配置了props
      // 将当前的route和configProps扩展到对应的缓存对象中
      extend(cache[name], {
        route,
        configProps
      })
      // 填充props
      fillPropsinData(component, data, route, configProps)
    }

    // 传入最终的data，渲染component组件
    return h(component, data, children)
  }
}

// 填充props
// 将route中的params填充到组件的props中
// 如果组件本身没有声明对应的props属性，则将其传递到组件的attrs中
function fillPropsinData (component, data, route, configProps) {
  // resolve props
  // 根据当前路由和configProps配置提取要传递的props
  let propsToPass = data.props = resolveProps(route, configProps) 
  if (propsToPass) { // 提取到了props
    // clone to prevent mutation
    propsToPass = data.props = extend({}, propsToPass) // 拷贝一个新的对象，防止原始的对象被修改
    // pass non-declared props as attrs
    // 确保只有在component中声明了的props属性才传递给组件
    // 未声明的转为attrs
    const attrs = data.attrs = data.attrs || {}
    for (const key in propsToPass) { // 遍历所有要传递的props
      if (!component.props || !(key in component.props)) { // 如果为在组件中声明
        attrs[key] = propsToPass[key] // 转为attrs的属性
        delete propsToPass[key] // 从props中删除
      }
    }
  }
}
// 根据配置的props类型，处理传递给组件的props
// route: 当前路由
// config: 路由props属性配置
function resolveProps (route, config) {
  switch (typeof config) {
    case 'undefined': // 没有配置则不设置
      return
    case 'object': // 对象则直接原样设置为组件的属性
      return config
    case 'function': // 函数则将当前路由作为参数传入调用
      return config(route)
    case 'boolean': // true则将当前路由的params对象作为属性设置
      return config ? route.params : undefined
    default: // 其它类型不支持
      if (process.env.NODE_ENV !== 'production') {
        warn(
          false,
          `props in "${route.path}" is a ${typeof config}, ` +
          `expecting an object, function or boolean.`
        )
      }
  }
}
