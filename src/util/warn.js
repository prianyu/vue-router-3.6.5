/* @flow */

// 断言，给定条件为false则抛出错误信息
export function assert (condition: any, message: string) {
  if (!condition) {
    throw new Error(`[vue-router] ${message}`)
  }
}

// 警告，给定条件为false则打印警告信息
export function warn (condition: any, message: string) {
  if (!condition) {
    typeof console !== 'undefined' && console.warn(`[vue-router] ${message}`)
  }
}

