import axios from 'axios'
import qs from 'qs'
import { Message, Loading, Notification } from 'element-ui'
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
    this.downloadingRequests = new Map() // 用于存储正在进行的导出请求
    this.setupConfig(config)
    this.axiosInstance = this.createAxiosInstance()
  }

  setupConfig(config) {
    const {
      timeout = 0,
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
  // generateRequestKey(config) {
  //   const { url, method, params, data } = config
  //   return [url, method, JSON.stringify(params || {}), JSON.stringify(data || {})].join('&')
  // }

  // 添加请求到映射表
  // addPendingRequest(config) {
  //   const requestKey = this.generateRequestKey(config)

  //   // 如果是轮询请求，跳过重复检查
  //   if (config.isPolling) {
  //     return true
  //   }

  //   // 检查是否存在相同请求
  //   if (this.pendingRequests.has(requestKey)) {
  //     const existingRequest = this.pendingRequests.get(requestKey)
  //     const timeDiff = Date.now() - existingRequest.timestamp

  //     // 如果请求间隔小于配置的最小间隔时间（如500ms），则阻止重复请求
  //     const minInterval = config.minRequestInterval || 500
  //     if (timeDiff < minInterval) {
  //       return false // 阻止重复请求
  //     }

  //     // 如果时间间隔足够，取消之前的请求，允许新请求
  //     const { cancelToken } = existingRequest
  //     if (cancelToken) {
  //       cancelToken.cancel(`用户发起了新的相同请求${requestKey}`)
  //     }
  //     this.pendingRequests.delete(requestKey)
  //   }

  //   // 创建新的请求记录
  //   let cancelToken
  //   if (config.cancelToken) {
  //     this.pendingRequests.set(requestKey, {
  //       cancelToken: null,
  //       timestamp: Date.now(),
  //       hasExternalToken: true
  //     })
  //   } else {
  //     cancelToken = axios.CancelToken.source()
  //     config.cancelToken = cancelToken.token
  //     this.pendingRequests.set(requestKey, {
  //       cancelToken,
  //       timestamp: Date.now()
  //     })
  //   }

  //   return true
  // }

  // 移除请求
  // removePendingRequest(config) {
  //   const requestKey = this.generateRequestKey(config)
  //   if (this.pendingRequests.has(requestKey)) {
  //     this.pendingRequests.delete(requestKey)
  //   }
  // }

  // 取消所有请求
  // cancelAllRequests() {
  //   this.pendingRequests.forEach(({ cancelToken }) => {
  //     if (cancelToken) {
  //       cancelToken.cancel('取消所有请求')
  //     }
  //   })
  //   this.pendingRequests.clear()
  // }

  // 生成导出请求的唯一键
  generateDownloadKey(url, params) {
    return [url, JSON.stringify(params || {})].join('&')
  }

  // 检查是否已有相同的导出请求
  hasDownloadingRequest(url, params) {
    const downloadKey = this.generateDownloadKey(url, params)
    return this.downloadingRequests.has(downloadKey)
  }

  // 添加导出请求记录
  addDownloadingRequest(url, params, cancelToken) {
    const downloadKey = this.generateDownloadKey(url, params)
    this.downloadingRequests.set(downloadKey, {
      cancelToken,
      timestamp: Date.now()
    })
    return downloadKey
  }

  // 移除导出请求记录
  removeDownloadingRequest(downloadKey) {
    if (this.downloadingRequests.has(downloadKey)) {
      this.downloadingRequests.delete(downloadKey)
    }
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
    // if (!this.addPendingRequest(config)) {
    //   return Promise.reject(new Error('重复请求已被阻止'))
    // }

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
    // this.removePendingRequest(response.config)
    return response.config.responseType === 'blob'
      ? this.handleBlobResponse(response.data, response)
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
    if (axios.isCancel(error) || error.name === 'AbortError' || error.code === 'ERR_CANCELED') {
      return Promise.reject(error)
    }
    // 如果是上传并且如果是504，就不提示message
    if (error.message.includes(`${HTTP_STATUS.GATEWAY_TIMEOUT}`) && !error.config.isUpload) {
      // 处理网络错误状态提示
      this.handleNetworkError(error)
    }

    // 移除失败的请求
    // if (error.config) {
    //   this.removePendingRequest(error.config)
    // }
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
    this.loadingInstance && this.loadingInstance.close()
    this.loadingState = false // 重置加载状态
  }

  applyRequestConfig(config, customConfig) {
    if (customConfig.method === 'formData' || customConfig.config.method === 'formData')  {
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

  async handleBlobResponse(blob, response) {
    // 从响应头获取文件名
    const contentDisposition = response.headers['content-disposition']
    let filename = '文件导出'
    // 检查是否需要自动下载 (default: true)
    const autoDownload = response.config.autoDownload === true || response.autoDownload === true
    // 检查是否显示通知 (default: true)
    const showNotification = response.config.showNotification !== false || response.showNotification !== false
    // 获取传递过来的通知实例
    const notificationInstance = response.config.notificationInstance

    if (contentDisposition) {
      // 解析文件名
      const filenameRegex = /filename[^;=\n]*=((['"]).*?\2|[^;\n]*)/
      const matches = filenameRegex.exec(contentDisposition)
      if (matches != null && matches[1]) {
        filename = matches[1].replace(/['"]/g, '')
        // 处理 UTF-8 编码的文件名
        try {
          filename = decodeURIComponent(filename)
        } catch (e) {
          console.error('解析文件名失败:', e)
        }
      }

      if (filename && autoDownload) {
        try {
          // 创建下载链接
          const url = window.URL.createObjectURL(blob)
          const link = document.createElement('a')
          link.href = url
          link.setAttribute('download', filename)
          document.body.appendChild(link)
          link.click()
          // 清理
          document.body.removeChild(link)
          window.URL.revokeObjectURL(url)

          // 关闭进行中的通知并显示成功通知
          if (notificationInstance) {
            notificationInstance.close()
          }
          if (showNotification) {
            Notification({
              title: '导出成功',
              customClass: 'cus-el-notification',
              message: `文件"${filename}"已成功下载`,
              type: 'success',
              duration: 3000,
              offset: 30
            })
          }
        } catch (error) {
          // 关闭进行中的通知并显示失败通知
          if (notificationInstance) {
            notificationInstance.close()
          }
          if (showNotification) {
            Notification({
              title: '导出失败',
              customClass: 'cus-el-notification',
              message: `导出失败: ${error.message || '未知错误'}`,
              type: 'error',
              duration: 5000,
              offset: 30
            })
          }
        }
      } else {
        // 不自动下载时，关闭通知
        if (notificationInstance) {
          notificationInstance.close()
        }
        if (showNotification && !autoDownload) {
          Notification({
            title: '文件准备完成',
            customClass: 'cus-el-notification',
            message: `文件"${filename}"已准备就绪`,
            type: 'success',
            duration: 3000,
            offset: 30
          })
        }
      }
    } else {
      // 无文件名的情况，关闭通知
      if (notificationInstance) {
        notificationInstance.close()
      }
      if (showNotification) {
        Notification({
          title: '导出完成',
          customClass: 'cus-el-notification',
          message: '文件已准备完成',
          type: 'success',
          duration: 3000,
          offset: 30
        })
      }
    }

    // 将文件名添加到返回结果中，以便非自动下载模式下可以使用
    return {
      blob,
      filename,
      url: window.URL.createObjectURL(blob)
    }
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
      isUpload: true, // 标记为上传请求
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

    // 检查是否已有相同的导出请求正在进行
    if (this.hasDownloadingRequest(url, params)) {
      // Notification({
      //   title: '导出提示',
      //   message: '相同的导出任务正在进行中，请稍等...',
      //   type: 'warning',
      //   duration: 3000,
      //   offset: 30
      // })
      return Promise.reject(new Error('相同的导出任务正在进行中'))
    }

    // 检查是否显示通知 (default: true)
    const showNotification = config.showNotification !== false
    let notificationInstance = null
    let downloadCancelToken = null
    let timeoutId = null
    let downloadKey = null

    // 创建专门用于下载的 CancelToken
    downloadCancelToken = axios.CancelToken.source()

    // 添加到导出请求记录中
    downloadKey = this.addDownloadingRequest(url, params, downloadCancelToken)

    // 显示导出开始通知
    if (showNotification) {
      notificationInstance = Notification({
        title: '文件导出',
        customClass: 'cus-el-notification',
        dangerouslyUseHTMLString: true,
        message: '<i class="el-icon-loading"></i> 正在导出中，请稍后...',
        type: 'info',
        duration: 0, // 不自动关闭
        showClose: false,
        offset: 30
      })
    }

    // 设置30秒超时
    timeoutId = setTimeout(() => {
      if (downloadCancelToken) {
        downloadCancelToken.cancel('下载超时')

        // 关闭进行中的通知
        if (notificationInstance) {
          notificationInstance.close()
        }

        // 移除导出请求记录
        this.removeDownloadingRequest(downloadKey)

        // 显示超时提示
        if (showNotification) {
          Notification({
            title: '导出提醒',
            customClass: 'cus-el-notification',
            dangerouslyUseHTMLString: true,
            message: `
              <div>
                <p>文件过大，导出耗时，可以到导出记录里查看进度并下载</p>
                <div style="margin-top: 10px;text-align: right">
                  <button class="el-button el-button--primary el-button--mini" onclick="this.closest('.el-notification').querySelector('.el-notification__closeBtn').click()">
                    好的
                  </button>
                </div>
              </div>
            `,
            type: 'warning',
            duration: 8000, // 不自动关闭，需要用户点击"知道了"
            showClose: true,
            offset: 30,
            onClose: () => {
              downloadCancelToken.cancel('下载超时')
              this.$emit('downloadTimeout')
            }
          })
        }
      }
    }, 30000) // 30秒

    // 构建请求配置，cancelToken 必须在顶层，不能被用户配置覆盖
    const requestConfig = {
      timeout: 0,
      responseType: 'blob',
      showLoading: false,
      autoDownload: false, // 默认不自动下载
      showNotification: true,
      notificationInstance,
      ...config, // 先合并用户配置
      cancelToken: downloadCancelToken.token, // 最后设置 cancelToken，确保不被覆盖
      config: {
        ...config,
        notificationInstance,
        downloadCancelToken
      }
    }

    try {
      const result = await this.axiosInstance.post(url, params, requestConfig)

      // 请求成功，清除超时定时器和导出请求记录
      if (timeoutId) {
        clearTimeout(timeoutId)
      }
      this.removeDownloadingRequest(downloadKey)

      return result
    } catch (error) {
      // 清除超时定时器和导出请求记录
      if (timeoutId) {
        clearTimeout(timeoutId)
      }
      this.removeDownloadingRequest(downloadKey)

      // 检查是否是被取消的请求
      if (axios.isCancel(error)) {
        return Promise.reject(error)
      }

      // 如果请求失败，关闭通知
      if (notificationInstance) {
        notificationInstance.close()
      }

      // 显示其他错误的通知
      if (showNotification) {
        Notification({
          title: '导出失败',
          customClass: 'cus-el-notification',
          message: `导出失败: ${error.message || error.msg || '未知错误'}`,
          type: 'error',
          duration: 5000,
          offset: 30
        })
      }

      throw error
    }
  }

  async download2link(url, params, config = {}) {
    if (!this.checkNetworkStatus()) {
      this.showError(ERROR_MESSAGE.OFFLINE)
      return Promise.reject(new Error(ERROR_MESSAGE.OFFLINE))
    }

    // 检查是否已有相同的导出请求正在进行
    if (this.hasDownloadingRequest(url, params)) {
      return Promise.reject(new Error('相同的导出任务正在进行中'))
    }

    // 检查是否显示通知 (default: true)
    const showNotification = config.showNotification !== false
    // 检查是否自动下载 (default: true)
    const autoDownload = config.autoDownload !== false
    let notificationInstance = null
    let downloadCancelToken = null
    let timeoutId = null
    let downloadKey = null

    // 创建专门用于下载的 CancelToken
    downloadCancelToken = axios.CancelToken.source()

    // 添加到导出请求记录中
    downloadKey = this.addDownloadingRequest(url, params, downloadCancelToken)

    // 显示导出开始通知
    if (showNotification) {
      notificationInstance = Notification({
        title: '文件导出',
        customClass: 'cus-el-notification',
        dangerouslyUseHTMLString: true,
        message: '<i class="el-icon-loading"></i> 正在导出中，请稍后...',
        type: 'info',
        duration: 0, // 不自动关闭
        showClose: false,
        offset: 30
      })
    }

    // 设置30秒超时
    timeoutId = setTimeout(() => {
      if (downloadCancelToken) {
        // 关闭进行中的通知
        if (notificationInstance) {
          notificationInstance.close()
        }

        // 移除导出请求记录
        this.removeDownloadingRequest(downloadKey)

        // 显示超时提示
        if (showNotification) {
          Notification({
            title: '导出提醒',
            customClass: 'cus-el-notification',
            dangerouslyUseHTMLString: true,
            message: `
              <div>
                <p>文件过大，导出耗时，可以到导出记录里查看进度并下载</p>
                <div style="margin-top: 10px;text-align: right">
                  <button class="el-button el-button--primary el-button--mini" onclick="this.closest('.el-notification').querySelector('.el-notification__closeBtn').click()">
                    好的
                  </button>
                </div>
              </div>
            `,
            type: 'warning',
            duration: 8000,
            showClose: true,
            offset: 30,
            onClose: () => {
              downloadCancelToken.cancel('下载超时')
              this.$emit('downloadTimeout')
            }
          })
        }
      }
    }, 30000) // 30秒

    // 构建请求配置
    const requestConfig = {
      timeout: 0,
      showLoading: false,
      ...config,
      cancelToken: downloadCancelToken.token,
      config: {
        ...config,
        notificationInstance,
        downloadCancelToken
      }
    }

    try {
      // 发送请求获取下载链接
      const response = await this.axiosInstance.post(url, params, requestConfig)

      // 请求成功，清除超时定时器和导出请求记录
      if (timeoutId) {
        clearTimeout(timeoutId)
      }
      this.removeDownloadingRequest(downloadKey)

      // 获取返回的数据
      const responseData = response.data || response
      const { name, url: downloadUrl } = responseData

      if (!downloadUrl) {
        // 关闭进行中的通知
        if (notificationInstance) {
          notificationInstance.close()
        }
        if (showNotification) {
          Notification({
            title: '导出失败',
            customClass: 'cus-el-notification',
            message: '未获取到有效的下载链接',
            type: 'error',
            duration: 5000,
            offset: 30
          })
        }
        return Promise.reject(new Error('未获取到有效的下载链接'))
      }

      // 如果需要自动下载
      if (autoDownload) {
        try {
          // 创建下载链接
          const link = document.createElement('a')
          link.href = downloadUrl
          link.setAttribute('download', name || '下载文件')
          link.setAttribute('target', '_blank')
          document.body.appendChild(link)
          link.click()
          // 清理
          document.body.removeChild(link)

          // 关闭进行中的通知并显示成功通知
          if (notificationInstance) {
            notificationInstance.close()
          }
          if (showNotification) {
            Notification({
              title: '导出成功',
              customClass: 'cus-el-notification',
              message: `文件"${name || '下载文件'}"已成功下载`,
              type: 'success',
              duration: 3000,
              offset: 30
            })
          }
        } catch (error) {
          // 关闭进行中的通知并显示失败通知
          if (notificationInstance) {
            notificationInstance.close()
          }
          if (showNotification) {
            Notification({
              title: '导出失败',
              customClass: 'cus-el-notification',
              message: `下载失败: ${error.message || '未知错误'}`,
              type: 'error',
              duration: 5000,
              offset: 30
            })
          }
        }
      } else {
        // 不自动下载时，关闭通知
        if (notificationInstance) {
          notificationInstance.close()
        }
        if (showNotification) {
          Notification({
            title: '文件准备完成',
            customClass: 'cus-el-notification',
            message: `文件"${name || '下载文件'}"已准备就绪`,
            type: 'success',
            duration: 3000,
            offset: 30
          })
        }
      }

      // 返回结果，包含文件信息
      return {
        name,
        url: downloadUrl,
        originalResponse: responseData
      }
    } catch (error) {
      // 清除超时定时器和导出请求记录
      if (timeoutId) {
        clearTimeout(timeoutId)
      }
      this.removeDownloadingRequest(downloadKey)

      // 检查是否是被取消的请求
      if (axios.isCancel(error)) {
        return Promise.reject(error)
      }

      // 如果请求失败，关闭通知
      if (notificationInstance) {
        notificationInstance.close()
      }

      // 显示其他错误的通知
      if (showNotification) {
        Notification({
          title: '导出失败',
          customClass: 'cus-el-notification',
          message: `导出失败: ${error.message || error.msg || '未知错误'}`,
          type: 'error',
          duration: 5000,
          offset: 30
        })
      }

      throw error
    }
  }

  // 轮询请求配置处理
  createPollingConfig(config = {}) {
    return {
      ...config,
      isPolling: true,
      showLoading: false, // 轮询请求通常不显示loading
      config: {
        ...config,
        isPolling: true
      }
    }
  }

  // GET轮询请求
  async polling(url, params, config = {}) {
    if (!this.checkNetworkStatus()) {
      this.showError(ERROR_MESSAGE.OFFLINE)
      return Promise.reject(new Error(ERROR_MESSAGE.OFFLINE))
    }

    const pollingConfig = this.createPollingConfig(config)
    return this.axiosInstance.get(url, { params, ...pollingConfig })
  }

  // POST轮询请求
  async pollingPost(url, params, config = {}) {
    if (!this.checkNetworkStatus()) {
      this.showError(ERROR_MESSAGE.OFFLINE)
      return Promise.reject(new Error(ERROR_MESSAGE.OFFLINE))
    }

    const pollingConfig = this.createPollingConfig(config)
    return this.axiosInstance.post(url, params, pollingConfig)
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
      return Promise.reject(error)
    }

    // 处理网络错误状态提示
    this.handleNetworkError(error)

    // 移除失败的请求
    // if (error.config) {
    //   this.removePendingRequest(error.config)
    // }
    this.$emit('error', error)
    return Promise.reject(error)
  }
}

// 使用正确的方式创建并导出实例
// const httpInstance = new Request()
export default Request
