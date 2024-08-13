import { getCurrentInstance, onUnmounted } from 'vue'
import { throwNoCurrentInstance } from './utils'
import { useRouter } from './globals'

/**
 * 定义了Vue 3的组合式API函数onBeforeRouteUpdate和onBeforeRouteLeave，
 * 用于在路由变化时执行特定的守卫逻辑。
onBeforeRouteUpdate(guard):注册一个守卫，在当前路由组件复用且路由参数或查询改变时调用,
    当路由更新且匹配深度相同的情况下触发。
onBeforeRouteLeave(guard):注册一个守卫，在离开当前路由组件时调用,
 当离开当前路由组件或路由变化导致深度减少时触发。
*/


/**
 * 在路由更新之前执行的钩子函数
 * @param {Function} guard - 用户定义的守卫函数
 * @returns {Function} - 返回一个取消守卫的函数
 */
export function onBeforeRouteUpdate (guard) {
  // 检测是否有Vue实例
  if (process.env.NODE_ENV !== 'production') {
    throwNoCurrentInstance('onBeforeRouteUpdate')
  }

  return useFilteredGuard(guard, isUpdateNavigation)
}

/**
 * 判断是否是更新导航
 * @param {Route} to - 目标路由
 * @param {Route} from - 当前路由
 * @param {number} depth - 路由深度
 * @returns {boolean} - 是否是更新导航
 */
function isUpdateNavigation (to, from, depth) {
  const toMatched = to.matched
  const fromMatched = from.matched
  return (
    toMatched.length >= depth &&
    toMatched
      .slice(0, depth + 1)
      .every((record, i) => record === fromMatched[i])
  )
}

/**
 * 判断是否是离开导航
 * @param {Route} to - 目标路由
 * @param {Route} from - 当前路由
 * @param {number} depth - 路由深度
 * @returns {boolean} - 是否是离开导航
 */
function isLeaveNavigation (to, from, depth) {
  const toMatched = to.matched
  const fromMatched = from.matched
  return toMatched.length < depth || toMatched[depth] !== fromMatched[depth]
}

/**
 * 在路由离开之前执行的钩子函数
 * @param {Function} guard - 用户定义的守卫函数
 * @returns {Function} - 返回一个取消守卫的函数
 */
export function onBeforeRouteLeave (guard) {
  if (process.env.NODE_ENV !== 'production') {
    throwNoCurrentInstance('onBeforeRouteLeave')
  }

  return useFilteredGuard(guard, isLeaveNavigation)
}

const noop = () => {}

/**
 * 使用过滤后的守卫函数
 * @param {Function} guard - 用户定义的守卫函数
 * @param {Function} fn - 判断是否应用守卫函数的逻辑
 * @returns {Function} - 返回一个取消守卫的函数
 */
function useFilteredGuard (guard, fn) {
  const instance = getCurrentInstance() // 获取当前Vue实例
  const router = useRouter() // 获取当前VueRouter实例

  let target = instance.proxy
  // 找到最近的RouterView以确定深度
  while (
    target &&
    target.$vnode &&
    target.$vnode.data &&
    target.$vnode.data.routerViewDepth == null
  ) {
    target = target.$parent
  }

  const depth =
    target && target.$vnode && target.$vnode.data
      ? target.$vnode.data.routerViewDepth
      : null

  if (depth != null) {
    const removeGuard = router.beforeEach((to, from, next) => {
      // 根据fn的执行结果判断是否定义守卫
      return fn(to, from, depth) ? guard(to, from, next) : next()
    })

    // 组件卸载时移除守卫函数
    onUnmounted(removeGuard)
    return removeGuard
  }

  // 没有获取到RouterView
  return noop
}