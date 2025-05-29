import axios from 'axios'
import qs from 'qs'
import { Message, Loading } from 'element-ui'
import Vue from 'vue'

// 常量和枚举
const STATUS_CODE = {
  SUCCESS: [200, 1],
  ERROR: [500],
  EXPIRE: [401, 501]
}

// HTTP状态码枚举
const HTTP_STATUS = {
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  REQUEST_TIMEOUT: 408,
  INTERNAL_SERVER_ERROR: 500,
  NOT_IMPLEMENTED: 501,
  BAD_GATEWAY: 502,
  SERVICE_UNAVAILABLE: 503,
  GATEWAY_TIMEOUT: 504,
  HTTP_VERSION_NOT_SUPPORTED: 505
}

// 错误类型枚举
const ERROR_TYPE = {
  NETWORK_ERROR: 'Network Error',
  TIMEOUT: 'timeout',
  ERR_NETWORK: 'ERR_NETWORK',
  ECONNABORTED: 'ECONNABORTED'
}

// 错误消息枚举
const ERROR_MESSAGE = {
  UNKNOWN: '未知网络错误',
  NETWORK_ERROR: '网络连接异常，请检查您的网络连接',
  TIMEOUT: '网络请求超时，请稍后重试',
  BAD_REQUEST: '请求错误(400)',
  UNAUTHORIZED: '未授权，请重新登录(401)',
  FORBIDDEN: '拒绝访问(403)',
  NOT_FOUND: '请求出错(404)',
  REQUEST_TIMEOUT: '请求超时(408)',
  INTERNAL_SERVER_ERROR: '服务器错误(500)',
  NOT_IMPLEMENTED: '服务未实现(501)',
  BAD_GATEWAY: '网络错误(502)',
  SERVICE_UNAVAILABLE: '服务不可用(503)',
  GATEWAY_TIMEOUT: '网络超时(504)',
  HTTP_VERSION_NOT_SUPPORTED: 'HTTP版本不受支持(505)',
  ERR_NETWORK: '网络连接失败，请检查您的网络',
  ECONNABORTED: '请求超时，请检查您的网络状况',
  OFFLINE: '网络连接已断开，请检查您的网络连接'
}

const defaultLoadConfig = {
  fullscreen: true,
  text: '加载中...',
  background: 'rgba(0,0,0,0)',
  customClass: 'xn-loading'
}

class Request extends Vue {
  constructor(config = {}) {
    super()
    this.loadingState = false // 新增属性，用于跟踪加载状态
    this.pendingRequests = new Map() // 用于存储正在进行的请求
    this.setupConfig(config)
    this.axiosInstance = this.createAxiosInstance()
  }

  setupConfig(config) {
    const {
      timeout = 30000,
      tokenKey = 'xnToken',
      gateway = [],
      status_codes = STATUS_CODE,
      loading = () => Loading.service(defaultLoadConfig),
      requestConfig = {}
    } = config

    this.config = config
    this.tokenKey = tokenKey
    this.gateway = gateway
    this.timeout = timeout
    this.statusCode = status_codes
    this.loading = (typeof loading === 'function') ? loading : Loading.service(defaultLoadConfig)
    this.requestConfig = {
      ...{
        showLoading: true,
        requestBaseUrl: '',
        responseType: '',
        method: ''
      },
      ...requestConfig
    }
  }

  createAxiosInstance() {
    const instance = axios.create({ timeout: this.timeout })

    instance.interceptors.request.use(
      this.handleRequest.bind(this),
      this.handleRequestError.bind(this) // 修改为handleRequestError
    )
    instance.interceptors.response.use(
      this.handleResponse.bind(this),
      this.handleResponseError.bind(this)
    )

    return instance
  }

  // 生成请求的唯一键
  generateRequestKey(config) {
    const { url, method, params, data } = config
    return [url, method, JSON.stringify(params || {}), JSON.stringify(data || {})].join('&')
  }

