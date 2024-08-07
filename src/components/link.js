/* @flow */

import { createRoute, isSameRoute, isIncludedRoute } from '../util/route'
import { extend } from '../util/misc'
import { normalizeLocation } from '../util/location'
import { warn } from '../util/warn'
// ------------RouterLink组件-----------------

// work around weird flow bug
const toTypes: Array<Function> = [String, Object]
const eventTypes: Array<Function> = [String, Array]

const noop = () => {}

let warnedCustomSlot // 标记是否已经提醒过使用自定义插槽
let warnedTagProp // 标记是否已经提醒过使用tag属性的警告
let warnedEventProp // 标记是否已经提醒过使用event属性的警告
/**
 * 渲染函数的逻辑
 * 1. 获取路由器以及当前路由、目标路由的相关信息
 * 2. 设置默认的激活样式类和精准激活样式类，并比较目标路由与当前路由是否一致，如果一致则设置对应样式类
 * 3. 初始化事件处理函数，保证事件处理与浏览器普通的HTML标签行为一致，并根据传入的event合并事件处理程序
 * 4. 初始化组件的data属性，含classes、on、attrs等
 * 5. 处理作用域插槽，如果使用了作用域插槽，则处理后根据插槽执行结果返回合适的虚拟节点
 * 6. 如果没有使用作用域插槽则处理渲染的标签，如果标签是a标签则直接设置属性并绑定相关事件，否则从插槽子元素中找到第一个a标签
 * 并做相关属性和事件绑定合并等处理，找不到则直接将属性和事件设置在根标签上，最后使用createElement函数创建虚拟节点返回
 */
