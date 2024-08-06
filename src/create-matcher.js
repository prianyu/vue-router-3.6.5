/* @flow */

import type VueRouter from './index'
import { resolvePath } from './util/path'
import { assert, warn } from './util/warn'
import { createRoute } from './util/route'
import { fillParams } from './util/params'
import { createRouteMap } from './create-route-map'
import { normalizeLocation } from './util/location'
import { decode } from './util/query'

export type Matcher = {
  match: (raw: RawLocation, current?: Route, redirectedFrom?: Location) => Route;
  addRoutes: (routes: Array<RouteConfig>) => void;
  addRoute: (parentNameOrRoute: string | RouteConfig, route?: RouteConfig) => void;
  getRoutes: () => Array<RouteRecord>;
};
// 创建路由匹配器
// 1. 创建pathList,pathMap，nameMap相关的路由映射对象
// 2. 返回一个包含addRoute, addRoutes, getRoutes和match方法的对象用于管理路由
export function createMatcher (
  routes: Array<RouteConfig>,
  router: VueRouter
): Matcher {
  // 创建路由映射对象
  const { pathList, pathMap, nameMap } = createRouteMap(routes)
  // console.log(pathList, pathMap, nameMap)

  // 动态添加多个路由，修改路由映射对象
  function addRoutes (routes) {
    createRouteMap(routes, pathList, pathMap, nameMap)
  }

  /**
   *  添加路由记录
   * @param {string | RouteConfig} parentOrRoute 父级路由的name或者要添加的路由配置
   * @param {RouteConfig} route 路由配置
   */
  function addRoute (parentOrRoute, route) {
    // 获取父级路由，当第一个参数不是RouteConfig时则认为是父级路由的名称
    const parent = (typeof parentOrRoute !== 'object') ? nameMap[parentOrRoute] : undefined
    // $flow-disable-line
    // 创建/修改pathList, pathMap, nameMap
    createRouteMap([route || parentOrRoute], pathList, pathMap, nameMap, parent)

    // add aliases of parent
    // 如果有父级路由且父路由有别名路由，则创建子路由的别名路由
    if (parent && parent.alias.length) {
      createRouteMap(
        // $flow-disable-line route is defined if parent is
        parent.alias.map(alias => ({ path: alias, children: [route] })), // 遍历所有的别名并添加
        pathList,
        pathMap,
        nameMap,
        parent
      )
    }
  }

  // 获取路由列表
  // 根据路由路径列表从路由映射表中获取后返回
  function getRoutes () {
    return pathList.map(path => pathMap[path])
  }

  // 路由匹配，解析目标位置，返回一个匹配的路由对象
  function match (
    raw: RawLocation, // 要匹配的原始位置信息
    currentRoute?: Route, // 当前路由
    redirectedFrom?: Location // 重定向来源
  ): Route {
    // 规范化为标准的location对象，包含以下可选属性：path，name，hash，query， params，append
    const location = normalizeLocation(raw, currentRoute, false, router) 
    const { name } = location // 目标位置的名称

    if (name) { // 按名称查找路由
      const record = nameMap[name] // 获取命名路由
      // 命名路由不存在，输出警告并返回一个默认的路由对象
      if (process.env.NODE_ENV !== 'production') { 
        warn(record, `Route with name '${name}' does not exist`)
      }
      if (!record) return _createRoute(null, location)

      // 获取目标位置的参数
      // 从路由记录的正则匹配结果中提取必须的参数名
      const paramNames = record.regex.keys
        .filter(key => !key.optional)
        .map(key => key.name)

      // 确保location.params是一个对象
      if (typeof location.params !== 'object') {
        location.params = {}
      }

      // 如果当前路由有params参数，且匹配的路由对应的必要参数没设置
      // 则将其合并到location.params中
      if (currentRoute && typeof currentRoute.params === 'object') {
        for (const key in currentRoute.params) {
          if (!(key in location.params) && paramNames.indexOf(key) > -1) {
            location.params[key] = currentRoute.params[key]
          }
        }
      }

      // 在路径中填充参数
      location.path = fillParams(record.path, location.params, `named route "${name}"`)
      return _createRoute(record, location, redirectedFrom) // 创建并返回新的路由对象
    } else if (location.path) { // 按路径查找路由
      location.params = {}
      // 遍历路由路径映射列表，查找匹配的路径
      for (let i = 0; i < pathList.length; i++) {
        const path = pathList[i]
        const record = pathMap[path]
        // 检查路径是否匹配，匹配时会将匹配的参数提取到params对象中
        // 如果匹配成功则将参则创建路由对象并返回
        if (matchRoute(record.regex, location.path, location.params)) {
          return _createRoute(record, location, redirectedFrom)
        }
      }
    }
    // no match
    // 匹配不到任何路由则创建默认路由对象返回
    return _createRoute(null, location)
  }

  // 路由重定向，支持静态路径、动态路径（函数）和命名路由三种方式进行重定向
  function redirect (
    record: RouteRecord, // 当前的路由记录
    location: Location // 当前的位置对象，包含path，query，hash等信息
  ): Route {
    const originalRedirect = record.redirect // 获取redirect配置
    // 是函数则创建一个路由对象作为参数调用
    let redirect = typeof originalRedirect === 'function'
      ? originalRedirect(createRoute(record, location, null, router))
      : originalRedirect

      // redirect是字符串，将redirect被转成了含path属性的对象
    if (typeof redirect === 'string') {
      redirect = { path: redirect }
    }

    // redirect不是对象，则输出警告并返回默认路由对象
    if (!redirect || typeof redirect !== 'object') {
      if (process.env.NODE_ENV !== 'production') {
        warn(
          false, `invalid redirect option: ${JSON.stringify(redirect)}`
        )
      }
      return _createRoute(null, location)
    }

    const re: Object = redirect
    const { name, path } = re
    let { query, hash, params } = location
    // 优先使用redirect的query、hash和params
    query = re.hasOwnProperty('query') ? re.query : query
    hash = re.hasOwnProperty('hash') ? re.hash : hash
    params = re.hasOwnProperty('params') ? re.params : params

    if (name) { // 名称方式的跳转
      // resolved named direct
      const targetRecord = nameMap[name]
      if (process.env.NODE_ENV !== 'production') { // 没有对应的命名路由
        assert(targetRecord, `redirect failed: named route "${name}" not found.`)
      }
      // 返回使用命名路由创建的路由对象
      return match({
        _normalized: true,
        name,
        query,
        hash,
        params
      }, undefined, location)
    } else if (path) { // 使用path重定向
      // 1. resolve relative redirect 转为绝对路径
      const rawPath = resolveRecordPath(path, record)
      // 2. resolve params 处理并填充参数
      const resolvedPath = fillParams(rawPath, params, `redirect route with path "${rawPath}"`)
      // 3. rematch with existing query and hash
      // 使用路径和查询参数等生成路由对象返回
      return match({
        _normalized: true,
        path: resolvedPath,
        query,
        hash
      }, undefined, location)
    } else { // 既没有name也没有path则输出警告并返回未匹配的路由对象
      if (process.env.NODE_ENV !== 'production') {
        warn(false, `invalid redirect option: ${JSON.stringify(redirect)}`)
      }
      return _createRoute(null, location)
    }
  }

  // 处理路由别名，将当前路径替换为指定的命名路径
  function alias (
    record: RouteRecord,
    location: Location,
    matchAs: string
  ): Route {
    // 给路径填充参数
    const aliasedPath = fillParams(matchAs, location.params, `aliased route with path "${matchAs}"`)
    // 按路径查找路由并生成路由对象
    const aliasedMatch = match({
      _normalized: true,
      path: aliasedPath
    })
    // 如果匹配到了路由，将最后一个匹配记录作为别名记录，并更新params
    if (aliasedMatch) {
      const matched = aliasedMatch.matched
      const aliasedRecord = matched[matched.length - 1] // 获取匹配到最后一个记录
      location.params = aliasedMatch.params // 更新路由参数
      // 以匹配到的路由和当前的路径别名为基础信息构建一个新的路由对象
      return _createRoute(aliasedRecord, location)
    }
    // 没有匹配到则创建一个默认的路由对象
    return _createRoute(null, location)
  }

  // 根据路由记录创建新的路由对象，在必要时进行重定向或别名处理
  function _createRoute (
    record: ?RouteRecord,
    location: Location,
    redirectedFrom?: Location
  ): Route {
    // 路由中设置了redirect属性，则执行redirect函数
    if (record && record.redirect) {
      return redirect(record, redirectedFrom || location)
    }
    // 路由中有matchAs属性，则说明是别名路由，执行alias函数
    if (record && record.matchAs) {
      return alias(record, location, record.matchAs)
    }
    // record为null、不是别名路由、没有redirect选项
    // 则创建新的路由对象并返回
    return createRoute(record, location, redirectedFrom, router)
  }

  return {
    match,
    addRoute,
    getRoutes,
    addRoutes
  }
}
// 检查给定的路径是否匹配路由的正表达式
// 并在匹配时将路由参数提取到params对象中
function matchRoute (
  regex: RouteRegExp, // 路由对象的正则表达式
  path: string, // 要匹配的路径
  params: Object // 用于存储匹配到的路径参数的对象
): boolean {
  const m = path.match(regex) // 匹配路径

  if (!m) { // 不匹配返回false
    return false
  } else if (!params) { // 匹配但不需要提取参数则直接返回true
    return true
  }

  // 提取参数（0索引时完整的匹配字符串）
  for (let i = 1, len = m.length; i < len; ++i) {
    const key = regex.keys[i - 1] // 参数名称
    if (key) {
      // Fix #1994: using * with props: true generates a param named 0
      // 将匹配到的参数值解码并存储到params对象中
      // 当使用通配符路径时，key.name不存在，在配置了props:true时，会生成一个名称为0的prop
      // 因此给一个统一的名称pathMatch避免此问题
      params[key.name || 'pathMatch'] = typeof m[i] === 'string' ? decode(m[i]) : m[i]
    }
  }

  // 返回匹配成功
  return true
}

// 将路由记录的相对转为转为绝对路径
function resolveRecordPath (path: string, record: RouteRecord): string {
  return resolvePath(path, record.parent ? record.parent.path : '/', true)
}
