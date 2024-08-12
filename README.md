# Vue-Router 3.6.5源码解读

## 开发环境启动

```bash
# 安装依赖
yarn

# 启动示例localhost:8080
yarn dev

```
目录下的`webpack.config.js`文件会配置导入包的路径别名，在`examples`目录下添加或修改示例代码就可以进行源码调试。

```js
// examples/webpack.config.js
module.exports = {
  resolve: {
    alias: {
      vue: 'vue/dist/vue.esm.js',
      'vue-router': path.join(__dirname, '..', 'src'), // 此处将vue-router的导入指向了src目录
      'vue-router/composables': path.join(__dirname, '..', 'src/composables')
    }
  },
}
```

## 目录结构

## 几个类型和概念

在vue-router中，有几个核心的数据类型对于理解和使用Vue-Router至关重要，这些类型包括：`Route`、`RouteRecord`、`RouteConfig`和`Location`。

1. `Route`

`Route`是路由对象，表示路由的状态信息，平时使用时，像路由导航守卫接收的`from`、`to`以及通过`this.$route`访问到的`$route`都是`Route`类型。

```ts
interface Route {
  path: string
  name?: string | null
  hash: string
  query: Dictionary<string | (string | null)[]>
  params: Dictionary<string>
  fullPath: string
  matched: RouteRecord[]
  redirectedFrom?: string
  meta?: RouteMeta
}
```

2. `RouteConfig`

`RouteConfig`是路由配置对象的类型，每一条路由的配置就是一个`RouteConfig`对象。在实例化`Router`对象时，传入的`routes`参数就是`RouteConfig`对象的数组。

```ts
interface RouteConfig {
  path: string  // 路由路径
  name?: string // 路由名称
  component?: Component // 路由组件
  components?: { [name: string] : Component } // 命名视图组件
  children?: RouteConfig[] // 子路由
  redirect?: string | Location | Function // 路由重定向
  alias?: string | string[] // 路由别名
  meta?: any // 路由元信息
  props: boolean | Object | (route: Route) => Object | { [name: string]: boolean | Object } // 路由组件的props配置
  beforeEnter?: (to: Route, from: Route, next: Function) => void // 路由前置守卫
  caseSensitive?: boolean // 匹配规则是否区分大小写
  pathToRegexpOptions?: { sensitive?: boolean, strict?: boolean, end?: boolean} // 编译正则的选项
}
```

3. `RouteRecord`

路由记录，Vue-Router在实例化路由实例的时候，会根据传入的`routes`初始化路由记录，将路由记录转为各种映射对象（`pathList`，`nameMap`，`pathMap`）。其中`nameMap`，`pathMap`中存放的就是路由记录，它们实际上是格式化后的`routes`对象上的`RouteConfig`副本。在路由匹配记录（`this.$route.matched`）中，存放的就是路由记录数组。


```ts
interface RouteRecord {
  path: string // 路径
  regex: RegExp // 用于匹配路由的正则
  components: { [name: string]: Component } // 命名视图组件（component配置被格式化成 components.default）
  instances: { [name: string]: Vue } // 路由记录存放的组件实例
  name?: string // 路由名称
  parent?: RouteRecord // 父级路由记录
  redirect?: string | Location | (to: Route => string | Location) // 重定向目标
  matchAs?: string // 别名路由真实匹配的路由记录的path
  meta: any // 路由记录的元信息
  beforeEnter?:  (to: Route, from: Route, next: Function) => void // 路由前置守卫
  props: boolean | Object | (route: Route) => Object | { [name: string]: boolean | Object } // 路由组件的props
}
```

4. `Location`

表示路由的位置信息对象，用于路由导航时作为目标对象，使用`router.push()`、`router.replace()`以及`route-link`组件传入的配置信息所指的就是`Location`类型的对象。

```ts
interface Location {
  name?: string // 路由名称
  path?: string // 路径
  hash?: string // 哈希值
  query?: { [name: string] : string | null} // 查询参数
  params?: Object // 路由参数
  append?: boolean // 是否追加到当前路由后面
  replace?: boolean // 是否替换当前路由
}
```

总结起来就是：

+ 路由配置时，传入的每条`route`是`RouteConfig`
+ 路由实例化，会格式化转换`RouteConfig`生成`RouteRecord`，路由匹配结果中的`matched`就是`RouteReCord`组成的数组
+ 路由匹配后，基于`RouteRecord`创建的结果就是`Route`类型，路由守卫的`to`、`from`以及`this.$route`都是`Route`类型
+ 路由导航时，使用的是`Location`类型的数据，**VueRouter**会根据传入的`Locaiton`进行匹配并执行相关处理

