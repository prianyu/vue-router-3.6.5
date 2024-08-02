/* @flow */

import type Router from '../index'
import { History } from './base'
import { NavigationFailureType, isNavigationFailure } from '../util/errors'

/**
 * 抽象历史记录类，提供了路由历史管理的基础功能
 * 继承自History类，实现了路由的推入、替换和前进后退等功能
 */
export class AbstractHistory extends History {
  index: number // 当前路由所处的位置索引
  stack: Array<Route> // 路由栈

  /**
   * 初始化路由历史记录
   * @param router 路由器实例
   * @param base 可选的路由前缀
   */
  constructor (router: Router, base: ?string) {
    super(router, base)
    // 路由初始化
    this.stack = []
    this.index = -1
  }

  /**
   * 将一个新路由推入历史记录栈
   * @param location 要导航到的新路由的地址
   * @param onComplete 成功导航后的回调函数，可选
   * @param onAbort 导航失败时的回调函数，可选
   */
  push (location: RawLocation, onComplete?: Function, onAbort?: Function) {
    this.transitionTo(
      location,
      route => {
        // 更新历史记录栈，只保留当前index之前的记录，并在最后添加新的route
        this.stack = this.stack.slice(0, this.index + 1).concat(route)
        this.index++
        onComplete && onComplete(route)
      },
      onAbort
    )
  }

  /**
   * 替换当前的历史记录栈顶
   * @param location 要导航到的新路由的地址
   * @param onComplete 成功导航后的回调函数，可选
   * @param onAbort 导航失败时的回调函数，可选
   */
  replace (location: RawLocation, onComplete?: Function, onAbort?: Function) {
    this.transitionTo(
      location,
      route => {
        // 更新历史记录栈，移除当前index后的所有记录，并在最后添加新的route
        this.stack = this.stack.slice(0, this.index).concat(route)
        onComplete && onComplete(route)
      },
      onAbort
    )
  }

  /**
   * 在历史记录栈中前进或后退n步
   * @param n 要前进或后退的步数，正数表示前进，负数表示后退
   */
  go (n: number) {
    const targetIndex = this.index + n
    // 越界处理
    if (targetIndex < 0 || targetIndex >= this.stack.length) {
      return
    }
    const route = this.stack[targetIndex]
    // 确认即将进行的路由转换
    this.confirmTransition(
      route,
      () => {
        const prev = this.current
        this.index = targetIndex
        this.updateRoute(route)
        // 触发路由转换后的钩子函数
        // 基类中的afterHooks钩子是在transitionTo执行的，所以这里需要手动执行afterHooks钩子
        this.router.afterHooks.forEach(hook => {
          hook && hook(route, prev)
        })
      },
      err => {
        if (isNavigationFailure(err, NavigationFailureType.duplicated)) {
          this.index = targetIndex
        }
      }
    )
  }

  /**
   * 获取当前路由的地址
   * @return 当前路由的完整路径，如果没有当前路由则返回'/'
   */
  getCurrentLocation () {
    const current = this.stack[this.stack.length - 1]
    return current ? current.fullPath : '/'
  }

  /**
   * 确保当前URL与当前路由匹配，目前不执行任何操作
   */
  ensureURL () {
    // noop
  }
}