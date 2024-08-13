import {
  getCurrentInstance, // 用于获取当前Vue实例
  shallowReactive, // 用于创建一个浅响应式对象
  effectScope // 用于创建一个作用域来管理副作用
} from 'vue'
import { throwNoCurrentInstance } from './utils' // 用于在没有当前实例的情况下抛出错误

// 该函数用于获取当前Vue实例的根组件中的$router对象
// 在非生产环境下，如果调用该函数时没有当前实例，会抛出一个错误
export function useRouter () {
  // 在开发环境下检查是否有当前实例
  if (process.env.NODE_ENV !== 'production') {
    throwNoCurrentInstance('useRouter')
  }

  // 返回当前实例的根组件中的$router对象
  return getCurrentInstance().proxy.$root.$router
}

// 该函数用于获取当前路由对象，并将其变为响应式的
export function useRoute () {
  // 在开发环境下检查是否有当前实例
  if (process.env.NODE_ENV !== 'production') {
    throwNoCurrentInstance('useRoute')
  }

  const root = getCurrentInstance().proxy.$root // 获取根组件实例
  // 如果根组件上还没有_$route属性，则创建一个新的响应式路由对象
  if (!root._$route) {
    // 使用effectScope创建一个新的作用域，并在其内部创建一个响应式对象
    const route = effectScope(true).run(() =>
      shallowReactive(Object.assign({}, root.$router.currentRoute))
    )
    root._$route = route // 将新的响应式路由对象赋值给根组件的_$route属性

    // 设置路由守卫，当路由变化时更新响应式路由对象
    root.$router.afterEach(to => {
      Object.assign(route, to)
    })
  }

  // 返回根组件上的响应式路由对象
  return root._$route
}