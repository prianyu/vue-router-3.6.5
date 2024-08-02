/* @flow */

import type VueRouter from '../index'
import { stringifyQuery } from './query'

const trailingSlashRE = /\/?$/

export function createRoute (
  record: ?RouteRecord,
  location: Location,
  redirectedFrom?: ?Location,
  router?: VueRouter
): Route {
  const stringifyQuery = router && router.options.stringifyQuery

  let query: any = location.query || {}
  try {
    query = clone(query)
  } catch (e) {}

  const route: Route = {
    name: location.name || (record && record.name),
    meta: (record && record.meta) || {},
    path: location.path || '/',
    hash: location.hash || '',
    query,
    params: location.params || {},
    fullPath: getFullPath(location, stringifyQuery),
    matched: record ? formatMatch(record) : []
  }
  if (redirectedFrom) {
    route.redirectedFrom = getFullPath(redirectedFrom, stringifyQuery)
  }
  return Object.freeze(route)
}

function clone (value) {
  if (Array.isArray(value)) {
    return value.map(clone)
  } else if (value && typeof value === 'object') {
    const res = {}
    for (const key in value) {
      res[key] = clone(value[key])
    }
    return res
  } else {
    return value
  }
}

// the starting route that represents the initial state
export const START = createRoute(null, {
  path: '/'
})

function formatMatch (record: ?RouteRecord): Array<RouteRecord> {
  const res = []
  while (record) {
    res.unshift(record)
    record = record.parent
  }
  return res
}

function getFullPath (
  { path, query = {}, hash = '' },
  _stringifyQuery
): string {
  const stringify = _stringifyQuery || stringifyQuery
  return (path || '/') + stringify(query) + hash
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
