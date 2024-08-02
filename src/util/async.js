/* @flow */

/**
 * 执行导航守卫队列中的每个守卫函数
 * 该函数用于依次执行一个导航守卫的数组，并在所有守卫函数执行完毕后执行回调函数
 * 它会检查数组中的每个元素，如果元素存在，则执行该元素对应的守卫函数，否则跳过
 * 守卫函数执行采用回调方式，确保每个守卫函数都执行完毕后再执行最终的回调函数
 * @param queue 导航守卫的数组，数组中的元素可能为null
 * @param fn 用于执行单个导航守卫的函数，接受守卫函数和回调作为参数
 * @param cb 在所有导航守卫执行完毕后被调用的回调函数
 */
export function runQueue (queue: Array<?NavigationGuard>, fn: Function, cb: Function) {
  // 定义step函数用于递归执行队列中的下一个导航守卫
  const step = index => {
    // 如果当前索引大于等于队列长度，则所有守卫已执行完毕，直接调用最终回调
    if (index >= queue.length) {
      cb()
    } else {
      // 如果当前索引位置的队列元素存在，则执行该守卫函数
      if (queue[index]) {
        fn(queue[index], () => {
          // 守卫函数执行完毕后，递归调用step执行下一个守卫
          step(index + 1)
        })
      } else {
        // 如果当前索引位置的队列元素不存在，则直接执行下一个守卫
        step(index + 1)
      }
    }
  }
  // 从队列的第一个元素开始执行
  step(0)
}