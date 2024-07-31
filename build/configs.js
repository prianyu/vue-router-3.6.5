const path = require('path')
const buble = require('rollup-plugin-buble')
const flow = require('rollup-plugin-flow-no-whitespace')
const cjs = require('@rollup/plugin-commonjs')
const node = require('@rollup/plugin-node-resolve').nodeResolve
const replace = require('rollup-plugin-replace')
const version = process.env.VERSION || require('../package.json').version
const banner = `/*!
  * vue-router v${version}
  * (c) ${new Date().getFullYear()} Evan You
  * @license MIT
  */`

const resolve = _path => path.resolve(__dirname, '../', _path)

module.exports = [
  // browser dev
  {
    file: resolve('dist/vue-router.js'),
    format: 'umd',
    env: 'development'
  },
  {
    file: resolve('dist/vue-router.min.js'),
    format: 'umd',
    env: 'production'
  },
  {
    file: resolve('dist/vue-router.common.js'),
    format: 'cjs'
  },
  {
    input: resolve('src/entries/esm.js'),
    file: resolve('dist/vue-router.esm.js'),
    format: 'es'
  },
  {
    input: resolve('src/entries/esm.js'),
    file: resolve('dist/vue-router.mjs'),
    format: 'es'
  },
  {
    input: resolve('src/entries/esm.js'),
    file: resolve('dist/vue-router.esm.browser.js'),
    format: 'es',
    env: 'development',
    transpile: false
  },
  {
    input: resolve('src/entries/esm.js'),
    file: resolve('dist/vue-router.esm.browser.min.js'),
    format: 'es',
    env: 'production',
    transpile: false
  },
  {
    input: resolve('src/composables/index.js'),
    file: resolve('./composables.mjs'),
    format: 'es'
  },
  {
    input: resolve('src/composables/index.js'),
    file: resolve('./composables.js'),
    format: 'cjs'
  }
].map(genConfig)

function genConfig (opts) {
  const config = {
    input: {
      input: opts.input || resolve('src/index.js'), // 入口文件
      plugins: [ // 插件
        flow(),
        node(),
        cjs(),
        replace({
          __VERSION__: version
        })
      ],
      external: ['vue']
    },
    output: { // 输出文件
      file: opts.file,
      format: opts.format,
      banner,
      name: 'VueRouter'
    }
  }

  // 环境设置
  if (opts.env) {
    config.input.plugins.unshift(
      replace({
        'process.env.NODE_ENV': JSON.stringify(opts.env)
      })
    )
  }

  // 代码转换为兼容低版本浏览器的代码
  if (opts.transpile !== false) {
    config.input.plugins.push(buble())
  }

  return config
}