  // 添加请求到映射表
  addPendingRequest(config) {
    const requestKey = this.generateRequestKey(config)

    // 如果存在相同的请求，先取消之前的请求
    if (this.pendingRequests.has(requestKey)) {
      const { controller } = this.pendingRequests.get(requestKey)
      controller.abort('用户发起了新的相同请求')
      this.pendingRequests.delete(requestKey)
    }

    // 创建新的控制器并添加到请求映射
    const controller = new AbortController()
    config.signal = controller.signal
    this.pendingRequests.set(requestKey, { controller, timestamp: Date.now() })
    return true
  }

  // 移除请求
  removePendingRequest(config) {
    const requestKey = this.generateRequestKey(config)
    if (this.pendingRequests.has(requestKey)) {
      this.pendingRequests.delete(requestKey)
    }
  }

  // 取消所有请求
  cancelAllRequests() {
    this.pendingRequests.forEach(({ controller }) => {
      controller.abort()
    })
    this.pendingRequests.clear()
  }

  handleRequest(config) {
    this.resetRequestConfig()

    // 修改这里：正确地合并配置
    // config.config 是针对 axios 配置的特殊结构，通常情况下我们直接传入的配置不会在这个属性下
    // 我们应该检查 config 本身是否已经包含 showLoading 属性
    const _config = {
      ...this.requestConfig,
      ...(config.config || {}), // 兼容原有结构
      ...config // 直接合并外层配置，确保 showLoading 等属性被正确传递
    }

    this.applyRequestConfig(config, _config)

    // 检查重复请求
    if (!this.addPendingRequest(config)) {
      return Promise.reject(new Error('重复请求已被阻止'))
    }

    // 将 _config 的 showLoading 值保存到 config 中，确保后续可以正确获取
    config.showLoading = _config.showLoading

    if (_config.showLoading) {
      this.loadingState = true // 设置加载状态为 true
      this.loadingInstance = this.loading()
    }

    this.setBaseUrl(config, _config)

    return config
  }

  handleResponse(response) {
    // 只有当 showLoading 为 true 时才关闭 loading
    if (response.config.showLoading) {
      this.closeLoading()
    }
    this.resetRequestConfig()
    // 移除已完成的请求
    this.removePendingRequest(response.config)
    return response.config.responseType === 'blob'
      ? this.handleBlobResponse(response.data)
      : this.handleJsonResponse(response.data)
  }

  handleResponseError(error) {
    // 只有当 showLoading 为 true 时才关闭 loading
    if (error.config && error.config.showLoading) {
      this.closeLoading()
    } else {
      this.closeLoading() // 保险起见，如果没有 config 也关闭
    }
    this.resetRequestConfig()
    // 如果是请求被取消的错误，不在界面上显示错误
    if (axios.isCancel(error)) {
      console.log('请求被取消:', error.message)
      return Promise.reject(error)
    }

    // 处理网络错误状态提示
    this.handleNetworkError(error)

    // 移除失败的请求
    if (error.config) {
      this.removePendingRequest(error.config)
    }
    this.$emit('error', error)
    return Promise.reject(error)
  }

