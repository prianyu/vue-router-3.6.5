import { computed, unref } from 'vue' // 导入Vue的computed和unref函数
import { guardEvent } from '../components/link' // 导入guardEvent函数
import { throwNoCurrentInstance } from './utils' // 导入throwNoCurrentInstance函数
import { useRouter, useRoute } from './globals' // 导入useRouter和useRoute函数

/**
 * 检查一个对象是否包含另一个对象中的所有参数
 * @param {Object} outer 包含对象
 * @param {Object} inner 被包含对象
 */
function includesParams (outer, inner) {
  for (const key in inner) { // 遍历内部对象的所有键
    const innerValue = inner[key]
    const outerValue = outer[key]
    if (typeof innerValue === 'string') { 
      // 字符串则直接比较，不相等，则返回false
      if (innerValue !== outerValue) return false
    } else { // 如果不是字符串
      if (
        !Array.isArray(outerValue) || // 如果外部对象当前键对应的值不是数组
        outerValue.length !== innerValue.length || // 是数组但长度不同
        innerValue.some((value, i) => value !== outerValue[i]) // 存在不相等的元素
      ) {
        return false // 返回false
      }
    }
  }

  return true // 否则返回true
}
// helpers from vue router 4
/**
 * 比较两个路由位置参数的值是否相同
 * @param {*} a 参数值a
 * @param {*} b 参数值b
 * @returns {boolean} 如果参数值相同，则返回true；否则返回false
 */
function isSameRouteLocationParamsValue (a, b) {
  return Array.isArray(a) // 如果a是数组
    ? isEquivalentArray(a, b) // 则比较a数组与b是否等价
    : Array.isArray(b) // 如果b是数组
      ? isEquivalentArray(b, a) // 则比较b数组与a是否等价
      : a === b // 否则直接比较a和b是否相等
}

/**
 * 检查两个数组是否等价
 * @param {Array} a 数组a
 * @param {Array} b 要比较对象b
 * @returns {boolean} 如果数组等价，则返回true；否则返回false
 */
function isEquivalentArray (a, b) {
  return Array.isArray(b) // 如果b是数组
    ? a.length === b.length && a.every((value, i) => value === b[i]) // 则检查两个数组长度是否相等且所有元素都相等
    : a.length === 1 && a[0] === b // 否则检查a是否只有一个元素且该元素等于b
}

/**
 * 比较两个路由位置参数是否相同
 * @param {Object} a 参数a
 * @param {Object} b 参数b
 * @returns {boolean} 如果路由位置参数相同，则返回true；否则返回false
 */
export function isSameRouteLocationParams (a, b) {
  if (Object.keys(a).length !== Object.keys(b).length) return false // 如果两个对象的键数量不同，则返回false
  for (const key in a) { // 遍历第一个对象的所有键
    if (!isSameRouteLocationParamsValue(a[key], b[key])) return false // 如果键对应的值不等价，则返回false
  }
  return true // 否则返回true
}

/**
 * 创建一个用于处理Vue Router链接的自定义钩子
 * @param {Object} props 钩子函数的属性对象
 * @returns {Object} 包含链接相关信息和导航函数的对象
 */
export function useLink (props) {
  // 检查是否有vue实例
  if (process.env.NODE_ENV !== 'production') {
    throwNoCurrentInstance('useLink') 
  }
  const router = useRouter() // 获取当前路由器实例
  const currentRoute = useRoute() // 获取当前路由实例
  const resolvedRoute = computed(() => router.resolve(unref(props.to), currentRoute)) // 计算解析后的目标路由
  const activeRecordIndex = computed(() => { // 计算活动记录索引
    const route = resolvedRoute.value.route // 获取解析后的路由信息
    const { matched } = route // 获取匹配的路由记录
    const { length } = matched // 获取匹配记录的长度
    const routeMatched = matched[length - 1] // 获取最后一个匹配的路由记录
    const currentMatched = currentRoute.matched // 获取当前路由的匹配记录
    if (!routeMatched || !currentMatched.length) return -1 // 如果没有匹配记录或当前路由没有匹配记录，则返回-1
    const index = currentMatched.indexOf(routeMatched) // 查找最后一个匹配的路由记录在当前路由匹配记录中的索引
    if (index > -1) return index // 如果找到了，则返回索引
    const parentRecord = currentMatched[currentMatched.length - 2] // 获取倒数第二个匹配的路由记录（父级记录）
    return (
      length > 1 && // 如果匹配记录长度大于1
      parentRecord && parentRecord === routeMatched.parent // 并且最后一个匹配的路由记录的父级与倒数第二个匹配的路由记录相同
    )
  })
  const isActive = computed( // 计算是否处于激活状态
    () =>
      activeRecordIndex.value > -1 && // 如果活动记录索引大于-1
      includesParams(currentRoute.params, resolvedRoute.value.route.params) // 并且当前路由参数包含解析后路由参数，则返回true
  )
  const isExactActive = computed( // 计算是否精确处于激活状态
    () =>
      activeRecordIndex.value > -1 && // 如果活动记录索引大于-1
      activeRecordIndex.value === currentRoute.matched.length - 1 && // 并且活动记录索引等于当前路由匹配记录长度减1
      isSameRouteLocationParams(currentRoute.params, resolvedRoute.value.route.params) // 并且当前路由参数与解析后路由参数相同，则返回true
  )
  const navigate = e => { // 导航函数
    const href = resolvedRoute.value.route // 获取解析后的路由信息
    if (guardEvent(e)) { // 如果事件被允许
      return props.replace // 如果属性replace为true
        ? router.replace(href) // 则替换当前路由
        : router.push(href) // 否则跳转到新路由
    }
    return Promise.resolve() // 否则返回一个已解决的Promise
  }
  return { // 返回包含链接相关信息和导航函数的对象
    href: computed(() => resolvedRoute.value.href), // 解析后路由的href
    route: computed(() => resolvedRoute.value.route), // 解析后路由的信息
    isExactActive, // 是否精确处于激活状态
    isActive, // 是否处于激活状态
    navigate // 导航函数
  }
}