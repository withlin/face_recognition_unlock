class FaceRecognitionSystem {
    constructor() {
        this.initializeElements();
        this.currentMode = 'enroll'; // 'enroll' or 'unlock'
        this.currentStep = 1;
        this.maxSteps = 4;
        this.isProcessing = false;
        this.stream = null;
        this.enrolledFaces = [];
        this.faceDescriptors = [];
        
        // MediaPipe Face Detection
        this.faceDetector = null;
        this.isModelLoaded = false;
        this.lastEyeAspectRatio = null;
        this.blinkCounter = 0;
        this.frameCounter = 0;
        this.earHistory = [];
        this.isBlinking = false;
        this.blinkStartFrame = 0;
        this.framesSinceLastBlink = 0;
        this.lastBlinkTime = 0;
        this.headPoseHistory = [];
        this.livenessScore = 0;
        
        // 活体检测相关
        this.livenessChecks = {
            blinkDetected: false,
            headMovement: false,
            faceStability: 0
        };
        
        this.storageManager = new LocalStorageManager();
        this.currentUser = null;
        
        this.init();
    }
    
    initializeElements() {
        this.video = document.getElementById('video');
        this.canvas = document.getElementById('canvas');
        this.ctx = this.canvas.getContext('2d');
        this.startBtn = document.getElementById('startBtn');
        this.resetBtn = document.getElementById('resetBtn');
        this.clearDataBtn = document.getElementById('clearDataBtn');
        this.statusIndicator = document.getElementById('statusIndicator');
        this.resultSection = document.getElementById('resultSection');
        this.resultIcon = document.getElementById('resultIcon');
        this.resultTitle = document.getElementById('resultTitle');
        this.resultMessage = document.getElementById('resultMessage');
        this.cameraContainer = document.querySelector('.camera-container');
        this.faceFrame = document.querySelector('.face-frame');
        this.modeSelector = document.getElementById('modeSelector');
        this.enrollBtn = document.getElementById('enrollBtn');
        this.unlockBtn = document.getElementById('unlockBtn');
        this.enrollSteps = document.getElementById('enrollSteps');
        this.mainTitle = document.getElementById('mainTitle');
        this.subtitle = document.getElementById('subtitle');
        this.startBtnText = document.getElementById('startBtnText');
    }
    
    async init() {
        await this.initializeSystem();
    }

    async initializeSystem() {
        try {
            // Load MediaPipe Face Detection model
            await this.loadFaceDetectionModel();
            
            // Load user data from localStorage
            this.loadUserData();
            
            this.bindEvents();
            this.checkStoredData();
            this.updateUI();
        } catch (error) {
            console.error('系统初始化失败:', error);
            this.updateStatus('系统初始化失败', 'fas fa-exclamation-triangle', 'error');
        }
    }

    async loadFaceDetectionModel() {
        try {
            this.updateStatus('正在加载人脸检测模型...', 'fas fa-spinner fa-spin');
            
            // Load BlazeFace model
            this.faceDetector = await blazeface.load();
            
            this.isModelLoaded = true;
            this.updateStatus('人脸检测模型加载完成', 'fas fa-check-circle', 'success');
            console.log('BlazeFace模型加载成功');
        } catch (error) {
            console.error('模型加载失败:', error);
            this.updateStatus('模型加载失败，请刷新页面重试', 'fas fa-exclamation-triangle', 'error');
            throw error;
        }
    }

    loadUserData() {
        try {
            const userData = this.storageManager.getCurrentUser();
            if (userData) {
                this.currentUser = userData;
                console.log('用户数据加载成功');
            }
        } catch (error) {
            console.error('用户数据加载失败:', error);
        }
    }
    
    bindEvents() {
        this.startBtn.addEventListener('click', () => this.startProcess());
        this.resetBtn.addEventListener('click', () => this.reset());
        this.clearDataBtn.addEventListener('click', () => this.clearStoredData());
        this.enrollBtn.addEventListener('click', () => this.switchMode('enroll'));
        this.unlockBtn.addEventListener('click', () => this.switchMode('unlock'));
    }
    
    switchMode(mode) {
        if (this.isProcessing) return;
        
        this.currentMode = mode;
        this.currentStep = 1;
        
        // 更新按钮状态
        this.enrollBtn.classList.toggle('active', mode === 'enroll');
        this.unlockBtn.classList.toggle('active', mode === 'unlock');
        
        this.updateUI();
        this.reset();
    }
    
    updateUI() {
        if (this.currentMode === 'enroll') {
            this.mainTitle.textContent = '人脸录入';
            this.subtitle.textContent = '请按照步骤完成人脸信息录入';
            this.startBtnText.textContent = '开始录入';
            this.enrollSteps.style.display = 'block';
        } else {
            this.mainTitle.textContent = '人脸解锁';
            this.subtitle.textContent = '请将面部对准摄像头进行身份验证';
            this.startBtnText.textContent = '开始解锁';
            this.enrollSteps.style.display = 'none';
        }
        
        this.updateStepIndicator();
    }
    
    updateStepIndicator() {
        const steps = document.querySelectorAll('.step');
        steps.forEach((step, index) => {
            const stepNumber = index + 1;
            step.classList.remove('active', 'completed');
            
            if (stepNumber < this.currentStep) {
                step.classList.add('completed');
            } else if (stepNumber === this.currentStep) {
                step.classList.add('active');
            }
        });
    }
    
    checkStoredData() {
        const storedFaces = localStorage.getItem('enrolledFaces');
        if (storedFaces) {
            this.enrolledFaces = JSON.parse(storedFaces);
            this.clearDataBtn.style.display = 'inline-flex';
        }
    }
    
    async startProcess() {
        if (this.isProcessing) return;
        
        if (this.currentMode === 'unlock' && this.enrolledFaces.length === 0) {
            this.showError('未找到录入数据', '请先录入人脸信息');
            return;
        }
        
        try {
            this.isProcessing = true;
            this.startBtn.style.display = 'none';
            this.resetBtn.style.display = 'inline-flex';
            this.resultSection.style.display = 'none';
            this.modeSelector.style.display = 'none';
            
            await this.startCamera();
            
            if (this.currentMode === 'enroll') {
                this.startEnrollment();
            } else {
                this.startUnlock();
            }
            
        } catch (error) {
            console.error('启动失败:', error);
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
    
    startEnrollment() {
        this.updateStatus(this.getStepInstruction(), 'fas fa-user-plus', 'scanning');
        this.enrollmentInterval = setInterval(async () => {
            await this.processEnrollmentStep();
        }, 100);
        
        // 步骤超时
        this.stepTimeout = setTimeout(() => {
            if (this.isProcessing) {
                this.nextEnrollmentStep();
            }
        }, 5000);
    }
    
    getStepInstruction() {
        const instructions = {
            1: '请保持正面朝向摄像头',
            2: '请缓慢向左转动头部',
            3: '请缓慢向右转动头部',
            4: '请眨眼确认身份'
        };
        return instructions[this.currentStep] || '录入中...';
    }
    
    async processEnrollmentStep() {
        if (!this.video.videoWidth) return;
        
        // 捕获当前帧
        this.ctx.drawImage(this.video, 0, 0, this.canvas.width, this.canvas.height);
        const imageData = this.ctx.getImageData(0, 0, this.canvas.width, this.canvas.height);
        
        // 模拟人脸检测和特征提取
        const faceDetected = await this.detectFace();
        
        if (faceDetected) {
            await this.captureFaceData();
            
            // 检查是否完成当前步骤
            if (this.isStepCompleted()) {
                this.nextEnrollmentStep();
            }
        }
    }
    
    async detectFace() {
        if (!this.isModelLoaded || !this.faceDetector) {
            return null;
        }

        try {
            // 使用BlazeFace进行人脸检测
            const predictions = await this.faceDetector.estimateFaces(this.video, false);
            
            if (predictions && predictions.length > 0) {
                const face = predictions[0];
                
                // 简化的眨眼检测（基于面部区域变化）
                const eyeAspectRatio = this.calculateSimpleEyeAspectRatio(face);
                this.detectBlink(eyeAspectRatio);
                
                return {
                    confidence: face.probability || 0.9,
                    landmarks: face.landmarks,
                    boundingBox: {
                        topLeft: face.topLeft,
                        bottomRight: face.bottomRight
                    },
                    eyeAspectRatio: eyeAspectRatio
                };
            }
            
            return null;
        } catch (error) {
            console.error('人脸检测错误:', error);
            return null;
        }
    }

    calculateSimpleEyeAspectRatio(face) {
        if (!face || !face.landmarks) {
            return 0.3; // 默认值
        }
        
        // 使用BlazeFace的6个关键点进行简化的眨眼检测
        // landmarks: [右眼, 左眼, 鼻尖, 嘴巴, 右耳, 左耳]
        const landmarks = face.landmarks;
        if (landmarks.length >= 6) {
            const rightEye = landmarks[0];
            const leftEye = landmarks[1];
            const nose = landmarks[2];
            
            // 计算眼睛到鼻子的距离比例作为简化的EAR
            const rightEyeToNose = Math.sqrt(
                Math.pow(rightEye[0] - nose[0], 2) + Math.pow(rightEye[1] - nose[1], 2)
            );
            const leftEyeToNose = Math.sqrt(
                Math.pow(leftEye[0] - nose[0], 2) + Math.pow(leftEye[1] - nose[1], 2)
            );
            const eyeDistance = Math.sqrt(
                Math.pow(rightEye[0] - leftEye[0], 2) + Math.pow(rightEye[1] - leftEye[1], 2)
            );
            
            return (rightEyeToNose + leftEyeToNose) / (2 * eyeDistance);
        }
        
        return 0.3;
    }

    // 移除了复杂的MediaPipe眼部纵横比计算，改用简化版本
    
    euclideanDistance(point1, point2) {
        if (!point1 || !point2) return 0;
        return Math.sqrt(
            Math.pow(point1.x - point2.x, 2) + 
            Math.pow(point1.y - point2.y, 2)
        );
    }

    detectBlink(currentEyeAspectRatio) {
        // 更新EAR历史记录
        if (!this.earHistory) {
            this.earHistory = [];
        }
        this.earHistory.push(currentEyeAspectRatio);
        if (this.earHistory.length > 10) {
            this.earHistory.shift();
        }
        
        // 动态阈值计算
        const avgHistoryEAR = this.earHistory.reduce((sum, ear) => sum + ear, 0) / this.earHistory.length;
        const blinkThreshold = Math.min(0.25, avgHistoryEAR * 0.7); // 动态阈值
        
        // 检测眨眼
        if (currentEyeAspectRatio < blinkThreshold) {
            if (!this.isBlinking && this.framesSinceLastBlink > 5) {
                this.isBlinking = true;
                this.blinkStartFrame = this.frameCounter;
            }
            this.frameCounter += 1;
        } else if (currentEyeAspectRatio > blinkThreshold * 1.2) {
            if (this.isBlinking && this.frameCounter >= 2) {
                const blinkDuration = this.frameCounter;
                // 验证眨眼持续时间（防止误检测）
                if (blinkDuration >= 2 && blinkDuration <= 15) {
                    this.blinkCounter += 1;
                    this.livenessChecks.blinkDetected = true;
                    this.framesSinceLastBlink = 0;
                    this.lastBlinkTime = Date.now();
                    console.log('检测到有效眨眼，总计:', this.blinkCounter, '持续帧数:', blinkDuration);
                }
                this.isBlinking = false;
            }
            this.frameCounter = 0;
        }
        
        this.framesSinceLastBlink++;
        this.lastEyeAspectRatio = currentEyeAspectRatio;
    }
    
    isSkinColor(r, g, b) {
        // 简化的肤色检测算法
        return r > 95 && g > 40 && b > 20 && 
               r > g && r > b && 
               r - g > 15 && 
               Math.abs(r - g) > 15;
    }
    
    async captureFaceData() {
        // 检测人脸并提取特征
        const detectedFace = await this.detectFace();
        if (!detectedFace) return;
        
        const features = this.extractFaceFeatures(detectedFace);
        if (!features) return;
        
        const faceData = {
            step: this.currentStep,
            timestamp: Date.now(),
            features: features
        };
        
        if (!this.faceDescriptors[this.currentStep - 1]) {
            this.faceDescriptors[this.currentStep - 1] = [];
        }
        this.faceDescriptors[this.currentStep - 1].push(faceData);
    }
    
    extractFaceFeatures(faceData) {
        if (!faceData || !faceData.landmarks) {
            return null;
        }
        
        try {
            const landmarks = faceData.landmarks;
            const boundingBox = faceData.boundingBox;
            
            // BlazeFace提供6个关键点: [右眼, 左眼, 鼻尖, 嘴巴, 右耳, 左耳]
            if (landmarks.length < 6) {
                return null;
            }
            
            const [rightEye, leftEye, nose, mouth, rightEar, leftEar] = landmarks;
            
            // 计算面部几何特征
            const eyeDistance = Math.sqrt(
                Math.pow(rightEye[0] - leftEye[0], 2) + Math.pow(rightEye[1] - leftEye[1], 2)
            );
            
            const eyeToNoseDistance = Math.sqrt(
                Math.pow((rightEye[0] + leftEye[0]) / 2 - nose[0], 2) + 
                Math.pow((rightEye[1] + leftEye[1]) / 2 - nose[1], 2)
            );
            
            const noseToMouthDistance = Math.sqrt(
                Math.pow(nose[0] - mouth[0], 2) + Math.pow(nose[1] - mouth[1], 2)
            );
            
            const faceWidth = boundingBox.bottomRight[0] - boundingBox.topLeft[0];
            const faceHeight = boundingBox.bottomRight[1] - boundingBox.topLeft[1];
            
            // 计算相对位置特征（归一化到面部尺寸）
            const features = [
                eyeDistance / faceWidth,
                eyeToNoseDistance / faceHeight,
                noseToMouthDistance / faceHeight,
                faceWidth / faceHeight, // 面部宽高比
                (rightEye[0] - boundingBox.topLeft[0]) / faceWidth, // 右眼相对位置
                (rightEye[1] - boundingBox.topLeft[1]) / faceHeight,
                (leftEye[0] - boundingBox.topLeft[0]) / faceWidth, // 左眼相对位置
                (leftEye[1] - boundingBox.topLeft[1]) / faceHeight,
                (nose[0] - boundingBox.topLeft[0]) / faceWidth, // 鼻子相对位置
                (nose[1] - boundingBox.topLeft[1]) / faceHeight,
                (mouth[0] - boundingBox.topLeft[0]) / faceWidth, // 嘴巴相对位置
                (mouth[1] - boundingBox.topLeft[1]) / faceHeight
            ];
            
            return features;
        } catch (error) {
            console.error('特征提取错误:', error);
            return null;
        }
    }

    // 移除了不再使用的MediaPipe相关辅助方法
    
    isStepCompleted() {
        const requiredSamples = 10;
        return this.faceDescriptors[this.currentStep - 1] && 
               this.faceDescriptors[this.currentStep - 1].length >= requiredSamples;
    }
    
    nextEnrollmentStep() {
        clearInterval(this.enrollmentInterval);
        clearTimeout(this.stepTimeout);
        
        if (this.currentStep < this.maxSteps) {
            this.currentStep++;
            this.updateStepIndicator();
            this.startEnrollment();
        } else {
            this.completeEnrollment();
        }
    }
    
    completeEnrollment() {
        // 保存录入的人脸数据
        const enrollmentData = {
            id: Date.now(),
            timestamp: new Date().toISOString(),
            descriptors: this.faceDescriptors
        };
        
        this.enrolledFaces.push(enrollmentData);
        localStorage.setItem('enrolledFaces', JSON.stringify(this.enrolledFaces));
        
        // 如果有当前用户，保存到用户数据中
        if (this.currentUser) {
            for (let i = 0; i < this.faceDescriptors.length; i++) {
                const stepDescriptors = this.faceDescriptors[i];
                if (stepDescriptors) {
                    for (const descriptor of stepDescriptors) {
                        this.storageManager.enrollFace(this.currentUser.id, descriptor.features, i + 1);
                    }
                }
            }
        }
        
        this.showSuccess('录入成功', '人脸信息已成功录入系统');
        this.clearDataBtn.style.display = 'inline-flex';
        
        setTimeout(() => {
            this.reset();
            this.switchMode('unlock');
        }, 3000);
    }
    
    startUnlock() {
        this.updateStatus('正在扫描人脸...', 'fas fa-search', 'scanning');
        this.livenessChecks = { blinkDetected: false, headMovement: false, faceStability: 0 };
        
        this.unlockInterval = setInterval(async () => {
            await this.processUnlock();
        }, 200);
        
        // 解锁超时
        setTimeout(() => {
            if (this.isProcessing) {
                this.showError('解锁超时', '未能在规定时间内完成身份验证');
                this.reset();
            }
        }, 15000);
    }
    
    async processUnlock() {
        if (!this.video.videoWidth) return;
        
        // 捕获当前帧
        this.ctx.drawImage(this.video, 0, 0, this.canvas.width, this.canvas.height);
        const imageData = this.ctx.getImageData(0, 0, this.canvas.width, this.canvas.height);
        
        // 检测人脸
        const faceDetected = await this.detectFace();
        
        if (faceDetected) {
            this.livenessChecks.faceStability++;
            
            // 活体检测
            if (this.performLivenessCheck(faceDetected)) {
                // 人脸比对
                const currentFeatures = this.extractFaceFeatures(faceDetected);
                if (currentFeatures) {
                    const matchResult = this.compareFaces(currentFeatures);
                
                    if (matchResult.isMatch && matchResult.confidence > 0.7) {
                        this.completeUnlock(true, matchResult.confidence);
                    } else if (this.livenessChecks.faceStability > 50) {
                        this.completeUnlock(false, matchResult.confidence);
                    }
                }
            }
        } else {
            this.livenessChecks.faceStability = Math.max(0, this.livenessChecks.faceStability - 2);
        }
        
        this.updateStatus(`正在验证身份... (${Math.min(100, this.livenessChecks.faceStability * 2)}%)`, 'fas fa-search', 'scanning');
    }
    
    performLivenessCheck(faceData) {
        if (!faceData || !faceData.landmarks) {
            return false;
        }
        
        // 更新帧计数器
        this.frameCounter++;
        
        // 检测头部姿态变化
        const headPose = this.calculateHeadPose(faceData.landmarks);
        this.updateHeadPoseHistory(headPose);
        
        // 检测眨眼
        const eyeAspectRatio = this.calculateEyeAspectRatio(faceData.landmarks);
        this.detectBlink(eyeAspectRatio);
        
        // 计算活体检测分数
        this.livenessScore = this.calculateLivenessScore();
        
        // 更新活体检测状态
        this.updateLivenessChecks();
        
        console.log('活体检测分数:', this.livenessScore.toFixed(2));
        return this.livenessScore > 0.7;
    }
    
    calculateHeadPose(landmarks) {
        if (!landmarks || landmarks.length < 6) {
            return { pitch: 0, yaw: 0, roll: 0 };
        }
        
        // BlazeFace关键点: [右眼, 左眼, 鼻尖, 嘴巴, 右耳, 左耳]
        const [rightEye, leftEye, nose, mouth] = landmarks;
        
        // 计算偏航角 (Yaw) - 左右转头
        const eyeCenterX = (leftEye[0] + rightEye[0]) / 2;
        const yaw = Math.atan2(nose[0] - eyeCenterX, 100) * 180 / Math.PI;
        
        // 计算俯仰角 (Pitch) - 上下点头
        const eyeCenterY = (leftEye[1] + rightEye[1]) / 2;
        const pitch = Math.atan2(mouth[1] - eyeCenterY, nose[1] - eyeCenterY) * 180 / Math.PI;
        
        // 计算翻滚角 (Roll) - 左右倾斜
        const roll = Math.atan2(rightEye[1] - leftEye[1], rightEye[0] - leftEye[0]) * 180 / Math.PI;
        
        return { pitch, yaw, roll };
    }
    
    updateHeadPoseHistory(headPose) {
        this.headPoseHistory.push(headPose);
        if (this.headPoseHistory.length > 30) {
            this.headPoseHistory.shift();
        }
    }
    
    calculateLivenessScore() {
        let score = 0;
        
        // 眨眼检测分数 (40%)
        const blinkScore = Math.min(this.blinkCounter / 3, 1) * 0.4;
        score += blinkScore;
        
        // 头部姿态变化分数 (35%)
        const poseScore = this.calculatePoseVariationScore() * 0.35;
        score += poseScore;
        
        // 面部稳定性分数 (25%)
        const stabilityScore = Math.min(this.frameCounter / 60, 1) * 0.25;
        score += stabilityScore;
        
        return Math.min(score, 1);
    }
    
    calculatePoseVariationScore() {
        if (this.headPoseHistory.length < 10) {
            return 0;
        }
        
        // 计算姿态变化的标准差
        const rollVariance = this.calculateVariance(this.headPoseHistory.map(p => p.roll));
        const yawVariance = this.calculateVariance(this.headPoseHistory.map(p => p.yaw));
        const pitchVariance = this.calculateVariance(this.headPoseHistory.map(p => p.pitch));
        
        // 适度的变化表明是真人
        const totalVariance = rollVariance + yawVariance + pitchVariance;
        return Math.min(totalVariance / 100, 1); // 归一化到0-1
    }
    
    calculateVariance(values) {
        const mean = values.reduce((sum, val) => sum + val, 0) / values.length;
        const variance = values.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / values.length;
        return Math.sqrt(variance);
    }
    
    updateLivenessChecks() {
        this.livenessChecks.blinkDetected = this.blinkCounter > 0;
        this.livenessChecks.headMovement = this.headPoseHistory.length > 5;
        this.livenessChecks.faceStability = this.frameCounter;
    }
    
    calculateAverageBrightness(imageData) {
        const data = imageData.data;
        let totalBrightness = 0;
        
        for (let i = 0; i < data.length; i += 4) {
            const brightness = (data[i] + data[i + 1] + data[i + 2]) / 3;
            totalBrightness += brightness;
        }
        
        return totalBrightness / (data.length / 4);
    }
    
    compareFaces(currentFeatures) {
        // 如果有当前用户，使用storageManager进行验证
        if (this.currentUser) {
            const result = this.storageManager.verifyFace(this.currentUser.id, currentFeatures);
            return {
                isMatch: result.success,
                confidence: result.confidence || 0
            };
        }
        
        // 兼容旧的本地存储方式
        if (this.enrolledFaces.length === 0) {
            return { isMatch: false, confidence: 0 };
        }
        
        let bestMatch = { isMatch: false, confidence: 0 };
        
        for (const enrolledFace of this.enrolledFaces) {
            for (const stepDescriptors of enrolledFace.descriptors) {
                if (stepDescriptors) {
                    for (const descriptor of stepDescriptors) {
                        const similarity = this.calculateAdvancedSimilarity(currentFeatures, descriptor.features);
                        if (similarity > bestMatch.confidence) {
                            bestMatch = {
                                isMatch: similarity > 0.75,
                                confidence: similarity
                            };
                        }
                    }
                }
            }
        }
        
        return bestMatch;
    }
    
    calculateAdvancedSimilarity(features1, features2) {
        if (!features1 || !features2 || features1.length !== features2.length) {
            return 0;
        }
        
        // 使用多种相似度度量的加权组合
        const cosineSim = this.calculateCosineSimilarity(features1, features2);
        const euclideanSim = this.calculateEuclideanSimilarity(features1, features2);
        const pearsonSim = this.calculatePearsonSimilarity(features1, features2);
        
        // 加权平均（余弦相似度权重最高）
        return 0.5 * cosineSim + 0.3 * euclideanSim + 0.2 * pearsonSim;
    }
    
    calculateCosineSimilarity(features1, features2) {
        let dotProduct = 0;
        let norm1 = 0;
        let norm2 = 0;
        
        for (let i = 0; i < features1.length; i++) {
            dotProduct += features1[i] * features2[i];
            norm1 += features1[i] * features1[i];
            norm2 += features2[i] * features2[i];
        }
        
        if (norm1 === 0 || norm2 === 0) {
            return 0;
        }
        
        return Math.max(0, dotProduct / (Math.sqrt(norm1) * Math.sqrt(norm2)));
    }
    
    calculateEuclideanSimilarity(features1, features2) {
        let sumSquaredDiff = 0;
        
        for (let i = 0; i < features1.length; i++) {
            const diff = features1[i] - features2[i];
            sumSquaredDiff += diff * diff;
        }
        
        const euclideanDistance = Math.sqrt(sumSquaredDiff);
        // 转换为相似度（距离越小，相似度越高）
        return Math.max(0, 1 / (1 + euclideanDistance));
    }
    
    calculatePearsonSimilarity(features1, features2) {
        const n = features1.length;
        
        // 计算均值
        const mean1 = features1.reduce((sum, val) => sum + val, 0) / n;
        const mean2 = features2.reduce((sum, val) => sum + val, 0) / n;
        
        let numerator = 0;
        let sumSq1 = 0;
        let sumSq2 = 0;
        
        for (let i = 0; i < n; i++) {
            const diff1 = features1[i] - mean1;
            const diff2 = features2[i] - mean2;
            
            numerator += diff1 * diff2;
            sumSq1 += diff1 * diff1;
            sumSq2 += diff2 * diff2;
        }
        
        const denominator = Math.sqrt(sumSq1 * sumSq2);
        
        if (denominator === 0) {
            return 0;
        }
        
        const correlation = numerator / denominator;
        // 将相关系数转换为0-1范围的相似度
        return Math.max(0, (correlation + 1) / 2);
    }
    
    completeUnlock(success, confidence) {
        clearInterval(this.unlockInterval);
        this.isProcessing = false;
        
        if (success) {
            this.showSuccess('解锁成功', `身份验证通过 (置信度: ${(confidence * 100).toFixed(1)}%)`);
            this.playSuccessSound();
        } else {
            this.showError('解锁失败', '身份验证失败，请重试');
        }
        
        setTimeout(() => {
            this.reset();
        }, 3000);
    }
    
    showSuccess(title, message) {
        this.updateStatus('验证成功！', 'fas fa-check-circle', 'success');
        this.resultSection.style.display = 'block';
        this.resultSection.className = 'result-section success';
        this.resultIcon.innerHTML = '<i class="fas fa-check-circle"></i>';
        this.resultTitle.textContent = title;
        this.resultMessage.textContent = message;
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
        this.statusIndicator.className = `status-indicator ${type}`;
    }
    
    playSuccessSound() {
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
    
    clearStoredData() {
        if (confirm('确定要清除所有录入的人脸数据吗？')) {
            localStorage.removeItem('enrolledFaces');
            this.enrolledFaces = [];
            
            // 如果有当前用户，也清除用户的人脸数据
            if (this.currentUser) {
                const data = this.storageManager.getData();
                data.faceData = data.faceData.filter(f => f.userId !== this.currentUser.id);
                this.storageManager.saveData(data);
            }
            
            this.clearDataBtn.style.display = 'none';
            this.showSuccess('数据清除成功', '所有人脸数据已清除');
            setTimeout(() => {
                this.reset();
                this.switchMode('enroll');
            }, 2000);
        }
    }
    
    reset() {
        this.isProcessing = false;
        this.currentStep = 1;
        this.faceDescriptors = [];
        this.lastBrightness = null;
        
        // 清理定时器
        if (this.enrollmentInterval) {
            clearInterval(this.enrollmentInterval);
            this.enrollmentInterval = null;
        }
        if (this.unlockInterval) {
            clearInterval(this.unlockInterval);
            this.unlockInterval = null;
        }
        if (this.stepTimeout) {
            clearTimeout(this.stepTimeout);
            this.stepTimeout = null;
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
        this.modeSelector.style.display = 'flex';
        
        this.updateStatus('准备开始', 'fas fa-camera');
        this.updateStepIndicator();
    }
    
    destroy() {
        this.reset();
        // 清理事件监听器
        this.startBtn.removeEventListener('click', this.startProcess);
        this.resetBtn.removeEventListener('click', this.reset);
        this.clearDataBtn.removeEventListener('click', this.clearStoredData);
        this.enrollBtn.removeEventListener('click', () => this.switchMode('enroll'));
        this.unlockBtn.removeEventListener('click', () => this.switchMode('unlock'));
    }
}

class LocalStorageManager {
    constructor() {
        this.storageKey = 'faceRecognitionData';
        this.initializeStorage();
    }

    initializeStorage() {
        if (!localStorage.getItem(this.storageKey)) {
            const initialData = {
                users: [],
                currentUser: null,
                faceData: [],
                verificationLogs: []
            };
            localStorage.setItem(this.storageKey, JSON.stringify(initialData));
        }
    }

    getData() {
        return JSON.parse(localStorage.getItem(this.storageKey));
    }

    saveData(data) {
        localStorage.setItem(this.storageKey, JSON.stringify(data));
    }

    registerUser(username, email, password) {
        const data = this.getData();
        
        // 检查用户是否已存在
        const existingUser = data.users.find(u => u.username === username || u.email === email);
        if (existingUser) {
            return { error: '用户名或邮箱已存在' };
        }

        // 创建新用户
        const newUser = {
            id: Date.now(),
            username,
            email,
            password: this.hashPassword(password),
            createdAt: new Date().toISOString(),
            isActive: true
        };

        data.users.push(newUser);
        this.saveData(data);
        
        return { 
            message: '用户注册成功',
            user_id: newUser.id,
            username: newUser.username
        };
    }

    loginUser(username, password) {
        const data = this.getData();
        const hashedPassword = this.hashPassword(password);
        
        const user = data.users.find(u => 
            u.username === username && u.password === hashedPassword && u.isActive
        );

        if (!user) {
            return { error: '用户名或密码错误' };
        }

        // 设置当前用户
        data.currentUser = {
            id: user.id,
            username: user.username,
            email: user.email
        };
        this.saveData(data);

        return {
            message: '登录成功',
            user: data.currentUser
        };
    }

    enrollFace(userId, features, step) {
        const data = this.getData();
        
        const faceRecord = {
            id: Date.now(),
            userId,
            features,
            step,
            createdAt: new Date().toISOString()
        };

        data.faceData.push(faceRecord);
        this.saveData(data);

        return {
            message: '人脸数据录入成功',
            face_id: faceRecord.id,
            step
        };
    }

    verifyFace(userId, features) {
        const data = this.getData();
        
        // 获取用户的人脸数据
        const userFaceData = data.faceData.filter(f => f.userId === userId);
        
        if (userFaceData.length === 0) {
            return { error: '未找到用户的人脸数据' };
        }

        // 计算相似度
        let maxSimilarity = 0;
        for (const faceRecord of userFaceData) {
            const similarity = this.calculateSimilarity(features, faceRecord.features);
            maxSimilarity = Math.max(maxSimilarity, similarity);
        }

        const threshold = 0.75;
        const isMatch = maxSimilarity >= threshold;

        // 记录验证日志
        const logRecord = {
            id: Date.now(),
            userId,
            type: 'face_unlock',
            success: isMatch,
            confidence: maxSimilarity,
            timestamp: new Date().toISOString()
        };
        data.verificationLogs.push(logRecord);
        this.saveData(data);

        return {
            success: isMatch,
            confidence: Math.round(maxSimilarity * 10000) / 10000,
            message: isMatch ? '验证成功' : '验证失败'
        };
    }

    getCurrentUser() {
        const data = this.getData();
        return data.currentUser;
    }

    logout() {
        const data = this.getData();
        data.currentUser = null;
        this.saveData(data);
    }

    hashPassword(password) {
        // 简单的哈希函数（仅用于演示）
        let hash = 0;
        for (let i = 0; i < password.length; i++) {
            const char = password.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash; // 转换为32位整数
        }
        return hash.toString();
    }

    calculateSimilarity(features1, features2) {
        if (!features1 || !features2 || features1.length !== features2.length) {
            return 0;
        }

        // 余弦相似度
        let dotProduct = 0;
        let norm1 = 0;
        let norm2 = 0;

        for (let i = 0; i < features1.length; i++) {
            dotProduct += features1[i] * features2[i];
            norm1 += features1[i] * features1[i];
            norm2 += features2[i] * features2[i];
        }

        if (norm1 === 0 || norm2 === 0) {
            return 0;
        }

        return Math.max(0, dotProduct / (Math.sqrt(norm1) * Math.sqrt(norm2)));
    }
}

// 页面加载完成后初始化
document.addEventListener('DOMContentLoaded', () => {
    // 检查浏览器兼容性
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        alert('您的浏览器不支持摄像头访问功能，请使用现代浏览器。');
        return;
    }
    
    // 初始化人脸识别系统
    window.faceRecognitionSystem = new FaceRecognitionSystem();
});

// 页面卸载时清理资源
window.addEventListener('beforeunload', () => {
    if (window.faceRecognitionSystem) {
        window.faceRecognitionSystem.destroy();
    }
});

// 实用工具函数
const Utils = {
    isMobile() {
        return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
    },
    
    getBrowser() {
        const userAgent = navigator.userAgent;
        if (userAgent.includes('Chrome')) return 'Chrome';
        if (userAgent.includes('Firefox')) return 'Firefox';
        if (userAgent.includes('Safari')) return 'Safari';
        if (userAgent.includes('Edge')) return 'Edge';
        return 'Unknown';
    },
    
    formatTime(date = new Date()) {
        return date.toLocaleTimeString('zh-CN', {
            hour12: false,
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit'
        });
    }
};

window.Utils = Utils;