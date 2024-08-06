/* @flow */
// 处理路径，将相对路径转为绝对路径
// 1. 路径是绝对路径则直接返回
// 2. 路径是个查询参数字符串或者hash则直接拼接基路径后返回
// 3. 解析relative相对于base的路径，生成完成的绝对路径
export function resolvePath (
  relative: string, // 要处理的相对路径
  base: string, // 基路径
  append?: boolean // 是否将相对路径追加到基路径后面
): string {
  const firstChar = relative.charAt(0)
  if (firstChar === '/') { // 是个绝对路径则直接返回
    return relative
  }

  // 路径是个查询参数字符串或者hash则直接拼接基路径后返回
  if (firstChar === '?' || firstChar === '#') {
    return base + relative
  }

  // 将基路径以/分隔拆分成数组，成为一个路径栈，用于路径拼接
  const stack = base.split('/')

  // remove trailing segment if:
  // - not appending
  // - appending to trailing slash (last segment is empty)
  // 如果不进行路径路径追加或者基路径是以/结尾的，则移除stack最后一项
  // 这样可以避免重复的/
  // relative: baz, base: /foo/bar, append:false => ['foo']
  // relative: baz, base: /foo/bar/ => ['foo', 'bar']
  if (!append || !stack[stack.length - 1]) {
    stack.pop()
  }

  // resolve relative path
  // 去除relative开头的/，并以/分割拆分成路径片段
  const segments = relative.replace(/^\//, '').split('/')
  for (let i = 0; i < segments.length; i++) {
    const segment = segments[i]
    if (segment === '..') { // 如果是..则删除基路径栈顶元素，即返回上一级目录
      stack.pop()
    } else if (segment !== '.') { // 非.则将当前路径片段压入路径栈
      stack.push(segment)
    }
  }

  // ensure leading slash
  // 确保路径是以/开头的：如果stack的第一个元素不是空字符串则在前面添加一个空字符串
  // 这样在使用join方法连接时，会自动在路径前添加/
  if (stack[0] !== '') {
    stack.unshift('')
  }

  // 将路径栈使用/连接拼接成最终的路径
  return stack.join('/')
}

// 将传入的path解析成路径对象
// 对象宝航path，query和hash属性
export function parsePath (path: string): {
  path: string;
  query: string;
  hash: string;
} {
  let hash = ''
  let query = ''

  // 查找#所在的位置，找到了将后面的内容作为hash值
  const hashIndex = path.indexOf('#')
  if (hashIndex >= 0) {
    hash = path.slice(hashIndex)
    path = path.slice(0, hashIndex)
  }

  // 查找?所在的位置，找到了则将?后面的内容作为query
  const queryIndex = path.indexOf('?')
  if (queryIndex >= 0) {
    query = path.slice(queryIndex + 1)
    path = path.slice(0, queryIndex)
  }

  // path为剩余的部分

  return {
    path,
    query,
    hash
  }
}

// 清理路径，将路径中多余的斜杠和斜杠间的空格移除，替换为单/
export function cleanPath (path: string): string {
  return path.replace(/\/(?:\s*\/)+/g, '/')
}
