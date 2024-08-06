/* @flow */

import { warn } from './warn'

const encodeReserveRE = /[!'()*]/g
const encodeReserveReplacer = c => '%' + c.charCodeAt(0).toString(16)
const commaRE = /%2C/g

// fixed encodeURIComponent which is more conformant to RFC3986:
// - escapes [!'()*]
// - preserve commas
const encode = str =>
  encodeURIComponent(str)
    .replace(encodeReserveRE, encodeReserveReplacer)
    .replace(commaRE, ',')

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

export function stringifyQuery (obj: Dictionary<string>): string {
  const res = obj
    ? Object.keys(obj)
      .map(key => {
        const val = obj[key]

        if (val === undefined) {
          return ''
        }

        if (val === null) {
          return encode(key)
        }

        if (Array.isArray(val)) {
          const result = []
          val.forEach(val2 => {
            if (val2 === undefined) {
              return
            }
            if (val2 === null) {
              result.push(encode(key))
            } else {
              result.push(encode(key) + '=' + encode(val2))
            }
          })
          return result.join('&')
        }

        return encode(key) + '=' + encode(val)
      })
      .filter(x => x.length > 0)
      .join('&')
    : null
  return res ? `?${res}` : ''
}