  // 处理网络状态相关错误
  handleNetworkError(error) {
    let message = ERROR_MESSAGE.UNKNOWN

    if (error.message.includes(ERROR_TYPE.NETWORK_ERROR)) {
      message = ERROR_MESSAGE.NETWORK_ERROR
    } else if (error.message.includes(ERROR_TYPE.TIMEOUT)) {
      message = ERROR_MESSAGE.TIMEOUT
    } else if (error.response) {
      // HTTP 错误状态码处理
      switch (error.response.status) {
        case HTTP_STATUS.BAD_REQUEST:
          message = ERROR_MESSAGE.BAD_REQUEST
          break
        case HTTP_STATUS.UNAUTHORIZED:
          message = ERROR_MESSAGE.UNAUTHORIZED
          break
        case HTTP_STATUS.FORBIDDEN:
          message = ERROR_MESSAGE.FORBIDDEN
          break
        case HTTP_STATUS.NOT_FOUND:
          message = ERROR_MESSAGE.NOT_FOUND
          break
        case HTTP_STATUS.REQUEST_TIMEOUT:
          message = ERROR_MESSAGE.REQUEST_TIMEOUT
          break
        case HTTP_STATUS.INTERNAL_SERVER_ERROR:
          message = ERROR_MESSAGE.INTERNAL_SERVER_ERROR
          break
        case HTTP_STATUS.NOT_IMPLEMENTED:
          message = ERROR_MESSAGE.NOT_IMPLEMENTED
          break
        case HTTP_STATUS.BAD_GATEWAY:
          message = ERROR_MESSAGE.BAD_GATEWAY
          break
        case HTTP_STATUS.SERVICE_UNAVAILABLE:
          message = ERROR_MESSAGE.SERVICE_UNAVAILABLE
          break
        case HTTP_STATUS.GATEWAY_TIMEOUT:
          message = ERROR_MESSAGE.GATEWAY_TIMEOUT
          break
        case HTTP_STATUS.HTTP_VERSION_NOT_SUPPORTED:
          message = ERROR_MESSAGE.HTTP_VERSION_NOT_SUPPORTED
          break
        default:
          message = `连接出错(${error.response.status})!`
      }
    } else if (error.code === ERROR_TYPE.ERR_NETWORK) {
      message = ERROR_MESSAGE.ERR_NETWORK
    } else if (error.code === ERROR_TYPE.ECONNABORTED) {
      message = ERROR_MESSAGE.ECONNABORTED
    }

    // 显示错误消息
    this.showError(message)
  }

  closeLoading() {
    if(this.loadingInstance){
        this.loadingInstance.close()
    }
    this.loadingState = false // 重置加载状态
  }

  applyRequestConfig(config, customConfig) {
    if (customConfig.config.method === 'formData') {
      config.headers['Content-Type'] = 'application/x-www-form-urlencoded'
      config.data = qs.stringify(config.data)
    }

    if (customConfig.responseType === 'blob') {
      config.responseType = 'blob'
    }

    const token = this.getToken()
    if (token) {
      config.headers[this.tokenKey] = token
    }

    const fingerPrint = localStorage.getItem('browerID') || ''
    config.headers['browerID'] = fingerPrint
  }

  setBaseUrl(config, customConfig) {
    const gatewayMatch = this.gateway.find(item => item.name === customConfig.requestBaseUrl || item.name === 'baseUrl')
    if (!gatewayMatch) {
      throw new Error('缺少请求域名!')
    }
    config.baseURL = gatewayMatch.url
  }

  async handleBlobResponse(blob) {
    try {
      const json = await this.blobToJson(blob)
      if (json.code && json.code !== 200) {
        this.showError(json.msg || '未知错误')
        return null
      }
    } catch {
      if (blob instanceof Blob) {
        return blob
      }
    }
    return blob
  }

  handleJsonResponse(data) {
    const resCode = data.code || data.msg
    if (!this.statusCode.SUCCESS.includes(resCode)) {
      if (this.statusCode.EXPIRE.includes(resCode)) {
        this.$emit('expire', data, this)
        return Promise.reject(data)
      }
      this.showError(data.msg || '未知错误')
      return Promise.reject(data)
    }
    return data
  }

  async blobToJson(blob) {
    const reader = new FileReader()
    return new Promise((resolve, reject) => {
      reader.onload = () => {
        try {
          resolve(JSON.parse(new TextDecoder().decode(new Uint8Array(reader.result))))
        } catch (error) {
          reject(error)
        }
      }
      reader.readAsArrayBuffer(blob)
    })
  }

  getToken() {
    const storedToken = localStorage.getItem(this.tokenKey)
    try {
      return JSON.parse(storedToken)
    } catch {
      return storedToken
    }
  }

