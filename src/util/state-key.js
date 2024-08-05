/* @flow */
import { inBrowser } from './dom'
// 用于生成和管理“状态键”的工具函数，用于历史管理

// use User Timing api (if present) for more accurate key precision
// 用于生成时间戳的对象，优先使用window.performance API，因为其具有更高的精度和性能，更适合生成唯一标识符
const Time =
  inBrowser && window.performance && window.performance.now
    ? window.performance
    : Date

// 生成状态键：保留三位小数的时间戳
export function genStateKey (): string {
  return Time.now().toFixed(3)
}

let _key: string = genStateKey() // 定义初始的状态键

// 获取状态键
export function getStateKey () {
  return _key
}

// 设置状态键
export function setStateKey (key: string) {
  return (_key = key)
}
