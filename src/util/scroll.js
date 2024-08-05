/* @flow */

import type Router from '../index'
import { assert } from './warn'
import { getStateKey, setStateKey } from './state-key'
import { extend } from './misc'

const positionStore = Object.create(null) // 用于存储位置信息的对象

export function setupScroll () {
  // Prevent browser scroll behavior on History popstate
  // 阻止浏览器自动恢复页面位置的行为
  if ('scrollRestoration' in window.history) {
    window.history.scrollRestoration = 'manual'
  }
  // Fix for #1585 for Firefox
  // => Firefox中初始化路由无法保留滚动位置的bug
  // Fix for #2195 Add optional third attribute to workaround a bug in safari https://bugs.webkit.org/show_bug.cgi?id=182678
  // => Safari中，使用replaceState后，不传入第三个参数使用获取历史地址的bug（使用base标签的地址）
  // Fix for #2774 Support for apps loaded from Windows file shares not mapped to network drives: replaced location.origin with
  // window.location.protocol + '//' + window.location.host
  // location.host contains the port and location.hostname doesn't
  // 在Windows文件共享加载应用时，使用file://协议会导致window.location.origin为null从而导致设置第三个参数出错的问题
  // 改成使用protocol+host的方式获取
  const protocolAndPath = window.location.protocol + '//' + window.location.host // 协议与路径组成的地址
  const absolutePath = window.location.href.replace(protocolAndPath, '') // 去除协议与路径后的绝对路径
  // preserve existing history state as it could be overriden by the user
  const stateCopy = extend({}, window.history.state) // 创建一个历史状态的拷贝对象
  stateCopy.key = getStateKey() // 添加一个键，用于跟踪位置信息
  window.history.replaceState(stateCopy, '', absolutePath) // 使用新的state信息替换当前的历史状态
  // 监听popstate事件并返回一个移除监听事件的函数
  window.addEventListener('popstate', handlePopState) 
  return () => {
    window.removeEventListener('popstate', handlePopState)
  }
}

// 处理浏览器滚动行为
// 1. 获取定义的滚动函数
// 2. 在页面渲染完成后执行滚动函数，得到返回的滚动位置信息
// 3. 如果返回的是一个Promise则等待Promise解决后执行滚动，否则执行滚动
export function handleScroll (
  router: Router, // 路由实例
  to: Route, // 目标路由
  from: Route, // 上一个路由
  isPop: boolean // 是否使用浏览器的前进、后退（仅popstate可用）
) {
  if (!router.app) { // 没有绑定的应用
    return
  }

  const behavior = router.options.scrollBehavior // 配置的scrollBehavior函数
  if (!behavior) { // 没有定义
    return
  }

  // scrollBehavior需要为函数类型
  if (process.env.NODE_ENV !== 'production') {
    assert(typeof behavior === 'function', `scrollBehavior must be a function`)
  }

  // wait until re-render finishes before scrolling
  // 渲染完成后执行回调
  router.app.$nextTick(() => {
    const position = getScrollPosition() // 获取记录的位置信息
    // 调用定义的行为函数，接收返回值
    const shouldScroll = behavior.call(
      router, // 当前路由实例
      to, // 目标路由
      from, // 当前路由
      isPop ? position : null // 位置信息，仅在支持popstate时生效
    )

    // 范围值为falsy则不做处理
    if (!shouldScroll) {
      return
    }

    if (typeof shouldScroll.then === 'function') { 
      // 返回值是一个promise，等待其解决后执行回调
      shouldScroll
        .then(shouldScroll => { // 解决回调
          scrollToPosition((shouldScroll: any), position) // 滚动到指定的位置
        })
        .catch(err => { // 异常处理
          if (process.env.NODE_ENV !== 'production') {
            assert(false, err.toString())
          }
        })
    } else { // 不是Promise则滚动到指定的位置
      scrollToPosition(shouldScroll, position)
    }
  })
}

// 保存页面的滚动位置信息
export function saveScrollPosition () {
  const key = getStateKey() // 获取状态key
  // 将当前页面的位置信息保存
  if (key) {
    positionStore[key] = {
      x: window.pageXOffset,
      y: window.pageYOffset
    }
  }
}

// popstate事件处理函数
function handlePopState (e) {
  saveScrollPosition() // 保存当前页面的滚动位置信息
  if (e.state && e.state.key) { // 更新状态key为当前页面的key
    setStateKey(e.state.key)
  }
}

