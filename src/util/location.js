/* @flow */

import type VueRouter from '../index'
import { parsePath, resolvePath } from './path'
import { resolveQuery } from './query'
import { fillParams } from './params'
import { warn } from './warn'
import { extend } from './misc'

// 标准化路由位置信息
export function normalizeLocation (
  raw: RawLocation, // 原始的路由位置信息，可以是字符串或对象
  current: ?Route, // 当前的路由信息
  append: ?boolean, // 是否追加到当前路由的路径后面
  router: ?VueRouter // VueRouter实例
): Location {
  let next: Location = typeof raw === 'string' ? { path: raw } : raw // 字符串类型转对象
  // named target
  // ------ 处理带有name属性的情况
  if (next._normalized) { // 已经标准化过了则直接返回
    return next
  } else if (next.name) { // 处理命名路由
    next = extend({}, raw) // 复制原始路由的属性到新对象
    const params = next.params
    if (params && typeof params === 'object') { // 复制原始路由的参数到新对象的参数属性
      next.params = extend({}, params)
    }
    // 命名路由不涉及路径信息等解析的处理，所以没有将_normalized标记为true

    // 返回克隆后新的对象
    return next
  }

  // relative params
  // 路径缺失但提供了params的情况
  if (!next.path && next.params && current) {
    next = extend({}, next) // 复制到新对象
    next._normalized = true // 标记为已标准化
    // 合并current和next的params
    const params: any = extend(extend({}, current.params), next.params)
    if (current.name) { 
      // 如果当前路由是命名路由，则直接使用当前路由的名称和合并后的参数
      next.name = current.name
      next.params = params
    } else if (current.matched.length) { // 基于匹配的路由记录处理
      const rawPath = current.matched[current.matched.length - 1].path // 获取最后一个匹配的路由的path
      // 用合并后的params填充获取到的路径中参数占位符，生成最终的路径
      next.path = fillParams(rawPath, params, `path ${current.path}`)
    } else if (process.env.NODE_ENV !== 'production') { // 当前路由既不是命名路由，也没有匹配记录则提示错误
      warn(false, `relative params navigation requires a current route.`)
    }
    // 返回标准化后的对象
    return next
  }

  // 其它情况
  const parsedPath = parsePath(next.path || '') // 将路径解析成{path, query, hash}对象
  const basePath = (current && current.path) || '/' // 基路径
  // 根据path和base生成最终的绝对路径作为新的path
  // 此处会解析类似../../xxx的相对路径
  const path = parsedPath.path
    ? resolvePath(parsedPath.path, basePath, append || next.append)
    : basePath // 路径处理

  // 将query解析成参数键值对
  const query = resolveQuery(
    parsedPath.query, // 要解析的参数
    next.query, // 解析后合并进去的附加参数
    router && router.options.parseQuery // 自定义解析函数
  )

  // hash处理，优先取传入的hash，否则使用从path解析到的hash
  // 结果会在前面添加#
  let hash = next.hash || parsedPath.hash
  if (hash && hash.charAt(0) !== '#') {
    hash = `#${hash}`
  }

  // 返回解析后的对象
  return {
    _normalized: true,
    path,
    query,
    hash
  }
}
