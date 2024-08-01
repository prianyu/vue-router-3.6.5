/* @flow */

import Regexp from 'path-to-regexp'
import { cleanPath } from './util/path'
import { assert, warn } from './util/warn'

// 创建路由表映射
// 将路由配置数组转换为一个包含pathList,pathMap,nameMap三个属性的路由表映射对象
export function createRouteMap (
  routes: Array<RouteConfig>,
  oldPathList?: Array<string>, // 旧的路径列表
  oldPathMap?: Dictionary<RouteRecord>, // 旧的基于路径的映射对象
  oldNameMap?: Dictionary<RouteRecord>, // 旧的基于名称的路由表映射对象
  parentRoute?: RouteRecord // 父路由
): {
  pathList: Array<string>,
  pathMap: Dictionary<RouteRecord>,
  nameMap: Dictionary<RouteRecord>
} {
  // 初始化路径列表、路径映射对象、名称映射对象
  // the path list is used to control path matching priority
  const pathList: Array<string> = oldPathList || []
  // $flow-disable-line
  const pathMap: Dictionary<RouteRecord> = oldPathMap || Object.create(null)
  // $flow-disable-line
  const nameMap: Dictionary<RouteRecord> = oldNameMap || Object.create(null)

  // 遍历路由配置
  routes.forEach(route => {
    addRouteRecord(pathList, pathMap, nameMap, route, parentRoute)
  })

  // ensure wildcard routes are always at the end
  // 确保通配符路由在末尾
  // 遍历到通配符路由时，将其方法列表末尾，并调整循环计数器
  for (let i = 0, l = pathList.length; i < l; i++) {
    if (pathList[i] === '*') {
      pathList.push(pathList.splice(i, 1)[0])
      l--
      i--
    }
  }

  // 查找出不以"/"开头的非通配符路径，发出不符合要求的路径配置的警告
  if (process.env.NODE_ENV === 'development') {
    // warn if routes do not include leading slashes
    const found = pathList
    // check for missing leading slash
      .filter(path => path && path.charAt(0) !== '*' && path.charAt(0) !== '/') // 不符合要求的路径列表

    if (found.length > 0) { // 拼接提示信息
      const pathNames = found.map(path => `- ${path}`).join('\n')
      warn(false, `Non-nested routes must include a leading slash character. Fix the following routes: \n${pathNames}`)
    }
  }

  // 返回生成的路由映射对象
  return {
    pathList,
    pathMap,
    nameMap
  }
}

