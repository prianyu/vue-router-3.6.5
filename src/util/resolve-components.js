/* @flow */

import { _Vue } from '../install'
import { warn } from './warn'
import { isError } from '../util/errors'

// 处理异步路由组件
// 返回一个导航守卫，当路由匹配中包含异步组件时，会暂停导航，直到这些组件被解析完成
export function resolveAsyncComponents (matched: Array<RouteRecord>): Function {
  // 返回一个导航守卫
  return (to, from, next) => {
    let hasAsync = false // 标记是否有异步组件
    let pending = 0 // 待处理的异步组件数量
    let error = null // 异步组件加载失败的错误信息

    // 遍历匹配的路由记录，调用处理异步组件的方法
    // def: 组件构造函数或实例对象；_: 组件实例 match: 匹配的路由；key: 命名视图的名称
    flatMapComponents(matched, (def, _, match, key) => {
      // if it's a function and doesn't have cid attached,
      // assume it's an async component resolve function.
      // we are not using Vue's default async resolving mechanism because
      // we want to halt the navigation until the incoming component has been
      // resolved.
      // 如果def是一个函数且没有cid属性，则认为这是一个异步组件的解析函数
      // 同步组件在被Vue解析后会添加一个cid属性
      // Vue默认的处理异步组件的方式是非阻塞的，这样会导致导航在组件解析完成前就继续进行
      // 而路由导航守卫是需要在导航完成前处理一些特定的逻辑（如错误处理机制、数据记载、防止多次加载和竞态条件等），
      // 需要阻塞导航继续进行，因此需要定义resolve和rejrect函数来处理异步组件的解析
      if (typeof def === 'function' && def.cid === undefined) {
        hasAsync = true // 标记为有异步组件
        pending++ // 待解决的组件数+1

        // 为每个异步组件创建resole和reject回调函数

        // resolve回调，当租价解析完成时调用只会被执行一次
        const resolve = once(resolvedDef => {
          if (isESModule(resolvedDef)) { // 如果是一个ES模块则获取其默认导出
            resolvedDef = resolvedDef.default
          }
          // save resolved on async factory in case it's used elsewhere
          // 保存解析后的组件定义，可以被其它需要的地方使用
          def.resolved = typeof resolvedDef === 'function'
            ? resolvedDef
            : _Vue.extend(resolvedDef)
          // 将解析后的组件定义保存到当前路由记录的components属性中
          match.components[key] = resolvedDef
          pending-- // 减少待处理组件数
          // 如果所有组件都已经解析完毕，则调用next方法
          if (pending <= 0) {
            next()
          }
        })


        // reject回调，组件解析失败时调用，只会被执行一次
        const reject = once(reason => {
          const msg = `Failed to resolve async component ${key}: ${reason}`
          process.env.NODE_ENV !== 'production' && warn(false, msg)
          if (!error) { // 错误只执行一次
            error = isError(reason)
              ? reason
              : new Error(msg)
            next(error)
          }
        })


        // 在Vue中定义异步组件可以使用打包工具（如Webpack）结合import来动态加载模块：() => import("xxxx")
        // 也可以使用自定义工厂函数的方式来定义，并接收resolve和reject函数作为参数： (resolve, reject) => { resolve(component) }
        let res
        try {
          // 尝试调用异步组件加载函数，将resolve和reject传入
          // 如 const AsyncComponent = (resolve, reject) => setTimeout(() => resolve({ template: "<div>Async</div>" }), 1000)
          res = def(resolve, reject)
        } catch (e) { // 调用发生错误
          reject(e) // 解析失败
        }
        if (res) {
          // 如果解析函数返回了一个promise, 如 () => import("xxxx")
          // 则传入resolve和reject作为then的参数执行
          // 在这个地方，自定义的工厂函数也可能是返回了一个promise，此时也会进入此逻辑
          // 如果自定义函数在返回promise之前已经执行了resolve函数，在Promise解决后又会执行一次resolve
          // 由于resolve并定义为只保证执行一次，所以这种情况不会有副作用
          if (typeof res.then === 'function') {
            res.then(resolve, reject)
          } else {
            // new syntax in Vue 2.3
            // 不是返回一个promise，则看是否返回了包含component属性的对象
            // component属性也应该是一个Promise
            const comp = res.component
            if (comp && typeof comp.then === 'function') {
              comp.then(resolve, reject)
            }
          }
        }
      }
    })

    // 没有异步组件，直接执行next
    if (!hasAsync) next()
  }
}

// 遍历路由中的组件，对每个组件应用给定的处理函数，将处理结果返回的数组扁平化后返回
export function flatMapComponents (
  matched: Array<RouteRecord>,
  fn: Function
): Array<?Function> {
  return flatten(matched.map(m => {
    // 遍历命名视图中的所有组件
    // 对每个组件应用给定的处理函数
    return Object.keys(m.components).map(key => fn(
      m.components[key], // 路由配置的component构造函数
      m.instances[key], // 对应的组件实例
      m, key // 当前记录和组件的key（如default、sidebar等）
    ))
  }))
}

// 将二维数组拍平为一维数组
export function flatten (arr: Array<any>): Array<any> {
  return Array.prototype.concat.apply([], arr)
}

const hasSymbol =
  typeof Symbol === 'function' &&
  typeof Symbol.toStringTag === 'symbol' // 是否支持Symbol

  // 检查一个对象是否是一个ES模块
function isESModule (obj) {
  return obj.__esModule || (hasSymbol && obj[Symbol.toStringTag] === 'Module')
}

// in Webpack 2, require.ensure now also returns a Promise
// so the resolve/reject functions may get called an extra time
// if the user uses an arrow function shorthand that happens to
// return that Promise.
// webpack2 的require.ensure返回一个Promise
// 如果用户在使用resole时，又使用了箭头函数的缩写，则会将这个promise返回，从而让resolve执行多次
// 如 const AsyncComponent = (resolve, reject) => resolve(require.ensure([], require => require('AsyncComponent')))
// 这个与自定义的工厂函数返回Promise是同样的道理，所以resolve/reject函数可能会被调用一次多余的
// 定义该函数包裹resolve和reject，确保只被执行一次

// 保证函数只被调用一次
function once (fn) {
  let called = false
  return function (...args) {
    if (called) return
    called = true
    return fn.apply(this, args)
  }
}
