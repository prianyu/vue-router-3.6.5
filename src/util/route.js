/* @flow */

import type VueRouter from '../index'
import { stringifyQuery } from './query'

const trailingSlashRE = /\/?$/

// 创建路由对象（Route）
export function createRoute (
  record: ?RouteRecord, // 匹配到的路由记录
  location: Location, // 当前的位置对象，包含path，query，hash等信息
  redirectedFrom?: ?Location, // 从哪个位置重定向而来的
  router?: VueRouter // 路由器实例
): Route {
  // 获取查询字符串反解析函数
  const stringifyQuery = router && router.options.stringifyQuery

  // 拷贝生成查询对象
  let query: any = location.query || {} 
  try {
    query = clone(query)
  } catch (e) {}

  // 构建路由对象
  const route: Route = {
    name: location.name || (record && record.name), // 路由名称
    meta: (record && record.meta) || {}, // 路由元信息
    path: location.path || '/', // 路径
    hash: location.hash || '', // 哈希值
    query, // 查询对象
    params: location.params || {}, // 参数对象
    fullPath: getFullPath(location, stringifyQuery), // 完整路径，参数对象转字符串后和hash拼接在路径后面
    matched: record ? formatMatch(record) : [] // 从当前路由到根路由的所有路由记录数组
  }
  // 重定向来源的完整的路径
  if (redirectedFrom) {
    route.redirectedFrom = getFullPath(redirectedFrom, stringifyQuery)
  }
  // 返回冻结后的路由对象
  return Object.freeze(route)
}

// 深度克隆对象
function clone (value) {
  if (Array.isArray(value)) { // 数组，遍历并递归克隆
    return value.map(clone)
  } else if (value && typeof value === 'object') { // 对象，遍历并递归克隆
    const res = {}
    for (const key in value) {
      res[key] = clone(value[key])
    }
    return res
  } else { // 原始类型直接返回
    return value
  }
}

// the starting route that represents the initial state
export const START = createRoute(null, {
  path: '/'
})

// 获取从当前路由到根路由的所有路由组成的记录
// 顺序是从根到叶
function formatMatch (record: ?RouteRecord): Array<RouteRecord> {
  const res = []
  while (record) { // 从当前路由记录开始循环一直遍历到根路由记录
    res.unshift(record) // 将遍历到的路由记录压入到结果的开头
    record = record.parent // 继续往上走
  }
  return res
}

// 根据传入的位置信息获取完整的路径
function getFullPath (
  { path, query = {}, hash = '' },
  _stringifyQuery
): string {
  const stringify = _stringifyQuery || stringifyQuery // 参数字符串话的处理函数
  return (path || '/') + stringify(query) + hash // 将path、query、hash拼接后返回
}

/**
 * 判断两个路由对象是否相同
 * @param a 第一个路由对象
 * @param b 第二个路由对象，可以是null或undefined
 * @param onlyPath 是否只比较路径
 * @returns 返回两个路由对象是否相同
 */
export function isSameRoute (a: Route, b: ?Route, onlyPath: ?boolean): boolean {
  if (b === START) { // b是初始路由，则判断a是否也是初始路由
    return a === b;
  } else if (!b) { // b不存在或为空则返回false
    return false;
  } else if (a.path && b.path) { 
    // 如果两个路由对象都有路径，比较路径并根据onlyPath参数决定是否比较hash和query
    // path中已经包含了params的比较
    return a.path.replace(trailingSlashRE, '') === b.path.replace(trailingSlashRE, '') && (onlyPath ||
      a.hash === b.hash &&
      isObjectEqual(a.query, b.query));
 
  } else if (a.name && b.name) { 
    // 如果两个路由对象都有名称，比较名称并根据onlyPath参数决定是否比较hash、query和params
    return (
      a.name === b.name &&
      (onlyPath || (
        a.hash === b.hash &&
        isObjectEqual(a.query, b.query) &&
        isObjectEqual(a.params, b.params))
      )
    );
  } else {
    return false;
  }
}

// 判断两个对象是否相等（结构和值一致）
// null和undefined被认为相同
// 其它基本类型会被转为String比较
// 对象会递归后按照如上规则比较
function isObjectEqual (a = {}, b = {}): boolean {
  // handle null value #1566
  if (!a || !b) return a === b // null
  // 获取两个对象的所有key并排序
  const aKeys = Object.keys(a).sort()
  const bKeys = Object.keys(b).sort()
  // 如果key的长度不一样则返回false
  if (aKeys.length !== bKeys.length) {
    return false
  }
  // 遍历所有的key并比较，只有所有的比较都返回true则返回true
  return aKeys.every((key, i) => {
    const aVal = a[key]
    const bKey = bKeys[i]
    if (bKey !== key) return false // 同一个位置的key不一样，则返回false
    const bVal = b[key]
    // query values can be null and undefined
    if (aVal == null || bVal == null) return aVal === bVal // null或undefined的比较
    // check nested equality
    if (typeof aVal === 'object' && typeof bVal === 'object') { // 对象，递归比较
      return isObjectEqual(aVal, bVal)
    }
    return String(aVal) === String(bVal) // 转成string后比较
  })
}

export function isIncludedRoute (current: Route, target: Route): boolean {
  return (
    current.path.replace(trailingSlashRE, '/').indexOf(
      target.path.replace(trailingSlashRE, '/')
    ) === 0 &&
    (!target.hash || current.hash === target.hash) &&
    queryIncludes(current.query, target.query)
  )
}

function queryIncludes (current: Dictionary<string>, target: Dictionary<string>): boolean {
  for (const key in target) {
    if (!(key in current)) {
      return false
    }
  }
  return true
}

// 处理组件内部的beforeRouteEnter中传递给next函数的回调函数
export function handleRouteEntered (route: Route) {
  // 遍历匹配的路由记录
  for (let i = 0; i < route.matched.length; i++) {
    const record = route.matched[i]
    for (const name in record.instances) { // 遍历该路由记录下所有的组件实例
      const instance = record.instances[name]
      const cbs = record.enteredCbs[name] // 获取由beforeRouteEnter中传递给next函数的回调函数列表
      if (!instance || !cbs) continue
      // 由于每次调用beforeRouteEnter都会存储enteredCbs，所以调用后要删除
      // 详情见：src/history/base/bindEnterGuard
      delete record.enteredCbs[name] 
      for (let i = 0; i < cbs.length; i++) { 
        // 遍历所有回调，如果实例未被销毁，则传入当前实例并执行回调
        if (!instance._isBeingDestroyed) cbs[i](instance)
      }
    }
  }
}
