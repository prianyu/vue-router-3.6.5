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

## 
