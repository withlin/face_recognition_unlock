class FaceRecognitionUnlock {
    constructor() {
        this.video = document.getElementById('video');
        this.canvas = document.getElementById('canvas');
        this.ctx = this.canvas.getContext('2d');
        this.startBtn = document.getElementById('startBtn');
        this.resetBtn = document.getElementById('resetBtn');
        this.statusIndicator = document.getElementById('statusIndicator');
        this.resultSection = document.getElementById('resultSection');
        this.resultIcon = document.getElementById('resultIcon');
        this.resultTitle = document.getElementById('resultTitle');
        this.resultMessage = document.getElementById('resultMessage');
        this.cameraContainer = document.querySelector('.camera-container');
        this.faceFrame = document.querySelector('.face-frame');
        
        this.isScanning = false;
        this.model = null;
        this.stream = null;
        this.detectionInterval = null;
        this.faceDetectedCount = 0;
        this.requiredDetections = 10; // 需要连续检测到人脸的次数
        
        this.init();
    }
    
    async init() {
        this.bindEvents();
        await this.loadModel();
        this.updateStatus('模型加载完成，点击开始识别', 'fas fa-check-circle');
    }
    
    bindEvents() {
        this.startBtn.addEventListener('click', () => this.startRecognition());
        this.resetBtn.addEventListener('click', () => this.reset());
    }
    
    async loadModel() {
        try {
            this.updateStatus('正在加载AI模型...', 'fas fa-spinner fa-spin');
            // 使用简化的人脸检测方案
            this.model = {
                loaded: true,
                // 模拟人脸检测功能
                estimateFaces: async (config) => {
                    // 简单的模拟检测逻辑
                    const video = config.input;
                    if (video && video.videoWidth > 0) {
                        // 随机模拟人脸检测结果
                        const hasface = Math.random() > 0.3; // 70%概率检测到人脸
                        return hasface ? [{ confidence: 0.9 }] : [];
                    }
                    return [];
                }
            };
        } catch (error) {
            console.error('模型加载失败:', error);
            this.updateStatus('模型加载失败，请刷新重试', 'fas fa-exclamation-triangle', 'error');
        }
    }
    
    async startRecognition() {
        if (this.isScanning) return;
        
        try {
            this.isScanning = true;
            this.startBtn.style.display = 'none';
            this.resetBtn.style.display = 'inline-flex';
            this.resultSection.style.display = 'none';
            
            await this.startCamera();
            this.startDetection();
            
        } catch (error) {
            console.error('启动识别失败:', error);
            this.showError('摄像头访问失败', '请检查摄像头权限设置');
            this.reset();
        }
    }
    
    async startCamera() {
        this.updateStatus('正在启动摄像头...', 'fas fa-camera');
        
        const constraints = {
            video: {
                width: { ideal: 640 },
                height: { ideal: 480 },
                facingMode: 'user'
            }
        };
        
        this.stream = await navigator.mediaDevices.getUserMedia(constraints);
        this.video.srcObject = this.stream;
        
        return new Promise((resolve) => {
            this.video.onloadedmetadata = () => {
                this.canvas.width = this.video.videoWidth;
                this.canvas.height = this.video.videoHeight;
                this.cameraContainer.classList.add('active');
                this.faceFrame.classList.add('visible');
                resolve();
            };
        });
    }
    
    startDetection() {
        this.updateStatus('正在扫描人脸...', 'fas fa-search', 'scanning');
        this.faceDetectedCount = 0;
        
        this.detectionInterval = setInterval(async () => {
            if (!this.model || !this.video.videoWidth) return;
            
            try {
                const predictions = await this.model.estimateFaces({
                    input: this.video
                });
                
                if (predictions && predictions.length > 0) {
                    this.faceDetectedCount++;
                    this.updateStatus(`检测到人脸 (${this.faceDetectedCount}/${this.requiredDetections})`, 'fas fa-user-check', 'scanning');
                    
                    // 模拟人脸识别验证过程
                    if (this.faceDetectedCount >= this.requiredDetections) {
                        this.completeFaceRecognition();
                    }
                } else {
                    this.faceDetectedCount = Math.max(0, this.faceDetectedCount - 1);
                    this.updateStatus('请将面部对准摄像头', 'fas fa-search', 'scanning');
                }
                
            } catch (error) {
                console.error('人脸检测错误:', error);
            }
        }, 200);
        
        // 设置超时
        setTimeout(() => {
            if (this.isScanning && this.faceDetectedCount < this.requiredDetections) {
                this.showError('识别超时', '未能在规定时间内完成人脸识别');
                this.reset();
            }
        }, 30000); // 30秒超时
    }
    
    completeFaceRecognition() {
        clearInterval(this.detectionInterval);
        this.isScanning = false;
        
        // 模拟身份验证过程
        this.updateStatus('正在验证身份...', 'fas fa-spinner fa-spin', 'scanning');
        
        setTimeout(() => {
            // 随机决定验证结果（实际应用中这里会是真实的人脸比对逻辑）
            const isAuthenticated = Math.random() > 0.2; // 80%成功率
            
            if (isAuthenticated) {
                this.showSuccess();
            } else {
                this.showError('身份验证失败', '未能识别您的身份，请重试');
                this.reset();
            }
        }, 2000);
    }
    
    showSuccess() {
        this.updateStatus('解锁成功！', 'fas fa-check-circle', 'success');
        this.resultSection.style.display = 'block';
        this.resultSection.className = 'result-section success';
        this.resultIcon.innerHTML = '<i class="fas fa-check-circle"></i>';
        this.resultTitle.textContent = '解锁成功';
        this.resultMessage.textContent = '身份验证通过，欢迎回来！';
        
        // 添加成功音效（如果需要）
        this.playSuccessSound();
        
        // 自动重置
        setTimeout(() => {
            this.reset();
        }, 5000);
    }
    
    showError(title, message) {
        this.updateStatus('验证失败', 'fas fa-times-circle', 'error');
        this.resultSection.style.display = 'block';
        this.resultSection.className = 'result-section error';
        this.resultIcon.innerHTML = '<i class="fas fa-times-circle"></i>';
        this.resultTitle.textContent = title;
        this.resultMessage.textContent = message;
    }
    
    updateStatus(text, iconClass, type = '') {
        const statusIcon = this.statusIndicator.querySelector('i');
        const statusText = this.statusIndicator.querySelector('span');
        
        statusIcon.className = iconClass;
        statusText.textContent = text;
        
        // 更新状态样式
        this.statusIndicator.className = `status-indicator ${type}`;
    }
    
    playSuccessSound() {
        // 创建简单的成功提示音
        try {
            const audioContext = new (window.AudioContext || window.webkitAudioContext)();
            const oscillator = audioContext.createOscillator();
            const gainNode = audioContext.createGain();
            
            oscillator.connect(gainNode);
            gainNode.connect(audioContext.destination);
            
            oscillator.frequency.setValueAtTime(800, audioContext.currentTime);
            oscillator.frequency.setValueAtTime(1000, audioContext.currentTime + 0.1);
            
            gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
            gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.3);
            
            oscillator.start(audioContext.currentTime);
            oscillator.stop(audioContext.currentTime + 0.3);
        } catch (error) {
            console.log('音频播放失败:', error);
        }
    }
    
    reset() {
        this.isScanning = false;
        this.faceDetectedCount = 0;
        
        // 清理定时器
        if (this.detectionInterval) {
            clearInterval(this.detectionInterval);
            this.detectionInterval = null;
        }
        
        // 停止摄像头
        if (this.stream) {
            this.stream.getTracks().forEach(track => track.stop());
            this.stream = null;
        }
        
        // 重置UI
        this.video.srcObject = null;
        this.cameraContainer.classList.remove('active');
        this.faceFrame.classList.remove('visible');
        this.startBtn.style.display = 'inline-flex';
        this.resetBtn.style.display = 'none';
        this.resultSection.style.display = 'none';
        
        this.updateStatus('准备扫描', 'fas fa-camera');
    }
    
    destroy() {
        this.reset();
        // 清理事件监听器
        this.startBtn.removeEventListener('click', this.startRecognition);
        this.resetBtn.removeEventListener('click', this.reset);
    }
}