export default {
  name: 'RouterLink',
  props: {
    to: { // 导航的目标路由，可以是一个字符串或者对象
      type: toTypes,
      required: true
    },
    tag: { // 要渲染的标签
      type: String,
      default: 'a'
    },
    custom: Boolean, // 是否自定义渲染
    exact: Boolean, // 是否精准匹配
    exactPath: Boolean, // 是否只匹配路径
    append: Boolean, // 是否追加到当前路由的路径后面
    replace: Boolean, // 是否使用router.replace替换当前路径,而不是router.push
    activeClass: String, // 设置激活的class，默认从router.options.linkActiveClass获取
    exactActiveClass: String, // 连接被精准匹配时的class，默认从router.options.linkExactActiveClass获取
    ariaCurrentValue: { // aria-current属性的值
      type: String,
      default: 'page'
    },
    event: { // 触发导航的事件类型，默认是点击
      type: eventTypes,
      default: 'click'
    }
  },
  render (h: Function) {
    // ---------获取路由信息----------
    const router = this.$router // 获取当前路由实例
    const current = this.$route // 获取当前路由对象
    // 解析目标路由的相关信息
    const { location, route, href } = router.resolve(
      this.to,
      current,
      this.append
    )

    // ----------计算CSS类名-----------
    const classes = {}
    const globalActiveClass = router.options.linkActiveClass // 获取全局配置的激活类名
    const globalExactActiveClass = router.options.linkExactActiveClass // 获取全局配置的精确激活类名
    // Support global empty active class
    // 默认的激活类名：如果全局配置的激活类名为空，则使用默认的router-link-active
    const activeClassFallback =
      globalActiveClass == null ? 'router-link-active' : globalActiveClass
    // 默认的精准匹配类名: 如果全局配置的精确激活类名为空，则使用默认的router-link-exact-active
    const exactActiveClassFallback =
      globalExactActiveClass == null
        ? 'router-link-exact-active'
        : globalExactActiveClass
    // 激活类名，如果props传递了activeClass则使用，否则使用默认的激活类名
    const activeClass =
      this.activeClass == null ? activeClassFallback : this.activeClass
    // 精准激活类名，如果props传递了exactActiveClass则使用，否则使用默认的精准激活类名
    const exactActiveClass =
      this.exactActiveClass == null
        ? exactActiveClassFallback
        : this.exactActiveClass

    // 创建用于比较当前路由是否与目标路由匹配的路由对象
    // 如果是从某个路由重定向来的，则创建一个新的路由对象来作为比较目标
    // 否则使用解析出来的route对象
    const compareTarget = route.redirectedFrom
      ? createRoute(null, normalizeLocation(route.redirectedFrom), null, router)
      : route

    // ------设置样式------
    // 比较当前路由与目标路由是否一致，如果一直则设置精准匹配激活样式类
    // exactPath用于指示是否只匹配路径，不匹配query和hash
    classes[exactActiveClass] = isSameRoute(current, compareTarget, this.exactPath)
    // 设置激活类名：当exact或者exactPath为true时则与精准匹配激活类逻辑一致
    // 否则判断当前路由是否包含了目标路由
    classes[activeClass] = this.exact || this.exactPath
      ? classes[exactActiveClass]
      : isIncludedRoute(current, compareTarget)

    // 如果设置了exactActiveClass，则设置aria-current属
    const ariaCurrentValue = classes[exactActiveClass] ? this.ariaCurrentValue : null

    // 定义导航事件处理函数
    const handler = e => {
      // 只有事件满足特定条件下才会接管事件的处理
      if (guardEvent(e)) {
        if (this.replace) { // 如果设置了replace，则使用router的replace方法
          router.replace(location, noop)
        } else { // 否则使用router的push方法
          router.push(location, noop)
        }
      }
    }

    // --------- 初始化事件绑定对象--------
    // 初始化监听对象，默认监听click事件
    const on = { click: guardEvent }
    if (Array.isArray(this.event)) { // 传入的事件类型是一个数组，则遍历并绑定事件
      this.event.forEach(e => {
        on[e] = handler
      })
    } else { // 不是数组则直接绑定事件
      on[this.event] = handler
    }

    // 初始化data对象，用于存储渲染节点的数据
    const data: any = { class: classes }

    // ---------作用域插槽处理----------

    // 获取作用插槽，如果定义了插槽，则传递必要的参数调用插槽
    const scopedSlot =
      !this.$scopedSlots.$hasNormal &&
      this.$scopedSlots.default &&
      this.$scopedSlots.default({
        href, // 解析后的URL
        route, // 解析后的规范化的路由对象
        navigate: handler, // 触发导航的函数
        isActive: classes[activeClass], // 是否激活
        isExactActive: classes[exactActiveClass] // 是否精确激活
      })

    if (scopedSlot) { // 插槽有返回值
      if (process.env.NODE_ENV !== 'production' && !this.custom) {
        // 没有设置custom属性且还没针对此种情况做过警告，则给出警告并标记为已警告
        // 警告内容为在Vue-Router 4中，v-slot默认会将其内容包裹在一个a标签上，如果要移除该特性则需要设置custom属性为true
        !warnedCustomSlot && warn(false, 'In Vue Router 4, the v-slot API will by default wrap its content with an <a> element. Use the custom prop to remove this warning:\n<router-link v-slot="{ navigate, href }" custom></router-link>\n')
        warnedCustomSlot = true
      }
      if (scopedSlot.length === 1) { // 插槽返回单个元素，则直接返回该元素
        return scopedSlot[0]
      } else if (scopedSlot.length > 1 || !scopedSlot.length) { // 没有元素或多个元素
        // 在使用 v-slot API 时，需要向 router-link 传入一个单独的子元素，
        // 否则 router-link 将会把子元素包裹在一个 span 元素内。
        if (process.env.NODE_ENV !== 'production') {
          warn(
            false,
            `<router-link> with to="${
              this.to
            }" is trying to use a scoped slot but it didn't provide exactly one child. Wrapping the content with a span element.`
          )
        }
        // 没有传入元素则渲染一个空标签，多个元素则将它们用span元素包括后返回
        return scopedSlot.length === 0 ? h() : h('span', {}, scopedSlot)
      }
    }

    // 没有作用域插槽时，针对使用了tag和event配置的情况给出在VueRouter4中移除支持的警告
    // 需要使用作用域插槽来替代
    // 之所以将其移除是因为这些属性经常是一起使用的，在处理这些属性时会增加bundle的大小
    // 而这些功能在引入v-slot后完全可以使用v-slot替代，没有必要让每一个应用都因此而增加bundle的大小
    if (process.env.NODE_ENV !== 'production') {
      // 如果传递了tag属性且未发出该类警告则发出警告并标记成已发出警告
      // 告知在VueRouter4中会移除tag属性的支持，使用作用域插槽替代
      if ('tag' in this.$options.propsData && !warnedTagProp) {
        warn(
          false,
          `<router-link>'s tag prop is deprecated and has been removed in Vue Router 4. Use the v-slot API to remove this warning: https://next.router.vuejs.org/guide/migration/#removal-of-event-and-tag-props-in-router-link.`
        )
        warnedTagProp = true // 标记成已警告
      }
      // 如果传递了event属性且未发出该类警告则发出警告并标记成已发出警告
      // 告知在VueRouter4中会移除event属性的支持，使用作用域插槽替代
      if ('event' in this.$options.propsData && !warnedEventProp) {
        warn(
          false,
          `<router-link>'s event prop is deprecated and has been removed in Vue Router 4. Use the v-slot API to remove this warning: https://next.router.vuejs.org/guide/migration/#removal-of-event-and-tag-props-in-router-link.`
        )
        warnedEventProp = true
      }
    }

    // ------------渲染标签处理----------------
    if (this.tag === 'a') { // 如果是a标签
      data.on = on // 则绑定click事件
      data.attrs = { href, 'aria-current': ariaCurrentValue }  // 设置href和aria-current属性
    } else { // 如果不是a标签
      // find the first <a> child and apply listener and href
      // 递归查找子节点中的第一个a标签，并为其添加相关事件和属性
      const a = findAnchor(this.$slots.default)
      if (a) {
        // in case the <a> is a static node
        a.isStatic = false // 将a标签设置为动态节点，确保a标签在动态属性发生变化时，会重新渲染
        const aData = (a.data = extend({}, a.data)) // 复制a标签的data属性
        aData.on = aData.on || {} // 初始化事件对象，用于存放事件监听器

        // 合并已有的事件处理程序与新的事件处理程序
        // 如果这些事件在on对象中已经存在，则统一转换为数组
        // transform existing events in both objects into arrays so we can push later
        for (const event in aData.on) {
          const handler = aData.on[event]
          if (event in on) { // 事件在on对象中存在则转为数组
            aData.on[event] = Array.isArray(handler) ? handler : [handler]
          }
        }
        // append new listeners for router-link
        // 遍历on中的事件，如果在aData中不存在则添加
        // 如果存在了则添加到函数数组中
        for (const event in on) {
          if (event in aData.on) {
            // on[event] is always a function
            aData.on[event].push(on[event])
          } else {
            aData.on[event] = handler
          }
        }

        // 设置href和aria-current属性
        const aAttrs = (a.data.attrs = extend({}, a.data.attrs))
        aAttrs.href = href
        aAttrs['aria-current'] = ariaCurrentValue
      } else { // 如果没有找到a标签，则将事件监听器添加到元素本身
        // doesn't have <a> child, apply listener to self
        data.on = on
      }
    }

    // 使用指点的标签、数据和子节点创建并返回虚拟节点
    return h(this.tag, data, this.$slots.default)
  }
}