// 获取已经记录的位置信息
function getScrollPosition (): ?Object {
  const key = getStateKey() // 获取当前的状态键
  if (key) { // 获取位置信息记录
    return positionStore[key]
  }
}
// 获取元素相对于document的位置信息，同时考虑了传入的偏移量信息
function getElementPosition (el: Element, offset: Object): Object {
  const docEl: any = document.documentElement
  const docRect = docEl.getBoundingClientRect()
  const elRect = el.getBoundingClientRect()
  return {
    x: elRect.left - docRect.left - offset.x,
    y: elRect.top - docRect.top - offset.y
  }
}

// 判断scrollBehavior返回的位置信息是否有效
// 只要返回的对象包含x:number或者y:number即认为有效
function isValidPosition (obj: Object): boolean {
  return isNumber(obj.x) || isNumber(obj.y)
}

// 规范化位置信息，获取不到的信息使用当前页面的滚动偏移量作为默认值
function normalizePosition (obj: Object): Object {
  return {
    x: isNumber(obj.x) ? obj.x : window.pageXOffset,
    y: isNumber(obj.y) ? obj.y : window.pageYOffset
  }
}

// 格式化offset信息，统一转为{x:number, y:number}格式
function normalizeOffset (obj: Object): Object {
  return {
    x: isNumber(obj.x) ? obj.x : 0,
    y: isNumber(obj.y) ? obj.y : 0
  }
}

// 判断是否为数字
function isNumber (v: any): boolean {
  return typeof v === 'number'
}

const hashStartsWithNumberRE = /^#\d/ // #和数字开头

// 滚动到指定的位置
// 1. 如果传入了元素选择器，则优先使用元素的位置信息（相对与document）
// 2. 格式化偏移量信息（offset，如有），并计算位置信息
// 3. 格式化最终的位置信息
// 4. 使用window.scrollTo执行滚动，如果支持滚动行为配置则会传入滚动行为配置信息
function scrollToPosition (shouldScroll, position) {
  const isObject = typeof shouldScroll === 'object' // 滚动信息是否为一个对象
  if (isObject && typeof shouldScroll.selector === 'string') { 
    // 传入了selector属性，则获取元素的相关位置信息
    // 如果传入的是以“#+数字”开头的，则使用getElementId来获取，否则使用querySelector获取
    // 使用id时，为选择器传入额外的选择器信息会导致获取不到对应的元素
    // 然而当选择器为id时，本身再传入额外的选择器信息是没有必要的，id本身已经唯一代表了一个唯一元素，只需要单独传入id即可
    // getElementById would still fail if the selector contains a more complicated query like #main[data-attr]
    // but at the same time, it doesn't make much sense to select an element with an id and an extra selector
    const el = hashStartsWithNumberRE.test(shouldScroll.selector) // $flow-disable-line
      ? document.getElementById(shouldScroll.selector.slice(1)) // $flow-disable-line
      : document.querySelector(shouldScroll.selector)

    if (el) { // 获取到了元素
      let offset =
        shouldScroll.offset && typeof shouldScroll.offset === 'object'
          ? shouldScroll.offset
          : {} // 获取传入的偏移信息
      offset = normalizeOffset(offset) // 规范化offset信息
      position = getElementPosition(el, offset) // 获取元素相对与document的位置信息
    } else if (isValidPosition(shouldScroll)) {
      // 获取不到元素则，则获取scrollBehavior返回的位置信息并规范化
      position = normalizePosition(shouldScroll)
    }
  } else if (isObject && isValidPosition(shouldScroll)) { 
    // 没有传入selector则则获取scrollBehavior返回的位置信息并规范化
    position = normalizePosition(shouldScroll)
  }

  // 经过以上处理后，如果有位置信息，则执行滚动
  if (position) {
    // $flow-disable-line
    // 滚动支持行为配置，则优先使用，并使用scrollBehavior返回的配置信息作为配置
    if ('scrollBehavior' in document.documentElement.style) {
      window.scrollTo({
        left: position.x,
        top: position.y,
        // $flow-disable-line
        behavior: shouldScroll.behavior
      })
    } else { // 不支持滚动行为配置则直接滚动到相应的位置
      window.scrollTo(position.x, position.y)
    }
  }
}