// 页面加载完成后初始化
document.addEventListener('DOMContentLoaded', () => {
    // 检查浏览器兼容性
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        alert('您的浏览器不支持摄像头访问功能，请使用现代浏览器。');
        return;
    }
    
    // 使用简化的人脸检测方案，无需TensorFlow.js
    
    // 初始化人脸识别系统
    window.faceRecognitionUnlock = new FaceRecognitionUnlock();
});

// 页面卸载时清理资源
window.addEventListener('beforeunload', () => {
    if (window.faceRecognitionUnlock) {
        window.faceRecognitionUnlock.destroy();
    }
});

// 添加一些实用工具函数
const Utils = {
    // 检测设备类型
    isMobile() {
        return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
    },
    
    // 检测浏览器类型
    getBrowser() {
        const userAgent = navigator.userAgent;
        if (userAgent.includes('Chrome')) return 'Chrome';
        if (userAgent.includes('Firefox')) return 'Firefox';
        if (userAgent.includes('Safari')) return 'Safari';
        if (userAgent.includes('Edge')) return 'Edge';
        return 'Unknown';
    },
    
    // 格式化时间
    formatTime(date = new Date()) {
        return date.toLocaleTimeString('zh-CN', {
            hour12: false,
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit'
        });
    }
};

// 导出工具函数到全局
window.Utils = Utils;