// 在特定的条件下阻止某些事件的默认行为，以确保导航事件只有在特定的条件下触发
// 目的是为了保证router-link的行为与普通的HTML链接一致，从而提供一致的用户体验
export function guardEvent (e: any) {
  // don't redirect with control keys
  // 按下任意一个修饰键，则返回undefined
  if (e.metaKey || e.altKey || e.ctrlKey || e.shiftKey) return
  // don't redirect when preventDefault called
  // 如果事件对象的defaultPrevented属性为true，则返回undefined
  if (e.defaultPrevented) return
  // don't redirect on right click
  // 如果触发事件不是左键点击，则返回undefined
  if (e.button !== undefined && e.button !== 0) return
  // don't redirect if `target="_blank"`
  // 如果设置了target="_blank"，则返回undefined
  if (e.currentTarget && e.currentTarget.getAttribute) {
    const target = e.currentTarget.getAttribute('target')
    if (/\b_blank\b/i.test(target)) return
  }
  // this may be a Weex event which doesn't have this method
  // 以上条件都不满足，则阻止浏览器默认行为，并返回true，由VueRouter接管
  if (e.preventDefault) {
    e.preventDefault()
  }
  return true
}

// 从子节点中递归查找第一个a标签
function findAnchor (children) {
  if (children) {
    let child
    for (let i = 0; i < children.length; i++) {
      child = children[i]
      if (child.tag === 'a') {
        return child
      }
      if (child.children && (child = findAnchor(child.children))) {
        return child
      }
    }
  }
}
