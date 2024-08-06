// When changing thing, also edit router.d.ts
// 导航错误类型定义
export const NavigationFailureType = {
  redirected: 2, // 重定向错误类型
  aborted: 4, // 导航中断错误类型
  cancelled: 8, // 导航取消
  duplicated: 16 // 导航重复
}

// 创建导航重定向错误
export function createNavigationRedirectedError (from, to) {
  return createRouterError(
    from,
    to,
    NavigationFailureType.redirected,
    `Redirected when going from "${from.fullPath}" to "${stringifyRoute(
      to
    )}" via a navigation guard.`
  )
}

// 创建重复导航类型错误
export function createNavigationDuplicatedError (from, to) {
  const error = createRouterError(
    from,
    to,
    NavigationFailureType.duplicated,
    `Avoided redundant navigation to current location: "${from.fullPath}".`
  )
  // backwards compatible with the first introduction of Errors
  // 向后兼容最初引入的错误
  error.name = 'NavigationDuplicated'
  return error
}

// 创建导航取消类型错误
export function createNavigationCancelledError (from, to) {
  return createRouterError(
    from,
    to,
    NavigationFailureType.cancelled,
    `Navigation cancelled from "${from.fullPath}" to "${
      to.fullPath
    }" with a new navigation.`
  )
}

// 创建导航失败类型错误
export function createNavigationAbortedError (from, to) {
  return createRouterError(
    from,
    to,
    NavigationFailureType.aborted,
    `Navigation aborted from "${from.fullPath}" to "${
      to.fullPath
    }" via a navigation guard.`
  )
}

/**
 * 通用的路由器错误创建哈桑农户
 * @param {Object} from - 导航的来源位置
 * @param {Object} to - 导航的目标位置
 * @param {number} type - 错误类型
 * @param {string} message - 错误信息
 * @returns {Error} - 路由器错误对象
 */

function createRouterError (from, to, type, message) {
  const error = new Error(message)
  error._isRouter = true // 标记该错误是路由器错误类型
  error.from = from
  error.to = to
  error.type = type // 错误类型

  return error
}

const propertiesToLog = ['params', 'query', 'hash']
/**
 * 将路由对象转换为字符串表示
 * @param {Object|string} to - 目标路由对象或路径字符串
 * @returns {string} - 路由的字符串表示
 */
function stringifyRoute (to) {
  if (typeof to === 'string') return to // 如果是字符串则直接返回
  if ('path' in to) return to.path // 如果有path属性则返回path属性
  const location = {}
  // 如果有params、query和hash属性则添加到location中
  propertiesToLog.forEach(key => {
    if (key in to) location[key] = to[key]
  })
  // 将location转为字符串并返回
  return JSON.stringify(location, null, 2)
}

// 判断传入的内容是否为错误对象
export function isError (err) {
  return Object.prototype.toString.call(err).indexOf('Error') > -1
}

// 判断某个错误对象是否是来自路由器的错误
// 具有_isRouter属性且type为指定的类型
export function isNavigationFailure (err, errorType) {
  return (
    isError(err) &&
    err._isRouter &&
    (errorType == null || err.type === errorType)
  )
}
