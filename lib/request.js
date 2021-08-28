
/**
 * @class Request
 * 二次封装请求
 * 2021年8月18日
 */

 import axios from 'axios'
 import qs from 'qs'
 import { Message, Loading } from 'element-ui'
 import storage from 'xianniu-tools/utils/storage' 
 import Vue from 'vue'
 // 状态码
 const STATUS_CODE = {
     'SUCCESS': 200, // 请求成功
     'ERROR': 500, // 请求失败
     'EXPIRE': [401, 501] // 登录过期
 }
 // 网关
 // const GATEWAY = ['TS', 'TP', 'OMS', 'PM', 'AUTH', 'ORDER', 'BUSINESS']
 let loadingInit = null
 const loadConfig = {
     fullscreen: true,
     text: '玩命加载中...',
     background: 'rgba(0,0,0,0)',
     customClass: 'xn-loading'
 }
 class Request extends Vue {
     /**
      * 基础配置项
      * @param {Object} config 基础配置项
      * @property {String} token 请求token
      * @property {String} tokenKey token接收字段
      * @property {Array} gateway 网关
      * @property {Array} statusCode 自定义状态码
      * @property {Function} statusCode 自定义loading
      * @return new Request()
      */
     constructor(config = {}) {
         super()
         this.config = config
        //  this.token = config.token || ''
         this.tokenKey = config.tokenKey || 'xnToken'
         this.gateway = config.gateway || []
         this.statusCode = config.status_codes ? [...config.status_codes, ...STATUS_CODE] : STATUS_CODE
         this.loading = () => typeof config.loading === 'function' && config.loading || Loading.service(loadConfig)
         this.axios = this.instance()
         this.requestConfig = config.requestConfig || {
             showLoading: true,
             requestBaseUrl: '',
             responseType: '',
             method: ''
         }
     }
     // 重置请求自定义配置
     resetRequestConfig() {
         this.requestConfig = {
             showLoading: true,
             requestBaseUrl: '',
             responseType: '',
             method: ''
         }
     }
     // 实例化axios
     instance() {
         const instance = axios.create({
             timeout: 30000
         })
 
         // 请求体
         instance.interceptors.request.use(
             (config) => {
                 this.resetRequestConfig()
                 let _config = config.config
                 _config = Object.assign(this.requestConfig, _config)
                 if (_config.method === 'formData') {
                     config.headers['Content-Type'] = 'application/x-www-form-urlencoded'
                     config.data = qs.stringify(config.data)
                 }
                 if (_config.responseType === 'blob') {
                     config.responseType = 'blob'
                 }
                 if (this.token) {
                     config.headers[this.tokenKey] = storage.get(this.tokenKey) || ''
                 }
                 if (_config.showLoading) {
                     loadingInit = this.loading()
                 }
                 if (this.gateway.length) {
                     for (let i = 0; i < this.gateway.length; i++) {
                         const item = this.gateway[i];
                         if (item.name === 'baseUrl') {
                             config.baseURL = item.url
                         } else {
                             if (item.name === _config.requestBaseUrl) {
                                 config.baseURL = item.url
                                 break
                             }
                         }
                     }
                 } else {
                     throw new Error('缺少请求域名!')
                 }
                 return config
             },
             (error) => {
                 return Promise.reject(error)
             }
         )
         instance.interceptors.response.use(
             (response) => {
                 const res = response.data
                 if (loadingInit) {
                     loadingInit.close()
                 }
                 // 重置
                 this.resetRequestConfig()
                 // 文件流下载
                 if (response.config.responseType === 'blob') return res
                 
                 // 处理响应
                 if (res.code !== this.statusCode.SUCCESS) { // 如果请求不成功
                     const msg = res.msg
                     Message({
                         message: msg || '未知错误',
                         type: 'error',
                         duration: 5 * 1000
                     })
                     if (this.statusCode.EXPIRE.includes(res.code)) {
                         this.$emit('expire', res, this) // 过期
                     }
                     return Promise.reject(msg)
                 } else {
                     return res
                 }
             },
             (error) => {
                 if (loadingInit) {
                     loadingInit.close()
                 }
                 this.$emit('error', error)
                 // 重置
                 this.resetRequestConfig()
                 return Promise.reject(error)
             }
         )
         return instance
     }
 
     //    instance.interceptors.request.use()
     async get(url, params, config = {}) {
         return await this.axios.get(url, { params, config })
     }
     async post(url, params, config = {}) {
         return await this.axios.post(url, params, { config })
     }
     async upload(url, params, config = {}) {
         const formData = new FormData()
         formData.append('file', params)
         return await this.axios.post(url, formData, { config })
     }
     async download(
         url,
         params,
         config = { responseType: 'blob', showLoading: false }
     ) {
         return await this.axios.post(url, params, { config })
     }
 }
 export default Request
 