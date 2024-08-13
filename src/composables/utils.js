import { getCurrentInstance } from 'vue'

// dev only warn if no current instance
// 开发环境下检测当前是否Vue实例，没有则提示指定的方法只能在setup()和<script setup>中使用

export function throwNoCurrentInstance (method) {
  if (!getCurrentInstance()) {
    throw new Error(
      `[vue-router]: Missing current instance. ${method}() must be called inside <script setup> or setup().`
    )
  }
}
