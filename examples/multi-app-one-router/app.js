import Vue from 'vue'
import VueRouter from 'vue-router'

// 1. Use plugin.
// This installs <router-view> and <router-link>,
// and injects $router and $route to all router-enabled child components
Vue.use(VueRouter)

const Home = { template: '<div>home</div>' }
const Foo = { template: '<div>foo</div>' }

// 3. Create the router
const router = new VueRouter({
  mode: 'history',
  base: __dirname,
  routes: [
    { path: '/', component: Home },
    { path: '/foo', component: Foo }
  ]
})

const looper = [1, 2, 3]

looper.forEach((n) => {
  const vueInstance = new Vue({
    router,
    template: `
      <div id="app-${n}">
        <h1>Basic</h1>
        <ul>
          <li><router-link to="/">/</router-link></li>
          <li><router-link to="/foo">/foo</router-link></li>
        </ul>
        <router-view class="view"></router-view>
      </div>
    `
  }).$mount('#app-' + n)
  console.log(vueInstance)
})
