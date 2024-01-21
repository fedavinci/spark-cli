## 科大讯飞星火大模型脚手架

### 安装依赖
``npm i``

### 注册讯飞星火
https://xinghuo.xfyun.cn/sparkapi => 星火认知大模型 => 星火大模型V1.5

### 启动项目
``npm run dev``

### 输入 APPID
https://console.xfyun.cn/services/cbm

服务接口认证信息 => YOUR APPID

``请输入 APPID: YOUR APPID``

### 输入 APISecret
https://console.xfyun.cn/services/cbm

服务接口认证信息 => YOUR APISecret

``请输入 APISecret: YOUR APISecret``

### 输入 APIKey
https://console.xfyun.cn/services/cbm

服务接口认证信息 => YOUR APIKey

``请输入 APIKey: YOUR APIKey``

### 交互
``spark-ai > enter your question and press enter``

### 服务接口认证信息缓存路径
``code ${process.env.HOME}/.spark-ai``

### 构建产物测试
``npm run build``

``npx spark-cli``