// 将路由添加至pathList,pathMap和nameMap中
function addRouteRecord (
  pathList: Array<string>, // 存放路由路径列表的数组
  pathMap: Dictionary<RouteRecord>, // 基于路径的路由映射对象
  nameMap: Dictionary<RouteRecord>, // 基于名称的路由映射对象
  route: RouteConfig, // 当前要添加的路由
  parent?: RouteRecord, // 父级路由
  matchAs?: string // 匹配路径，路由实际指向的路由，在命名路由使用
) {
  const { path, name } = route // 获取路由的name和path属性

  // 校验path和component配置
  // path必填，且不能包含\u0000-\u007F以外的字符
  // component不能为string类型
  if (process.env.NODE_ENV !== 'production') {
    assert(path != null, `"path" is required in a route configuration.`)
    assert(
      typeof route.component !== 'string',
      `route config "component" for path: ${String(
        path || name
      )} cannot be a ` + `string id. Use an actual component instead.`
    )

    warn(
      // eslint-disable-next-line no-control-regex
      !/[^\u0000-\u007F]+/.test(path),
      `Route with path "${path}" contains unencoded characters, make sure ` +
        `your path is correctly encoded before passing it to the router. Use ` +
        `encodeURI to encode static segments of your path.`
    )
  }

  // 正则编译选项
  const pathToRegexpOptions: PathToRegexpOptions =
    route.pathToRegexpOptions || {}
  // 规范化路径（根据父路径和配置获取规范化后的path）
  const normalizedPath = normalizePath(path, parent, pathToRegexpOptions.strict)

  // 路由匹配规则是否大小写敏感
  if (typeof route.caseSensitive === 'boolean') {
    pathToRegexpOptions.sensitive = route.caseSensitive
  }

  // 创建路由记录
  const record: RouteRecord = {
    path: normalizedPath, // 规范化后的路由path
    regex: compileRouteRegex(normalizedPath, pathToRegexpOptions), // 路径解析成正则
    components: route.components || { default: route.component }, // 命名视图组件，默认是default
    alias: route.alias
      ? typeof route.alias === 'string'
        ? [route.alias]
        : route.alias
      : [], // 路由别名
    instances: {}, // 用于存储命名视图的组件实例
    enteredCbs: {}, // @suspense
    name, // 命名路由的路由名称
    parent, // 父路由
    matchAs, // 路由指向的实际路由路径
    redirect: route.redirect, // 路由跳转
    beforeEnter: route.beforeEnter, // 路由前置守卫
    meta: route.meta || {}, // 路由元信息
    props:
      route.props == null
        ? {}
        : route.components
          ? route.props
          : { default: route.props } // props
  }

  // 添加子路由
  if (route.children) {
    // Warn if route is named, does not redirect and has a default child route.
    // If users navigate to this route by name, the default child will
    // not be rendered (GH Issue #629)
    // 当路由是个命名路由，且其拥有一个默认的子路由（path为空或者'/'）时，发出警告
    // 此时如果使用路由名称导航时，则不会渲染默认的子路由，需要使用默认子路由的名称进行导航
    if (process.env.NODE_ENV !== 'production') {
      if (
        route.name &&
        !route.redirect &&
        route.children.some(child => /^\/?$/.test(child.path))
      ) {
        warn(
          false,
          `Named Route '${route.name}' has a default child route. ` +
            `When navigating to this named route (:to="{name: '${
              route.name
            }'}"), ` +
            `the default child route will not be rendered. Remove the name from ` +
            `this route and use the name of the default child route for named ` +
            `links instead.`
        )
      }
    }

    // 遍历子路由，递归添加路由记录
    route.children.forEach(child => {
      const childMatchAs = matchAs
        ? cleanPath(`${matchAs}/${child.path}`)
        : undefined // 重新拼接matchAs
      // 递归添加子路由，parent传值为当前的record
      addRouteRecord(pathList, pathMap, nameMap, child, record, childMatchAs)
    })
  }

  // 往pathList和pathMap中添加路由记录
  if (!pathMap[record.path]) {
    pathList.push(record.path) // 将路由路径添加到pathList数组中
    pathMap[record.path] = record // 将路由记录添加到pathMap中
  }

  // 添加路由别名
  if (route.alias !== undefined) {
    // 获取别名数组
    const aliases = Array.isArray(route.alias) ? route.alias : [route.alias]
    for (let i = 0; i < aliases.length; ++i) { // 遍历所有别名
      const alias = aliases[i]
      // 路由别名不能与path相同
      if (process.env.NODE_ENV !== 'production' && alias === path) {
        warn(
          false,
          `Found an alias with the same value as the path: "${path}". You have to remove that alias. It will be ignored in development.`
        )
        // skip in dev to make it work
        continue
      }

      // 创建一个新的命名路由对象
      // 该对象仅包含children和path属性，不包含name,alias,meta等其他属性
      // 没有name和alias属性则会在递归调用时不会再走name和alias的相关处理逻辑（children里的依然会处理）
      // 本质上，命名路由是指向了原始路由的一个类似转发的路由，保留其简洁性很有必要
      // 因为如果创建一个新的路由记录，则meta、beforeEnter等可能包含大量的数据，可能造成数据冗余增加资源消耗
      // 因此在命名路由内部使用matchAs的方式，将其指向原始的路由
      const aliasRoute = {
        path: alias,
        children: route.children
      }
      addRouteRecord(
        pathList,
        pathMap,
        nameMap,
        aliasRoute,
        parent,
        record.path || '/' // matchAs 实际指向的路由
      )
    }
  }

  // 命名路由添加
  if (name) {
    if (!nameMap[name]) { // 如果未添加该命名路由
      nameMap[name] = record // 添加命名路由
    } else if (process.env.NODE_ENV !== 'production' && !matchAs) { 
      // 已经添加了该命名路由且，且不是处理别名路由的情况下则发出重复定义的警告
      // 增加!matchAs的判断是有必要的：在处理别名路由时，创建的aliasRoute本身不包含name属性，
      // 所以不会处理name相关的逻辑
      // 然后，aliasRoute.children中的路由是可以包含name属性的，由于这些子路由也是嵌套的别名路由
      // 其最终也会由matchAs指向其原始的路由，因此，就算定义了name也是可以的，无需给出警告
      // !matchAs告保证了只在定义路由配置时，传入了具有相同的name属性的路由才给出警告
      warn(
        false,
        `Duplicate named routes definition: ` +
          `{ name: "${name}", path: "${record.path}" }`
      )
    }
  }
}

// 使用path-to-regexp模块，将路由路径编译为正则表达式
function compileRouteRegex (
  path: string,
  pathToRegexpOptions: PathToRegexpOptions
): RouteRegExp {
  const regex = Regexp(path, [], pathToRegexpOptions) // 编译
  // 检查是否有重复的参数
  if (process.env.NODE_ENV !== 'production') {
    const keys: any = Object.create(null) // 用于存放已经定义的参数
    regex.keys.forEach(key => { // 遍历解析出来的参数列表
      warn(
        !keys[key.name],
        `Duplicate param keys in route with path: "${path}"`
      )
      keys[key.name] = true
    })
  }
  return regex
}

// path规范化
function normalizePath (
  path: string,
  parent?: RouteRecord,
  strict?: boolean
): string {
  if (!strict) path = path.replace(/\/$/, '') // 非严格模式下，移除末尾的/
  if (path[0] === '/') return path // 如果路径以/开头，直接返回
  if (parent == null) return path // 如果没有父级路由，直接返回
  // 有父级路由，则将路径拼接到父级路径后面，并规范化(移除路径中多余的斜杠和空白字符)
  return cleanPath(`${parent.path}/${path}`)
}
