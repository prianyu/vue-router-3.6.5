/* @flow */

import { warn } from './warn'

const encodeReserveRE = /[!'()*]/g // 几个特殊的保留字符

// 对于特定的字符返回其百分号编码的形式
// 在encodeURIComponent这些字符不会被转义
const encodeReserveReplacer = c => '%' + c.charCodeAt(0).toString(16)
// 逗号的百分号编码 
const commaRE = /%2C/g

// 更加符合 RFC3986 标准的路径参数编码函数
// fixed encodeURIComponent which is more conformant to RFC3986:
// - escapes [!'()*]
// - preserve commas
// 以“hello, world”为例
const encode = str =>
  encodeURIComponent(str) // => hello%2C%20world!
    .replace(encodeReserveRE, encodeReserveReplacer) // 将保留字符集转为百分号编码 => hello%2C%20world%21
    .replace(commaRE, ',') // 将逗号百分号编码转为逗号 => hello,%20world%21

// 对URL编码的字符串进行解码，出错则原样返回
export function decode (str: string) {
  try {
    return decodeURIComponent(str)
  } catch (err) {
    if (process.env.NODE_ENV !== 'production') {
      warn(false, `Error decoding "${str}". Leaving it intact.`)
    }
  }
  return str
}
// 解析查询字符串
export function resolveQuery (
  query: ?string, // 要解析的查询字符串
  extraQuery: Dictionary<string> = {}, // 额外的查询参数对象
  _parseQuery: ?Function // 自定义的查询字符串解析函数
): Dictionary<string> {
  const parse = _parseQuery || parseQuery // 获取解析函数
  let parsedQuery
  try {
    parsedQuery = parse(query || '') // 使用解析函数解析
  } catch (e) { // 解析异常，则将解析结果设置为空对象
    process.env.NODE_ENV !== 'production' && warn(false, e.message)
    parsedQuery = {}
  }

  // 遍历附加的查询参数，格式化后合并参数
  for (const key in extraQuery) {
    const value = extraQuery[key]
    parsedQuery[key] = Array.isArray(value)
      ? value.map(castQueryParamValue)
      : castQueryParamValue(value)
  }

  // 返回最终的查询参数对象
  return parsedQuery
}
// 查询参数值格式化函数，对象、null、undefined会原样返回，其它的转为字符串
const castQueryParamValue = value => (value == null || typeof value === 'object' ? value : String(value))

// 解析查询参数字符串，返回解析后的参数对象
// 1. 格式化字符串
// 2. 解析键值对，处理键值的编码问题
// 3. 重复参数会转为数组
function parseQuery (query: string): Dictionary<string> {
  const res = {}

  // 移除首尾空格以及开头的#?&
  query = query.trim().replace(/^(\?|#|&)/, '')

  // 处理的后query为空字符串则返回空对象
  if (!query) {
    return res
  }

  // 以&分割将query拆分成数组后遍历
  query.split('&').forEach(param => {
    const parts = param.replace(/\+/g, ' ').split('=') // 将+号替换成空格并使用=分割拆分成数组
    const key = decode(parts.shift()) // 解码参数名
    // 剩余参数使用=连接并作为值
    // 参数值有可能本身包含=，使用=拆分后会被拆成多个片段
    // 除了第一个是参数名，剩下都是参数值，使用=重新拼接回去
    const val = parts.length > 0 ? decode(parts.join('=')) : null

    if (res[key] === undefined) { // 结果中不包含当前键则添加
      res[key] = val
    } else if (Array.isArray(res[key])) { // 已经包含且为数组追加到数组
      res[key].push(val)
    } else { // 已经存在且不是数组，则转为数组并追加
      res[key] = [res[key], val]
    }
  })

  // 返回最终的结果
  return res
}

// 查询参数泛反解析成字符串
// 1. undefined值会转为''
// 2. null值则只将key进行编码
// 3. 数组会转为多个同名的参数并使用&连接的字符串
// 4. 其它的将键和值进行编码后使用=连接
// 以上处理后过滤空的内容，使用&连接，并在开头拼接?
// {name: "foo", age: 30} => '?name=foo&age=30'
// {name: "foo", age: null, height: undefined} => '?name=foo&age'
// {name: "foo", hobbies: ['reading', 'writing']} => '?name=foo&hobbies=reading&hobbies=writing'
export function stringifyQuery (obj: Dictionary<string>): string {
  const res = obj
    ? Object.keys(obj) // 遍历所有的key
      .map(key => {
        const val = obj[key] // 值
        // undefined转为空字符串
        if (val === undefined) { 
          return ''
        }

        // null则返回编码后的key
        if (val === null) { 
          return encode(key)
        }

        // 数组则遍历后处理：undefine忽略，null只编码key，其他编码key和value
        // 结果使用&连接
        if (Array.isArray(val)) {
          const result = []
          val.forEach(val2 => {
            // undefined不处理
            if (val2 === undefined) { 
              return
            }
            // null只编码key
            if (val2 === null) {
              result.push(encode(key))
            } else { // 其它的键值都进行编码
              result.push(encode(key) + '=' + encode(val2))
            }
          })
          return result.join('&') // 使用&连接
        }

        // 将键和值进行编码后用=连接
        return encode(key) + '=' + encode(val)
      })
      .filter(x => x.length > 0) // 过滤空字符串
      .join('&') // 使用&连接
    : null
  // 如果转换结果非空，则在前面添加?号
  return res ? `?${res}` : ''
}