  resetRequestConfig() {
    this.requestConfig = {
      showLoading: true,
      requestBaseUrl: '',
      responseType: '',
      method: ''
    }
  }

  showError(message) {
    Message({
      message,
      type: 'error',
      duration: 5000
    })
  }

  // 添加网络状态检测方法
  checkNetworkStatus() {
    return navigator.onLine
  }

  // 修改现有的请求方法，添加网络检测
  async get(url, params, config = {}) {
    if (!this.checkNetworkStatus()) {
      this.showError(ERROR_MESSAGE.OFFLINE)
      return Promise.reject(new Error(ERROR_MESSAGE.OFFLINE))
    }
    // 将 config 作为顶层属性传递，而不是放在 config 对象中
    return this.axiosInstance.get(url, { params, ...config, config })
  }

  async post(url, params, config = {}) {
    if (!this.checkNetworkStatus()) {
      this.showError(ERROR_MESSAGE.OFFLINE)
      return Promise.reject(new Error(ERROR_MESSAGE.OFFLINE))
    }
    // 将原始配置从 config 对象复制到顶层
    // 同时保留原有的 config 属性以兼容现有代码
    return this.axiosInstance.post(url, params, {
      ...config, // 将配置扩展到顶层
      config // 同时保留 config 属性以兼容现有代码
    })
  }

  async upload(url, params, config = {}) {
    if (!this.checkNetworkStatus()) {
      this.showError(ERROR_MESSAGE.OFFLINE)
      return Promise.reject(new Error(ERROR_MESSAGE.OFFLINE))
    }
    const formData = new FormData()
    Object.entries(params).forEach(([key, value]) => formData.append(key, value))
    // 超时时间为5分钟
    return this.axiosInstance.post(url, formData, {
      timeout: 0,
      // timeout: 30000 * 60 * 5,
      onUploadProgress: (progressEvent) => {
        // 计算上传进度百分比
        const percentCompleted = Math.round((progressEvent.loaded / progressEvent.total) * 100)
        // 如果配置中有 onProgress 回调函数，则调用它
        if (config.onProgress && typeof config.onProgress === 'function') {
          config.onProgress(percentCompleted, progressEvent)
        }
      },
      ...config,
      config
    })
  }

  async formData(url, params, config = {}) {
    if (!this.checkNetworkStatus()) {
      this.showError(ERROR_MESSAGE.OFFLINE)
      return Promise.reject(new Error(ERROR_MESSAGE.OFFLINE))
    }
    const formData = new FormData()
    Object.entries(params).forEach(([key, value]) => formData.append(key, value))
    return this.axiosInstance.post(url, formData, {
      ...config,
      config
    })
  }

  async download(url, params, config = {}) {
    if (!this.checkNetworkStatus()) {
      this.showError(ERROR_MESSAGE.OFFLINE)
      return Promise.reject(new Error(ERROR_MESSAGE.OFFLINE))
    }
    return this.axiosInstance.post(url, params, {
      responseType: 'blob',
      showLoading: false,
      ...config,
      config
    })
  }

  // 添加缺失的方法
  handleRequestError(error) {
    // 只有当 showLoading 为 true 时才关闭 loading
    if (error.config && error.config.showLoading) {
      this.closeLoading()
    } else {
      this.closeLoading() // 保险起见，如果没有 config 也关闭
    }
    this.resetRequestConfig()
    // 如果是请求被取消的错误，不在界面上显示错误
    if (axios.isCancel(error)) {
      console.log('请求被取消:', error.message)
      return Promise.reject(error)
    }

    // 处理网络错误状态提示
    this.handleNetworkError(error)

    // 移除失败的请求
    if (error.config) {
      this.removePendingRequest(error.config)
    }
    this.$emit('error', error)
    return Promise.reject(error)
  }
}

// 使用正确的方式创建并导出实例
// const httpInstance = new Request()
export default Request
